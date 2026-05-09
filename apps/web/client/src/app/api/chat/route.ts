import { type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { ChatMessage, ChatMetadata, ChatModel, ProjectFrameworkId } from '@weblab/models';
import {
    addMemoriesFromConversation,
    createRootAgentStream,
    extractInstructionText,
    inferProviderFromModelId,
    loadSkillSummaries,
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

const ChatRequestBodySchema = z.object({
    messages: z.array(z.any()).min(1),
    chatType: z.nativeEnum(ChatType),
    conversationId: z.string().min(1),
    projectId: z.string().min(1),
    model: z.string().optional(),
    ollamaBaseUrl: z.string().optional(),
});

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
    let parsedBody: z.infer<typeof ChatRequestBodySchema>;
    try {
        parsedBody = ChatRequestBodySchema.parse(await req.json());
    } catch (err) {
        return new Response(
            JSON.stringify({
                error: err instanceof Error ? err.message : 'Invalid request body',
                code: 400,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }
    const messages = parsedBody.messages as ChatMessage[];
    const { chatType, conversationId, projectId } = parsedBody;
    const body = parsedBody as Omit<z.infer<typeof ChatRequestBodySchema>, 'model'> & {
        model?: ChatModel;
    };

    // Verify project access BEFORE any work or usage increment. The
    // serverToolContext below trusts projectId to scope server-side tools, so
    // this check is the contract that makes that trust safe.
    try {
        await api.project.get({ projectId });
    } catch (err) {
        console.warn('[chat] project access denied', err);
        return new Response(JSON.stringify({ error: 'Forbidden', code: 403 }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Launch memory search concurrently with model validation so it doesn't add latency.
    // Extract only the <instruction> text from the hydrated user message — the parts
    // also contain large XML context blobs (file contents, highlights, errors) that
    // would produce terrible semantic search results if sent verbatim to Mem0.
    const lastUserMessageForMemory = messages.findLast((m) => m.role === 'user');
    const rawQueryText = (lastUserMessageForMemory?.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
    const memoryQueryText = rawQueryText ? extractInstructionText(rawQueryText) : '';
    const memoriesPromise = memoryQueryText
        ? searchMemories(memoryQueryText, userId)
        : Promise.resolve([]);
    // Fetch the project's framework concurrently with memories so the system
    // prompt can be calibrated to the actual stack (Next.js vs static HTML).
    // Project access is already verified above; the framework lookup tolerates
    // failure (falls back to the React/Next.js prompt).
    const frameworkPromise: Promise<ProjectFrameworkId | null> = api.project
        .get({ projectId })
        .then((p) => p?.metadata.runtime?.framework ?? null)
        .catch((err) => {
            console.warn('[chat] failed to read project framework, defaulting to React', err);
            return null;
        });

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
    // Guards against double-refund when both onFinish (abort) and onError
    // fire for the same request.
    let usageRefunded = false;
    const refundUsageOnce = async (reason: string) => {
        if (!usageRecord || usageRefunded) return;
        usageRefunded = true;
        try {
            await decrementUsage(req, usageRecord);
        } catch (err) {
            console.warn(`[chat] failed to refund usage (${reason})`, err);
        }
    };

    try {
        const lastUserMessage = messages.findLast((message) => message.role === 'user');
        const traceId = lastUserMessage?.id ?? uuidv4();

        // Skip usage tracking for local models — no API cost incurred
        if (chatType === ChatType.EDIT && !isLocalModel) {
            usageRecord = await incrementUsage(req, traceId);
        }
        // Await memories, framework, and skills — all kicked off concurrently
        // with model validation above. Each defaults safely on failure.
        const skillsPromise = loadSkillSummaries({
            userId,
            projectId,
            trpcCaller: api,
        }).catch((err) => {
            console.warn('[chat] failed to load Agent Skills, continuing without them', err);
            return [];
        });
        const [memories, framework, skills] = await Promise.all([
            memoriesPromise,
            frameworkPromise,
            skillsPromise,
        ]);
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
            framework,
            skills,
            abortSignal: req.signal,
            serverToolContext: {
                userId,
                projectId,
                conversationId,
                trpcCaller: api,
                messages,
            },
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
            onFinish: async ({ messages: finalMessages, isAborted, responseMessage }) => {
                const responseHasContent =
                    Array.isArray(responseMessage?.parts) &&
                    responseMessage.parts.some(
                        (p) =>
                            (p.type === 'text' && p.text.length > 0) ||
                            p.type.startsWith('tool-') ||
                            p.type === 'reasoning' ||
                            p.type === 'file',
                    );

                // If the stream aborted before any meaningful content was
                // produced, do NOT replace the conversation: the existing
                // history is the source of truth and a wholesale replace would
                // wipe it. Refund usage in the same case.
                if (isAborted || !responseHasContent) {
                    await refundUsageOnce(isAborted ? 'aborted' : 'empty_response');
                    return;
                }

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
            onError: (error) => {
                // Mid-stream errors (provider 5xx, network drop) should refund
                // the usage that was incremented up-front. errorHandler still
                // formats the error string for the client.
                void refundUsageOnce('stream_error');
                return errorHandler(error);
            },
        });
    } catch (error) {
        console.error('Error in streamResponse setup', error);
        // If there was an error setting up the stream and we incremented usage, revert it
        await refundUsageOnce('setup_error');
        throw error;
    }
};
