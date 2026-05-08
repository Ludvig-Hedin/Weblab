import { type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import type { ChatMessage, ChatMetadata, ChatModel } from '@weblab/models';
import {
    addMemoriesFromConversation,
    createRootAgentStream,
    inferProviderFromModelId,
    searchMemories,
} from '@weblab/ai';
import { toDbMessage } from '@weblab/db';
import { CHAT_MODEL_OPTIONS, ChatType } from '@weblab/models';

import { api } from '@/trpc/server';
import { trackEvent } from '@/utils/analytics/server';
import {
    checkMessageLimit,
    decrementUsage,
    errorHandler,
    getSupabaseUser,
    incrementUsage,
} from './helpers';

// ollamaBaseUrl is user-supplied and may be passed to outbound HTTP calls,
// so reject anything that isn't a loopback host to prevent SSRF against
// internal services or cloud metadata endpoints.
const ALLOWED_OLLAMA_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function sanitizeOllamaBaseUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
        if (!ALLOWED_OLLAMA_HOSTNAMES.has(parsed.hostname.toLowerCase())) return undefined;
        return url;
    } catch {
        return undefined;
    }
}

// Only allow safe model name characters after the "ollama/" prefix so
// path-traversal strings like "ollama/../foo" are rejected before reaching
// the upstream Ollama HTTP API.
const OLLAMA_NAME_RE = /^[a-z0-9._:-]+$/i;

function isValidChatModel(model: string): boolean {
    if (!model.startsWith('ollama/')) return true; // OpenRouter models validated by the SDK
    const name = model.slice('ollama/'.length);
    return name.length > 0 && OLLAMA_NAME_RE.test(name);
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSupabaseUser(req);
        if (!user) {
            return new Response(
                JSON.stringify({
                    error: 'Unauthorized, no user found. Please login again.',
                    code: 401,
                }),
                {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }
        const usageCheckResult = await checkMessageLimit(req);
        if (usageCheckResult.exceeded) {
            trackEvent({
                distinctId: user.id,
                event: 'message_limit_exceeded',
                properties: {
                    usage: usageCheckResult.usage,
                },
            });
            return new Response(
                JSON.stringify({
                    error: 'Credit limit exceeded. Please upgrade to a paid plan.',
                    code: 402,
                    usage: usageCheckResult.usage,
                }),
                {
                    status: 402,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }

        return streamResponse(req, user.id);
    } catch (error: unknown) {
        console.error('Error in chat', error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                code: 500,
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            },
        );
    }
}

export const streamResponse = async (req: NextRequest, userId: string) => {
    const body = (await req.json()) as {
        messages: ChatMessage[];
        chatType: ChatType;
        conversationId: string;
        projectId: string;
        model?: ChatModel;
        ollamaBaseUrl?: string;
    };
    const { messages, chatType, conversationId, projectId } = body;

    // Launch memory search concurrently with model validation so it doesn't add latency.
    // Uses the last user message text as the search query.
    const lastUserMessageForMemory = messages.findLast((m) => m.role === 'user');
    const memoryQueryText = (lastUserMessageForMemory?.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
    const memoriesPromise = memoryQueryText
        ? searchMemories(memoryQueryText, userId, projectId)
        : Promise.resolve([]);

    const selectedModel: ChatModel = body.model ?? CHAT_MODEL_OPTIONS[0].model;
    if (!isValidChatModel(selectedModel)) {
        return new Response(JSON.stringify({ error: 'Invalid model identifier.', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const isLocalModel = selectedModel.startsWith('ollama/');

    // CLI providers (Codex, Claude Code, Gemini, OpenCode, Cursor) only run on
    // the user's machine via the desktop CLI bridge. If the renderer somehow
    // sends one of those models to the hosted /api/chat (e.g. someone running
    // hosted web with a stale model selection), refuse early. Provider-specific
    // outbound model routing has not landed yet; the DB connection check is
    // deferred until routing is actually implemented (see CODE_REVIEW_BACKLOG CR-069).
    const provider = inferProviderFromModelId(selectedModel);
    if (provider !== 'openrouter' && provider !== 'ollama') {
        return new Response(
            JSON.stringify({
                error: `Provider "${provider}" routing is not yet implemented on hosted web. Use the desktop app for CLI providers.`,
                code: 'cli_provider_routing_not_implemented',
            }),
            { status: 501, headers: { 'Content-Type': 'application/json' } },
        );
    }

    // Updating the usage record and rate limit is done here to avoid
    // abuse in the case where a single user sends many concurrent requests.
    // If the call below fails, the user will not be penalized.
    let usageRecord: {
        usageRecordId: string | undefined;
        rateLimitId: string | undefined;
    } | null = null;

    try {
        const lastUserMessage = messages.findLast((message) => message.role === 'user');
        const traceId = lastUserMessage?.id ?? uuidv4();

        // Skip usage tracking for local models — no API cost incurred
        if (chatType === ChatType.EDIT && !isLocalModel) {
            usageRecord = await incrementUsage(req, traceId);
        }
        // Await memories that were fetched concurrently above ([] on any failure)
        const memories = await memoriesPromise;
        const stream = createRootAgentStream({
            chatType,
            conversationId,
            projectId,
            userId,
            traceId,
            messages,
            model: selectedModel,
            ollamaBaseUrl: sanitizeOllamaBaseUrl(body.ollamaBaseUrl),
            memories,
        });
        return stream.toUIMessageStreamResponse<ChatMessage>({
            originalMessages: messages,
            generateMessageId: () => uuidv4(),
            messageMetadata: ({ part }) => {
                return {
                    createdAt: new Date(),
                    conversationId,
                    context: [],
                    checkpoints: [],
                    finishReason: part.type === 'finish-step' ? part.finishReason : undefined,
                    usage: part.type === 'finish-step' ? part.usage : undefined,
                } satisfies ChatMetadata;
            },
            onFinish: async ({ messages: finalMessages }) => {
                const messagesToStore = finalMessages
                    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
                    .map((msg) => toDbMessage(msg, conversationId));

                await api.chat.message.replaceConversationMessages({
                    conversationId,
                    messages: messagesToStore,
                });

                // Fire-and-forget: extract facts and store them in Mem0.
                // Never awaited — the streaming response has already been sent.
                addMemoriesFromConversation(finalMessages, userId, projectId).catch((err) => {
                    console.warn('[mem0] Failed to store memories:', err);
                });
            },
            onError: errorHandler,
        });
    } catch (error) {
        console.error('Error in streamResponse setup', error);
        // If there was an error setting up the stream and we incremented usage, revert it
        if (usageRecord) {
            await decrementUsage(req, usageRecord);
        }
        throw error;
    }
};
