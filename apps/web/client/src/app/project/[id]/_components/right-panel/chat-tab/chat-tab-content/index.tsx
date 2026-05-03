'use client';

import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, ChatModel, LocalModelOption } from '@weblab/models';
import { CHAT_MODEL_OPTIONS, OLLAMA_DEFAULT_BASE_URL } from '@weblab/models';

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
        messages,
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
