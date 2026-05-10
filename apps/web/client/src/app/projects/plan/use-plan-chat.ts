'use client';

import { useMemo, useRef, useState } from 'react';
import { useChat as useAiChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import type { ChatMessage } from '@weblab/models';
import { AskUserQuestionTool } from '@weblab/ai/client';
import { ChatType, DEFAULT_CHAT_MODEL } from '@weblab/models';

export function usePlanChat() {
    const conversationId = useRef(uuidv4()).current;
    const [isExecutingToolCall, setIsExecutingToolCall] = useState(false);
    const inflightToolCalls = useRef(0);

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: '/api/chat',
                prepareSendMessagesRequest: ({ messages, body }) => ({
                    body: {
                        conversationId,
                        chatType: ChatType.PLAN,
                        model: DEFAULT_CHAT_MODEL,
                        messages,
                        ...(body ?? {}),
                    },
                }),
            }),
        [conversationId],
    );

    const { addToolResult, sendMessage, messages, status, stop } = useAiChat<ChatMessage>({
        id: conversationId,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        transport: transport as unknown as DefaultChatTransport<ChatMessage>,
        onToolCall: async ({ toolCall }) => {
            if (toolCall.toolName !== AskUserQuestionTool.toolName) return;
            inflightToolCalls.current += 1;
            setIsExecutingToolCall(true);
            try {
                const result = await new Promise<{ answer: string }>((resolve) => {
                    AskUserQuestionTool.register(toolCall.toolCallId, resolve);
                });
                await addToolResult({
                    tool: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    output: result,
                } as Parameters<typeof addToolResult>[0]);
            } finally {
                inflightToolCalls.current = Math.max(0, inflightToolCalls.current - 1);
                if (inflightToolCalls.current === 0) setIsExecutingToolCall(false);
            }
        },
    });

    const isStreaming = status === 'streaming' || status === 'submitted' || isExecutingToolCall;

    return { messages, isStreaming, stop, conversationId, addToolResult, sendMessage };
}
