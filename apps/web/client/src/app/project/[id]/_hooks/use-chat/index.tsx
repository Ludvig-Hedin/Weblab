'use client';

import type { FinishReason } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat as useAiChat } from '@ai-sdk/react';
import { api } from '@convex/_generated/api';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useConvex } from 'convex/react';
import { usePostHog } from 'posthog-js/react';
import { flushSync } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';

import type {
    ChatMessage,
    ChatModel,
    GitMessageCheckpoint,
    MessageContext,
    QueuedMessage,
    ReasoningEffort,
} from '@weblab/models';
import { ChatType } from '@weblab/models';
import { jsonClone } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { handleToolCall } from '@/components/tools';
import { WeblabCliTransport } from './cli-transport';
import { OllamaWebTransport } from './ollama-web-transport';
import {
    clearStreamInFlight,
    loadQueue,
    markStreamInFlight,
    saveQueue,
    wasStreamInFlight,
} from './queue-storage';
import { RoutingChatTransport } from './routing-transport';
import { useConversationSummarizer } from './use-summarizer';
import { createCheckpointsForAllBranches, getUserChatMessageFromString } from './utils';

export type SendMessage = (content: string, type: ChatType) => Promise<ChatMessage>;
export type EditMessage = (
    messageId: string,
    newContent: string,
    type: ChatType,
) => Promise<ChatMessage>;
export type ProcessMessage = (
    content: string,
    type: ChatType,
    messageId?: string,
) => Promise<ChatMessage | void>;

interface UseChatProps {
    conversationId: string;
    projectId: string;
    initialMessages: ChatMessage[];
    model: ChatModel;
    ollamaBaseUrl?: string;
    reasoningEffort?: ReasoningEffort;
}

export function useChat({
    conversationId,
    projectId,
    initialMessages,
    model,
    ollamaBaseUrl,
    reasoningEffort,
}: UseChatProps) {
    const editorEngine = useEditorEngine();
    const posthog = usePostHog();
    const convex = useConvex();

    const [finishReason, setFinishReason] = useState<FinishReason | null>(null);
    const [isExecutingToolCall, setIsExecutingToolCall] = useState(false);
    // Counts in-flight `handleToolCall` invocations so `isExecutingToolCall`
    // only flips back to false when ALL parallel tools have settled. Without
    // this, the first tool to finish would clear the flag while siblings are
    // still mutating files.
    const inflightToolCalls = useRef(0);
    const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>(() =>
        loadQueue(conversationId),
    );
    const isProcessingQueue = useRef(false);

    // Persist on every queue mutation so reloads / conversation switches restore.
    // Lives in an effect (not inside the state updater) so React Strict Mode's
    // double-invocation of pure updaters doesn't double-write to localStorage.
    // Mounting writes the freshly-hydrated list back over itself — a single
    // idempotent write per mount, cheaper than tracking "is this the first run".
    useEffect(() => {
        saveQueue(conversationId, queuedMessages);
    }, [conversationId, queuedMessages]);

    // The selected model + ollamaBaseUrl are read via ref-backed factories so
    // the transport instance stays stable across model changes. Without this,
    // every model toggle would rebuild the transport and could orphan an
    // active stream. The HTTP transport pulls fresh values via
    // `prepareSendMessagesRequest`; RoutingChatTransport uses `getModel` for
    // its routing decision.
    const modelRef = useRef(model);
    const ollamaBaseUrlRef = useRef(ollamaBaseUrl);
    const reasoningEffortRef = useRef(reasoningEffort);
    useEffect(() => {
        modelRef.current = model;
        ollamaBaseUrlRef.current = ollamaBaseUrl;
        reasoningEffortRef.current = reasoningEffort;
    }, [model, ollamaBaseUrl, reasoningEffort]);
    const getModel = useCallback(() => modelRef.current, []);
    const getOllamaBaseUrl = useCallback(() => ollamaBaseUrlRef.current, []);

    const transport = useMemo(
        () =>
            new RoutingChatTransport(
                new DefaultChatTransport({
                    api: '/api/chat',
                    // Re-build the request body on every send so the latest
                    // model + ollamaBaseUrl ride along, even when useChat's
                    // auto-continuation (`sendAutomaticallyWhen`) doesn't
                    // pass them through per-call.
                    prepareSendMessagesRequest: ({ messages, body }) => ({
                        body: {
                            conversationId,
                            projectId,
                            model: modelRef.current,
                            ollamaBaseUrl: ollamaBaseUrlRef.current,
                            reasoningEffort: reasoningEffortRef.current,
                            messages,
                            ...(body ?? {}),
                        },
                    }),
                }) as unknown as ConstructorParameters<typeof RoutingChatTransport>[0],
                new WeblabCliTransport(getModel) as unknown as ConstructorParameters<
                    typeof RoutingChatTransport
                >[1],
                getModel,
                new OllamaWebTransport(
                    getModel,
                    getOllamaBaseUrl,
                ) as unknown as ConstructorParameters<typeof RoutingChatTransport>[3],
            ),
        // Intentionally NOT depending on `model` or `ollamaBaseUrl` — the
        // refs above keep them fresh without forcing a transport rebuild.
        [conversationId, projectId, getModel, getOllamaBaseUrl],
    );

    const { addToolResult, messages, error, stop, setMessages, regenerate, status } =
        useAiChat<ChatMessage>({
            id: 'user-chat',
            messages: initialMessages,
            sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
            transport: transport as unknown as DefaultChatTransport<ChatMessage>,
            onToolCall: async (toolCall) => {
                // Track every concurrent invocation so the spinner stays up
                // until the LAST tool finishes. Awaiting `handleToolCall` also
                // matches the SDK's `onToolCall` contract: returning a
                // pending Promise prevents auto-continuation (and the
                // attendant `tool_use without tool_result` 400) from firing
                // before every result has been written.
                inflightToolCalls.current += 1;
                setIsExecutingToolCall(true);
                try {
                    await handleToolCall(toolCall.toolCall, editorEngine, addToolResult);
                } catch (err) {
                    // Defensive net: handleToolCall already converts thrown
                    // errors into `output-error` results, but if THAT path
                    // itself fails (e.g. addToolResult rejects after the
                    // stream closed), the tool part would otherwise stay in
                    // `input-available` forever and the UI would spin
                    // indefinitely. Surface a final error result so the part
                    // transitions out of the loading state.
                    const message = err instanceof Error ? err.message : String(err);
                    try {
                        await addToolResult({
                            state: 'output-error',
                            tool: toolCall.toolCall.toolName,
                            toolCallId: toolCall.toolCall.toolCallId,
                            errorText: message,
                        });
                    } catch {
                        // Stream is gone — nothing else we can do client-side.
                        console.warn('[chat] tool result write failed after error', err);
                    }
                } finally {
                    inflightToolCalls.current = Math.max(0, inflightToolCalls.current - 1);
                    if (inflightToolCalls.current === 0) {
                        setIsExecutingToolCall(false);
                    }
                }
            },
            onFinish: ({ message }) => {
                const finishReason = message.metadata?.finishReason;
                setFinishReason(finishReason ?? null);
            },
        });

    const isStreaming = status === 'streaming' || status === 'submitted' || isExecutingToolCall;

    useEffect(() => {
        editorEngine.chat.setIsStreaming(isStreaming);
    }, [editorEngine.chat, isStreaming]);

    // Background summarizer: when history exceeds 50% of the model's context
    // window, fire a request to /api/chat/summarize so the next turn ships a
    // compact summary instead of the full transcript. Trigger keys on message
    // count, not array reference — so it runs once per turn (not per token)
    // and covers both "while streaming" and "while user is typing" windows.
    useConversationSummarizer({ conversationId, messages, model });

    // Persist in-flight flag so a page reload can detect an interrupted stream
    // and auto-regenerate instead of silently leaving an incomplete response.
    useEffect(() => {
        if (status === 'streaming' || status === 'submitted') {
            markStreamInFlight(conversationId);
        } else {
            clearStreamInFlight(conversationId);
        }
    }, [status, conversationId]);

    // Store messages in a ref to avoid re-rendering sendMessage/editMessage
    const messagesRef = useRef(messages);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const processMessage = useCallback(
        async (content: string, type: ChatType, context?: MessageContext[]) => {
            const messageContext =
                context || (await editorEngine.chat.context.getContextByChatType(type));
            const newMessage = getUserChatMessageFromString(
                content,
                messageContext,
                conversationId,
            );
            const nextMessages = jsonClone([...messagesRef.current, newMessage]);

            flushSync(() => {
                setMessages(nextMessages);
            });
            messagesRef.current = nextMessages;

            void regenerate({
                body: {
                    chatType: type,
                    conversationId,
                    context: messageContext,
                    model,
                    ollamaBaseUrl,
                    reasoningEffort,
                },
            });
            void editorEngine.chat.conversation.generateTitle(content);
            return newMessage;
        },
        [
            editorEngine.chat.context,
            editorEngine.chat.conversation,
            messagesRef,
            setMessages,
            regenerate,
            conversationId,
            model,
            ollamaBaseUrl,
            reasoningEffort,
        ],
    );

    const sendMessage: SendMessage = useCallback(
        async (content: string, type: ChatType) => {
            posthog.capture('user_send_message', { type });

            const context = await editorEngine.chat.context.getContextByChatType(type);

            const newMessage: QueuedMessage = {
                id: uuidv4(),
                content,
                type,
                timestamp: new Date(),
                context,
            };

            // Snapshot images on this message and clear from live context so
            // subsequent sends start clean. Without this, queueing a second
            // message during streaming silently re-attaches the previous
            // images.
            editorEngine.chat.context.clearImagesFromContext();

            if (isStreaming) {
                // AI is running - add to bottom of queue (normal queueing)
                setQueuedMessages((prev) => [...prev, newMessage]);
            } else if (queuedMessages.length > 0) {
                // AI is stopped but there are queued messages - add to top of queue (priority)
                setQueuedMessages((prev) => [newMessage, ...prev]);
            } else {
                // No queue and not streaming - send immediately
                return processMessage(content, type);
            }

            return getUserChatMessageFromString(content, [], conversationId);
        },
        [
            processMessage,
            posthog,
            editorEngine.chat.context,
            isStreaming,
            queuedMessages.length,
            conversationId,
        ],
    );

    const processMessageEdit = useCallback(
        async (messageId: string, newContent: string, chatType: ChatType) => {
            const messageIndex = messagesRef.current.findIndex((m) => m.id === messageId);
            const message = messagesRef.current[messageIndex];

            if (messageIndex === -1 || message?.role !== 'user') {
                throw new Error('Message not found.');
            }

            const updatedMessages = messagesRef.current.slice(0, messageIndex);

            // For resubmitted messages, we want to keep the previous context and refresh if possible
            const previousContext = message.metadata?.context ?? [];
            const updatedContext =
                await editorEngine.chat.context.getRefreshedContext(previousContext);

            message.metadata = {
                ...message.metadata,
                context: updatedContext,
                conversationId,
                createdAt: message.metadata?.createdAt ?? new Date(),
                checkpoints: message.metadata?.checkpoints ?? [],
            };
            message.parts = [{ type: 'text', text: newContent }];

            setMessages(jsonClone([...updatedMessages, message]));

            void regenerate({
                body: {
                    chatType,
                    conversationId,
                    model,
                    ollamaBaseUrl,
                    reasoningEffort,
                },
            });

            return message;
        },
        [
            editorEngine.chat.context,
            regenerate,
            conversationId,
            setMessages,
            model,
            ollamaBaseUrl,
            reasoningEffort,
        ],
    );

    const removeFromQueue = useCallback((id: string) => {
        setQueuedMessages((prev) => prev.filter((msg) => msg.id !== id));
    }, []);

    const editQueuedMessage = useCallback((id: string, newContent: string) => {
        const trimmed = newContent.trim();
        if (!trimmed) return;
        setQueuedMessages((prev) =>
            prev.map((msg) => (msg.id === id ? { ...msg, content: trimmed } : msg)),
        );
    }, []);

    const moveQueuedMessage = useCallback((id: string, direction: 'up' | 'down') => {
        setQueuedMessages((prev) => {
            const index = prev.findIndex((msg) => msg.id === id);
            if (index === -1) return prev;
            const target = direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            const tmp = next[index]!;
            next[index] = next[target]!;
            next[target] = tmp;
            return next;
        });
    }, []);

    const reorderQueuedMessages = useCallback(
        (sourceId: string, targetId: string, position: 'before' | 'after' = 'before') => {
            if (sourceId === targetId) return;
            setQueuedMessages((prev) => {
                const sourceIndex = prev.findIndex((msg) => msg.id === sourceId);
                const targetIndex = prev.findIndex((msg) => msg.id === targetId);
                if (sourceIndex === -1 || targetIndex === -1) return prev;

                // Resolve absolute insertion index in the pre-removal list, then
                // adjust by one when the source sits to the left of the target —
                // the splice that pulls source out shifts everything after it left.
                let insertAt = position === 'after' ? targetIndex + 1 : targetIndex;
                if (sourceIndex < insertAt) insertAt -= 1;
                if (insertAt === sourceIndex) return prev;

                const next = [...prev];
                const [moved] = next.splice(sourceIndex, 1);
                if (!moved) return prev;
                next.splice(insertAt, 0, moved);
                return next;
            });
        },
        [],
    );

    const processNextInQueue = useCallback(async () => {
        if (isProcessingQueue.current || isStreaming || queuedMessages.length === 0) return;

        const nextMessage = queuedMessages[0];
        if (!nextMessage) return;

        isProcessingQueue.current = true;

        try {
            const refreshedContext = await editorEngine.chat.context.getRefreshedContext(
                nextMessage.context,
            );
            await processMessage(nextMessage.content, nextMessage.type, refreshedContext);

            // Remove by id, not position — user may prepend a new message in
            // the microtask window between processMessage returning and this
            // setter running, which would otherwise drop the wrong entry.
            setQueuedMessages((prev) => prev.filter((m) => m.id !== nextMessage.id));
        } catch (error) {
            console.error('Failed to process queued message:', error);
        } finally {
            isProcessingQueue.current = false;
        }
    }, [queuedMessages, editorEngine.chat.context, processMessage, isStreaming]);

    const editMessage: EditMessage = useCallback(
        async (messageId: string, newContent: string, chatType: ChatType) => {
            posthog.capture('user_edit_message', { type: ChatType.EDIT });

            if (isStreaming) {
                // Stop current streaming immediately
                stop();

                // Process edit with immediate priority (higher than queue)
                const context = await editorEngine.chat.context.getContextByChatType(chatType);
                return await processMessageEdit(messageId, newContent, chatType);
            }

            // Normal edit processing when not streaming
            return processMessageEdit(messageId, newContent, chatType);
        },
        [processMessageEdit, posthog, isStreaming, stop, editorEngine.chat.context],
    );

    // Manual recovery affordance for streams that were interrupted (e.g. tab
    // closed mid-response). The AI SDK's `regenerate()` discards the latest
    // assistant turn and re-asks against the previous user message — that's a
    // full retry, not a true "continue from where we left off". The button
    // surfaced for this should therefore be labelled "Regenerate" so the user
    // knows their partial reply will be replaced.
    const regenerateLastAssistant = useCallback(async () => {
        if (isStreaming) return;
        posthog.capture('user_regenerate_last_assistant');
        await regenerate({
            body: {
                chatType: ChatType.EDIT,
                conversationId,
                model,
                ollamaBaseUrl,
                reasoningEffort,
            },
        });
    }, [isStreaming, posthog, regenerate, conversationId, model, ollamaBaseUrl, reasoningEffort]);

    // Auto-regenerate on mount if the stream was interrupted by a page reload.
    // Runs once after the first render; the flag is already cleared by the
    // status effect above once the new stream settles. Guards:
    //   - messages must be hydrated (length > 0) so regen targets a real turn,
    //   - status must be settled (status === 'ready') so we don't stomp on an
    //     in-flight stream that some other init path already kicked off.
    const autoRegenAttemptedRef = useRef(false);
    useEffect(() => {
        if (autoRegenAttemptedRef.current) return;
        if (!wasStreamInFlight(conversationId)) return;
        if (messages.length === 0) return;
        if (status !== 'ready') return;
        autoRegenAttemptedRef.current = true;
        clearStreamInFlight(conversationId);
        const t = setTimeout(() => {
            void regenerateLastAssistant();
        }, 800);
        return () => clearTimeout(t);
    }, [conversationId, messages.length, status, regenerateLastAssistant]);

    // Listen for the global "retry stalled tool" event dispatched by
    // ToolCallSimple. Surgical retry: re-run only the stalled tool — not the
    // whole assistant turn — so the model's reasoning and any sibling tool
    // results are preserved. The `addToolResult` write reconciles the part
    // state from `input-available` to `output-available` / `output-error`,
    // and the SDK's `sendAutomaticallyWhen` continues the conversation from
    // there.
    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (
                event as CustomEvent<{
                    toolCallId: string;
                    toolName: string;
                    input: unknown;
                }>
            ).detail;
            if (!detail?.toolCallId || !detail.toolName) return;
            inflightToolCalls.current += 1;
            setIsExecutingToolCall(true);
            void (async () => {
                try {
                    await handleToolCall(
                        {
                            toolCallId: detail.toolCallId,
                            toolName: detail.toolName,
                            input: detail.input,
                        } as Parameters<typeof handleToolCall>[0],
                        editorEngine,
                        addToolResult,
                    );
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    try {
                        await addToolResult({
                            state: 'output-error',
                            tool: detail.toolName,
                            toolCallId: detail.toolCallId,
                            errorText: message,
                        });
                    } catch {
                        console.warn('[chat] retry tool result write failed', err);
                    }
                } finally {
                    inflightToolCalls.current = Math.max(0, inflightToolCalls.current - 1);
                    if (inflightToolCalls.current === 0) {
                        setIsExecutingToolCall(false);
                    }
                }
            })();
        };
        window.addEventListener('weblab:chat-retry-tool', handler as EventListener);
        return () => window.removeEventListener('weblab:chat-retry-tool', handler as EventListener);
    }, [addToolResult, editorEngine]);

    useEffect(() => {
        // Actions to handle when the chat is finished
        if (finishReason && finishReason !== 'tool-calls') {
            setFinishReason(null);

            const applyCommit = async () => {
                const lastUserMessage = messagesRef.current.findLast((m) => m.role === 'user');

                if (!lastUserMessage) {
                    return;
                }

                const content = lastUserMessage.parts
                    .map((p) => {
                        if (p.type === 'text') {
                            return p.text;
                        }
                        return '';
                    })
                    .join('');

                if (!content) {
                    return;
                }

                // Create checkpoints for all branches
                const checkpoints = await createCheckpointsForAllBranches(editorEngine, content);

                if (checkpoints.length === 0) {
                    return;
                }

                // Update message with all checkpoints
                const oldCheckpoints =
                    lastUserMessage.metadata?.checkpoints.map((checkpoint) => ({
                        ...checkpoint,
                        createdAt: new Date(checkpoint.createdAt),
                    })) ?? [];

                lastUserMessage.metadata = {
                    ...lastUserMessage.metadata,
                    createdAt: lastUserMessage.metadata?.createdAt ?? new Date(),
                    conversationId,
                    checkpoints: [...oldCheckpoints, ...checkpoints],
                    context: lastUserMessage.metadata?.context ?? [],
                };

                // Save checkpoints to database (filter out legacy checkpoints without branchId)
                const checkpointsWithBranchId = [...oldCheckpoints, ...checkpoints].filter(
                    (cp): cp is GitMessageCheckpoint & { branchId: string } => !!cp.branchId,
                );
                void convex.mutation(api.messages.updateCheckpoints, {
                    messageId: lastUserMessage.id as Id<'messages'>,
                    checkpoints: checkpointsWithBranchId.map((cp) => ({
                        type: cp.type,
                        oid: cp.oid,
                        branchId: cp.branchId,
                        createdAt:
                            cp.createdAt instanceof Date
                                ? cp.createdAt.getTime()
                                : Number(cp.createdAt),
                    })),
                });

                setMessages(
                    jsonClone(
                        messagesRef.current.map((m) =>
                            m.id === lastUserMessage.id ? lastUserMessage : m,
                        ),
                    ),
                );
            };

            const cleanupContext = async () => {
                await editorEngine.chat.context.clearImagesFromContext();
            };

            const processNextQueuedMessage = async () => {
                if (finishReason !== 'stop') {
                    return;
                }
                if (queuedMessages.length > 0) {
                    setTimeout(processNextInQueue, 500);
                }
            };

            void cleanupContext();
            void applyCommit();
            void processNextQueuedMessage();
        }
    }, [finishReason, conversationId, queuedMessages.length, processNextInQueue]);

    useEffect(() => {
        editorEngine.chat.conversation.setConversationLength(messages.length);
    }, [messages.length, editorEngine.chat.conversation]);

    useEffect(() => {
        editorEngine.chat.setChatActions(sendMessage);
    }, [editorEngine.chat, sendMessage]);

    // Stop any in-flight stream on unmount. ChatTab uses `key={conversationId}`
    // to force-remount when the user switches conversations, so this fires
    // for both tab teardown and conversation switching — preventing an
    // orphaned upstream LLM stream (which keeps consuming usage credits)
    // from outliving the UI it was painting into.
    useEffect(() => {
        return () => {
            try {
                stop();
            } catch {
                // stop() is a no-op if the stream has already settled — ignore.
            }
        };
    }, [stop]);

    return {
        status,
        sendMessage,
        editMessage,
        regenerateLastAssistant,
        messages,
        setMessages,
        error,
        stop,
        isStreaming,
        queuedMessages,
        removeFromQueue,
        editQueuedMessage,
        moveQueuedMessage,
        reorderQueuedMessages,
    };
}
