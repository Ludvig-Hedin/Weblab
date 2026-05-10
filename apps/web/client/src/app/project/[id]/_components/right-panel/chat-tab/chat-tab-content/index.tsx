'use client';

import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, ChatModel, LocalModelOption } from '@weblab/models';
import { CHAT_MODEL_OPTIONS, OLLAMA_DEFAULT_BASE_URL } from '@weblab/models';

import {
    loadAiPromptCreateModel,
    removeAiPromptCreateModel,
} from '@/components/ai-prompt-composer/create-draft';
import { api } from '@/trpc/react';
import { useChat } from '../../../../_hooks/use-chat';
import { ChatInput } from '../chat-input';
import { ChatMessages } from '../chat-messages';
import { ErrorSection } from '../error';

interface ChatTabContentProps {
    conversationId: string;
    projectId: string;
    initialMessages: ChatMessage[];
}

/** Match the human-readable size strings ollama prints itself. */
function formatBytes(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
    return `${n} B`;
}

export const ChatTabContent = ({
    conversationId,
    projectId,
    initialMessages,
}: ChatTabContentProps) => {
    const { data: userSettings } = api.user.settings.get.useQuery();

    const [model, setModel] = useState<ChatModel>(CHAT_MODEL_OPTIONS[0].model);
    const [localModels, setLocalModels] = useState<LocalModelOption[]>([]);
    const [localModelsLoading, setLocalModelsLoading] = useState(true);

    // Track whether the user has explicitly changed the model this session
    const userChangedModel = useRef(false);

    // Apply saved default model once settings load (if user hasn't changed it yet)
    useEffect(() => {
        if (!userChangedModel.current && userSettings?.chat.defaultModel) {
            setModel(userSettings.chat.defaultModel as ChatModel);
        }
    }, [userSettings?.chat.defaultModel]);

    // One-shot handoff from the create-project surface: if the user picked a
    // model on the hero or /projects/new before opening this editor, consume
    // and clear it on first mount so it overrides the saved default for this
    // session. The hero writes the key on every picker change, so the most
    // recent choice wins.
    useEffect(() => {
        let cancelled = false;
        void loadAiPromptCreateModel().then((handoff) => {
            if (cancelled || !handoff) return;
            userChangedModel.current = true;
            setModel(handoff as ChatModel);
            void removeAiPromptCreateModel();
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Fetch available local Ollama models.
    //
    // Two probe paths, server first then browser fallback:
    //   1. Server-side `/api/models/local` — works in self-hosted / desktop /
    //      `bun dev` setups where the Next.js server runs on the same machine
    //      as Ollama and can reach 127.0.0.1:11434.
    //   2. Browser fallback — when (1) returns empty / fails (e.g. hosted
    //      web on weblab.build can't reach the user's localhost), the user's
    //      browser CAN reach their own localhost. Hit it directly. Ollama
    //      enables CORS by default since v0.1.32; older versions may need
    //      `OLLAMA_ORIGINS=*` exported. Errors are swallowed silently —
    //      empty list is a valid "Ollama not running" answer.
    useEffect(() => {
        const baseUrl = userSettings?.chat.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL;
        const params = new URLSearchParams({ baseUrl });
        const controller = new AbortController();
        setLocalModelsLoading(true);

        const probeBrowser = async (): Promise<LocalModelOption[]> => {
            try {
                const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
                    signal: controller.signal,
                });
                if (!res.ok) return [];
                const data = (await res.json()) as {
                    models?: Array<{ name?: string; size?: number }>;
                };
                return (data.models ?? [])
                    .filter((m): m is { name: string; size?: number } => typeof m.name === 'string')
                    .map((m) => ({
                        label: m.name,
                        model: `ollama/${m.name}` as `ollama/${string}`,
                        size: typeof m.size === 'number' ? formatBytes(m.size) : undefined,
                    }));
            } catch {
                return [];
            }
        };

        fetch(`/api/models/local?${params.toString()}`, { signal: controller.signal })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return (await r.json()) as { available: boolean; models: LocalModelOption[] };
            })
            .then(async (data) => {
                if (data.models && data.models.length > 0) {
                    setLocalModels(data.models);
                    return;
                }
                // Server probe found nothing — try direct browser probe.
                setLocalModels(await probeBrowser());
            })
            .catch(async (err) => {
                if (err instanceof Error && err.name === 'AbortError') return;
                setLocalModels(await probeBrowser());
            })
            .finally(() => setLocalModelsLoading(false));
        return () => controller.abort();
    }, [userSettings?.chat.ollamaBaseUrl]);

    const ollamaBaseUrl = userSettings?.chat.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL;

    const {
        isStreaming,
        sendMessage,
        editMessage,
        regenerateLastAssistant,
        messages,
        setMessages,
        error,
        stop,
        queuedMessages,
        removeFromQueue,
    } = useChat({
        conversationId,
        projectId,
        initialMessages,
        model,
        ollamaBaseUrl,
    });

    // `useAiChat` snapshots `initialMessages` once on mount and never re-syncs
    // when the underlying tRPC query refetches. Without this effect, AI streams
    // that completed in another tab/window while this tab was backgrounded
    // would never appear here. When the query refetches (e.g. on window focus
    // — see `refetchOnWindowFocus: true` in the parent `ChatTab`), merge the
    // freshly-fetched messages into the live `useChat` state.
    //
    // Guards:
    //  - Skip while streaming so we don't clobber the in-progress assistant
    //    message with a stale server snapshot.
    //  - Skip if the server snapshot only contains messages we already have
    //    (prevents redundant rerenders and reordering).
    //  - Skip if local state has unsynced messages newer than the server
    //    snapshot (e.g. optimistic user message that hasn't been persisted
    //    yet); the next refetch after persistence will reconcile.
    const messagesRef = useRef(messages);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);
    useEffect(() => {
        if (isStreaming) return;
        if (!initialMessages) return;

        const current = messagesRef.current;
        const currentIds = new Set(current.map((m) => m.id));
        const incomingIds = new Set(initialMessages.map((m) => m.id));

        // If server has a message we don't, and we don't have any local-only
        // messages (e.g. optimistic sends), adopt the server snapshot.
        const hasNewServerMessages = initialMessages.some((m) => !currentIds.has(m.id));
        const hasLocalOnlyMessages = current.some((m) => !incomingIds.has(m.id));

        if (hasNewServerMessages && !hasLocalOnlyMessages) {
            setMessages(initialMessages);
        }
    }, [initialMessages, isStreaming, setMessages]);

    const handleModelChange = (next: ChatModel) => {
        userChangedModel.current = true;
        setModel(next);
    };

    return (
        <div className="flex h-full flex-col justify-end gap-2 pt-2">
            <ChatMessages
                messages={messages}
                isStreaming={isStreaming}
                error={error}
                onEditMessage={editMessage}
                onRegenerateLastAssistant={regenerateLastAssistant}
            />
            <ErrorSection isStreaming={isStreaming} onSendMessage={sendMessage} />
            <ChatInput
                messages={messages}
                isStreaming={isStreaming}
                onStop={stop}
                onSendMessage={sendMessage}
                queuedMessages={queuedMessages}
                removeFromQueue={removeFromQueue}
                model={model}
                onModelChange={handleModelChange}
                localModels={localModels}
                localModelsLoading={localModelsLoading}
            />
        </div>
    );
};
