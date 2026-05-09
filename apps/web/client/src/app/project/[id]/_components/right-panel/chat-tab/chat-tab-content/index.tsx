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

    // Fetch available local Ollama models
    useEffect(() => {
        const baseUrl = userSettings?.chat.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL;
        const params = new URLSearchParams({ baseUrl });
        const controller = new AbortController();
        setLocalModelsLoading(true);
        fetch(`/api/models/local?${params.toString()}`, { signal: controller.signal })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((data: { available: boolean; models: LocalModelOption[] }) => {
                setLocalModels(data.models ?? []);
            })
            .catch((err) => {
                if (err instanceof Error && err.name === 'AbortError') return;
                setLocalModels([]);
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
