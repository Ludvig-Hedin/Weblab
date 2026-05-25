import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { UserTier } from '@weblab/ai';
import type {
    ChatMessage,
    ChatMetadata,
    ChatModel,
    ChatProviderMetadata,
    ProjectFrameworkId,
} from '@weblab/models';
import {
    addMemoriesFromConversation,
    AUTO_MODEL_ID,
    buildChatRequest,
    extractInstructionText,
    inferProviderFromModelId,
    prePlanToolset,
    searchMemories,
} from '@weblab/ai';
import { loadSkillSummaries } from '@weblab/ai/server';
import { toDbMessage } from '@weblab/db';
import { CHAT_MODEL_OPTIONS, ChatType } from '@weblab/models';

import type { Id } from '../../../../convex/_generated/dataModel';
import { trackEvent } from '@/utils/analytics/server';
import {
    checkMessageLimit,
    decrementUsage,
    errorHandler,
    getSupabaseUser,
    incrementUsage,
} from './helpers';

const getConvexToken = async (): Promise<string | undefined> => {
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    return token ?? undefined;
};

// Convex-backed replacement for the legacy tRPC caller that @weblab/ai server
// tools (get/update_project_settings) and the Agent Skills registry expect.
// packages/ai stays Convex-agnostic — it casts `trpcCaller` to a small
// caller-shaped interface and calls `.query`/`.mutate`. We satisfy that shape
// here, where the per-request Convex auth token lives. All calls carry the
// caller's token, so Convex's requireCap enforces project ownership server-side.
const buildConvexToolCaller = (token: string | undefined) => ({
    project: {
        settings: {
            get: {
                query: ({ projectId }: { projectId: string }) =>
                    fetchQuery(
                        api.projectSettings.get,
                        { projectId: projectId as Id<'projects'> },
                        { token },
                    ),
            },
            upsert: {
                mutate: async ({
                    settings,
                }: {
                    projectId: string;
                    settings: {
                        projectId: string;
                        runCommand?: string;
                        buildCommand?: string;
                        installCommand?: string;
                    };
                }) => {
                    const pid = settings.projectId as Id<'projects'>;
                    const current = await fetchQuery(
                        api.projectSettings.get,
                        { projectId: pid },
                        { token },
                    );
                    return fetchMutation(
                        api.projectSettings.upsert,
                        {
                            projectId: pid,
                            runCommand: settings.runCommand ?? current?.runCommand ?? '',
                            buildCommand: settings.buildCommand ?? current?.buildCommand ?? '',
                            installCommand:
                                settings.installCommand ?? current?.installCommand ?? '',
                        },
                        { token },
                    );
                },
            },
        },
    },
    skills: {
        list: {
            query: ({ projectId }: { projectId?: string; scope?: string }) =>
                fetchQuery(
                    api.skills.list,
                    {
                        ...(projectId ? { projectId: projectId as Id<'projects'> } : {}),
                        scope: 'all' as const,
                    },
                    { token },
                ),
        },
    },
});

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

const OLLAMA_NAME_RE = /^[a-z0-9._:-]+$/i;

function isValidChatModel(model: string): boolean {
    if (model === AUTO_MODEL_ID) return true;
    if (!model.startsWith('ollama/')) return true; // OpenRouter models validated by the SDK
    const name = model.slice('ollama/'.length);
    return name.length > 0 && OLLAMA_NAME_RE.test(name);
}

const ChatRequestBodySchema = z.object({
    messages: z.array(z.any()).min(1),
    chatType: z.nativeEnum(ChatType),
    conversationId: z.string().min(1),
    // projectId is optional for ChatType.PLAN pre-creation sessions (no project yet)
    projectId: z.string().optional(),
    model: z.string().optional(),
    ollamaBaseUrl: z.string().optional(),
    reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
});

const MAX_MESSAGES = 200;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_TOTAL_MESSAGE_BYTES = 1 * 1024 * 1024;

function getSerializedBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).length;
}

function validateMessagePayload(messages: unknown[]): string | null {
    if (messages.length > MAX_MESSAGES) {
        return `too many messages (max ${MAX_MESSAGES})`;
    }

    let totalBytes = 0;
    for (const message of messages) {
        const messageBytes = getSerializedBytes(message);
        if (messageBytes > MAX_MESSAGE_BYTES) {
            return `message exceeds ${MAX_MESSAGE_BYTES} bytes`;
        }
        totalBytes += messageBytes;
        if (totalBytes > MAX_TOTAL_MESSAGE_BYTES) {
            return `total message payload exceeds ${MAX_TOTAL_MESSAGE_BYTES} bytes`;
        }
    }

    return null;
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
                error: 'An unexpected error occurred while starting chat.',
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
    } catch (err: any) {
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
    const messagePayloadError = validateMessagePayload(parsedBody.messages);
    if (messagePayloadError) {
        return new Response(JSON.stringify({ error: messagePayloadError, code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const convexToken = await getConvexToken();
    const convexToolCaller = buildConvexToolCaller(convexToken);

    // SINGLE projects.get — previously called twice (once for access check, once
    // for framework). One round-trip serves both: the query throws on access
    // denial via requireCap so the absence of a throw is the access check.
    let projectDoc: { runtimeMetadata?: { framework?: ProjectFrameworkId } } | null = null;
    if (projectId) {
        try {
            projectDoc = await fetchQuery(
                api.projects.get,
                { projectId: projectId as Id<'projects'> },
                { token: convexToken },
            );
        } catch (err: any) {
            console.warn('[chat] project access denied', err);
            return new Response(JSON.stringify({ error: 'Forbidden', code: 403 }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } else if (chatType !== ChatType.PLAN) {
        return new Response(JSON.stringify({ error: 'projectId required', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const framework: ProjectFrameworkId | null = projectDoc?.runtimeMetadata?.framework ?? null;

    // Memory search query (extract only the instruction text; the full
    // hydrated message contains huge XML context blocks that would poison
    // semantic search).
    const lastUserMessageForMemory = messages.findLast((m) => m.role === 'user');
    const rawQueryText = (lastUserMessageForMemory?.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
    const memoryQueryText = rawQueryText ? extractInstructionText(rawQueryText) : '';

    const selectedModel = (parsedBody.model ?? CHAT_MODEL_OPTIONS[0].model) as ChatModel | 'auto';
    if (!isValidChatModel(selectedModel)) {
        return new Response(JSON.stringify({ error: 'Invalid model identifier.', code: 400 }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const isLocalModel = typeof selectedModel === 'string' && selectedModel.startsWith('ollama/');

    // CLI providers (Codex, Claude Code, Gemini, OpenCode, Cursor) only run on
    // the user's machine via the desktop CLI bridge. If the renderer sends one
    // of those models to the hosted /api/chat, refuse early.
    if (selectedModel !== AUTO_MODEL_ID) {
        const provider = inferProviderFromModelId(selectedModel as string);
        if (provider !== 'openrouter' && provider !== 'ollama') {
            return new Response(
                JSON.stringify({
                    error: `Provider "${provider}" routing is not yet implemented on hosted web. Use the desktop app for CLI providers.`,
                    code: 'cli_provider_routing_not_implemented',
                }),
                { status: 501, headers: { 'Content-Type': 'application/json' } },
            );
        }
    }

    // Up-front usage record. Increment is the real concurrency-safe gate;
    // checkMessageLimit can pass under concurrency (it reads a pre-deduction
    // count). If increment fails with USAGE_LIMIT_REACHED, refuse before
    // streaming so concurrent users don't each get a free LLM response.
    let usageRecord: {
        usageRecordId: string | undefined;
        rateLimitId: string | undefined;
    } | null = null;
    let usageRefunded = false;
    const refundUsageOnce = async (reason: string) => {
        if (!usageRecord || usageRefunded) return;
        usageRefunded = true;
        try {
            await decrementUsage(req, usageRecord);
        } catch (err: any) {
            console.warn(`[chat] failed to refund usage (${reason})`, err);
        }
    };

    try {
        const lastUserMessage = messages.findLast((message) => message.role === 'user');
        const traceId = lastUserMessage?.id ?? uuidv4();

        if (chatType === ChatType.EDIT && !isLocalModel) {
            const incrementResult = await incrementUsage(req, traceId);
            if (incrementResult && 'limitReached' in incrementResult) {
                return new Response(
                    JSON.stringify({
                        error: 'Credit limit exceeded. Please upgrade to a paid plan.',
                        code: 402,
                    }),
                    { status: 402, headers: { 'Content-Type': 'application/json' } },
                );
            }
            usageRecord = incrementResult;
        }

        // Parallel context fetches. Everything below this point can run
        // concurrently — none depend on each other's results.
        const memoriesPromise = memoryQueryText
            ? searchMemories(memoryQueryText, userId)
            : Promise.resolve([]);
        const skillsPromise = loadSkillSummaries({
            userId,
            projectId: projectId ?? undefined,
            trpcCaller: convexToolCaller,
        }).catch((err: unknown) => {
            console.warn('[chat] failed to load Agent Skills, continuing without them', err);
            return [];
        });
        const summaryPromise = projectId
            ? fetchQuery(
                  api.conversations.getSummary,
                  { conversationId: conversationId as Id<'conversations'> },
                  { token: convexToken },
              ).catch(() => null)
            : Promise.resolve(null);
        const tierPromise = fetchQuery(api.usage.tier, {}, { token: convexToken }).catch(
            (err: unknown) => {
                console.warn('[chat] tier lookup failed; defaulting to free', err);
                return 'free' as UserTier;
            },
        );

        const [memories, skills, conversationSummary, tier] = await Promise.all([
            memoriesPromise,
            skillsPromise,
            summaryPromise,
            tierPromise,
        ]);

        const built = await buildChatRequest({
            chatType,
            messages,
            selectedModel,
            userId,
            projectId,
            conversationId,
            traceId,
            reasoningEffort: parsedBody.reasoningEffort,
            ollamaBaseUrl: sanitizeOllamaBaseUrl(parsedBody.ollamaBaseUrl),
            tier,
            framework,
            memories,
            skills,
            conversationSummary,
            abortSignal: req.signal,
            serverToolContext: projectId
                ? {
                      userId,
                      projectId,
                      conversationId,
                      trpcCaller: convexToolCaller,
                      messages,
                  }
                : undefined,
            toolSetOverride: chatType === ChatType.PLAN && !projectId ? prePlanToolset : undefined,
        });

        const usageSink = async (event: {
            userId: string;
            conversationId?: string;
            projectId?: string;
            /** SDK-generated UUID, not a Convex Id. */
            messageId?: string;
            provider: 'anthropic-direct' | 'openrouter' | 'ollama';
            model: string;
            chatType: string;
            resolvedFromAuto: boolean;
            inputTokens: number;
            outputTokens: number;
            cacheCreationTokens: number;
            cacheReadTokens: number;
            estimatedCostUsd: number;
            ttfMs?: number;
            totalMs?: number;
            toolCallCount?: number;
            errorType?: string;
        }) => {
            await fetchMutation(
                api.aiUsageEvents.insert,
                {
                    userId: userId as Id<'users'>,
                    conversationId: event.conversationId
                        ? (event.conversationId as Id<'conversations'>)
                        : undefined,
                    projectId: event.projectId ? (event.projectId as Id<'projects'>) : undefined,
                    messageId: event.messageId,
                    provider: event.provider,
                    model: event.model,
                    chatType: event.chatType,
                    resolvedFromAuto: event.resolvedFromAuto,
                    inputTokens: event.inputTokens,
                    outputTokens: event.outputTokens,
                    cacheCreationTokens: event.cacheCreationTokens,
                    cacheReadTokens: event.cacheReadTokens,
                    estimatedCostUsd: event.estimatedCostUsd,
                    ttfMs: event.ttfMs,
                    totalMs: event.totalMs,
                    toolCallCount: event.toolCallCount,
                    errorType: event.errorType,
                },
                { token: convexToken },
            );
        };

        return built.stream.toUIMessageStreamResponse<ChatMessage>({
            originalMessages: messages,
            generateMessageId: () => uuidv4(),
            messageMetadata: ({ part }) => {
                // First user-visible delta means the model is producing output —
                // mark TTF here so the dashboard reflects perceived latency.
                if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
                    built.onFirstToken();
                }
                const providerMetadata =
                    'providerMetadata' in part
                        ? (part.providerMetadata as ChatProviderMetadata | undefined)
                        : undefined;
                return {
                    createdAt: new Date(),
                    conversationId,
                    context: [],
                    checkpoints: [],
                    finishReason: part.type === 'finish-step' ? part.finishReason : undefined,
                    usage: part.type === 'finish-step' ? part.usage : undefined,
                    providerMetadata:
                        part.type === 'finish-step' ? providerMetadata : undefined,
                    resolvedModel: built.resolvedModel,
                    resolvedFromAuto: built.resolvedFromAuto,
                } satisfies ChatMetadata & { providerMetadata?: ChatProviderMetadata };
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

                if (isAborted || !responseHasContent) {
                    await refundUsageOnce(isAborted ? 'aborted' : 'empty_response');
                    return;
                }

                const messagesToStore = finalMessages
                    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
                    .map((msg) => toDbMessage(msg, conversationId));

                await fetchMutation(
                    api.messages.replaceConversationMessages,
                    {
                        conversationId: conversationId as Id<'conversations'>,
                        messages: messagesToStore as never,
                    },
                    { token: convexToken },
                );

                const responseMetadata = responseMessage.metadata as
                    | (ChatMetadata & { providerMetadata?: ChatProviderMetadata })
                    | undefined;
                const toolCallCount = (responseMessage?.parts ?? []).filter((p) =>
                    p.type?.startsWith('tool-'),
                ).length;
                void built.finalizeUsage({
                    usage: responseMetadata?.usage,
                    providerMetadata: responseMetadata?.providerMetadata,
                    toolCallCount,
                    messageId: responseMessage?.id,
                    sink: usageSink,
                });

                // Fire-and-forget: extract facts and store them in Mem0.
                addMemoriesFromConversation(finalMessages, userId, projectId ?? '').catch((err) => {
                    console.warn('[mem0] Failed to store memories:', err);
                });
            },
            onError: (error) => {
                void refundUsageOnce('stream_error');
                void built.finalizeUsage({
                    errorType: error instanceof Error ? error.name : 'unknown',
                    sink: usageSink,
                });
                return errorHandler(error);
            },
        });
    } catch (error: any) {
        console.error('Error in streamResponse setup', error);
        await refundUsageOnce('setup_error');
        return new Response(
            JSON.stringify({
                error: 'An unexpected error occurred while preparing chat.',
                code: 500,
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
};
