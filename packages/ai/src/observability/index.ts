/**
 * Observability primitives for AI chat requests.
 *
 * Pure functions — no DB writes, no external calls. Callers wire the structured
 * usage events into Convex / LangFuse / stdout themselves (see request-builder).
 *
 * Pricing reflects late-2025 list rates for OpenRouter/direct providers and is
 * intentionally a single editable table — when prices move, change one place.
 */
import type { ChatModel } from '@weblab/models';
import { OPENROUTER_MODELS } from '@weblab/models';

/**
 * Price per 1M tokens in USD. Cache reads/writes use Anthropic's cache pricing
 * for Anthropic models; for non-Anthropic models cache fields are 0.
 *
 * If a model is missing here, cost estimation returns 0 and emits a warning —
 * we'd rather be loud about missing data than silently undercount spend.
 */
export interface ModelPricing {
    /** Per 1M input tokens. */
    inputUsdPerMTok: number;
    /** Per 1M output tokens. */
    outputUsdPerMTok: number;
    /** Per 1M cache-creation input tokens (Anthropic: 1.25x input). 0 if N/A. */
    cacheCreationUsdPerMTok: number;
    /** Per 1M cache-read input tokens (Anthropic: 0.1x input). 0 if N/A. */
    cacheReadUsdPerMTok: number;
}

/**
 * Single source of truth for cost calculations. Edit here when rates change.
 * Cache rates follow Anthropic's published 1.25x (write) / 0.1x (read) multipliers.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
    [OPENROUTER_MODELS.CLAUDE_OPUS_4_8]: {
        inputUsdPerMTok: 15,
        outputUsdPerMTok: 75,
        cacheCreationUsdPerMTok: 18.75,
        cacheReadUsdPerMTok: 1.5,
    },
    [OPENROUTER_MODELS.CLAUDE_SONNET_4_6]: {
        inputUsdPerMTok: 3,
        outputUsdPerMTok: 15,
        cacheCreationUsdPerMTok: 3.75,
        cacheReadUsdPerMTok: 0.3,
    },
    [OPENROUTER_MODELS.CLAUDE_3_5_HAIKU]: {
        inputUsdPerMTok: 0.8,
        outputUsdPerMTok: 4,
        cacheCreationUsdPerMTok: 1,
        cacheReadUsdPerMTok: 0.08,
    },
    [OPENROUTER_MODELS.OPEN_AI_GPT_5_5]: {
        inputUsdPerMTok: 10,
        outputUsdPerMTok: 30,
        cacheCreationUsdPerMTok: 0,
        cacheReadUsdPerMTok: 0,
    },
    [OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI]: {
        inputUsdPerMTok: 0.25,
        outputUsdPerMTok: 2,
        cacheCreationUsdPerMTok: 0,
        cacheReadUsdPerMTok: 0,
    },
    [OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW]: {
        inputUsdPerMTok: 2.5,
        outputUsdPerMTok: 10,
        cacheCreationUsdPerMTok: 0,
        cacheReadUsdPerMTok: 0,
    },
    [OPENROUTER_MODELS.KIMI_K2_6]: {
        inputUsdPerMTok: 0.15,
        outputUsdPerMTok: 2.5,
        cacheCreationUsdPerMTok: 0,
        cacheReadUsdPerMTok: 0,
    },
    [OPENROUTER_MODELS.DEEPSEEK_V4_PRO]: {
        inputUsdPerMTok: 0.27,
        outputUsdPerMTok: 1.1,
        cacheCreationUsdPerMTok: 0,
        cacheReadUsdPerMTok: 0,
    },
    [OPENROUTER_MODELS.DEEPSEEK_V4_FLASH]: {
        inputUsdPerMTok: 0.05,
        outputUsdPerMTok: 0.5,
        cacheCreationUsdPerMTok: 0,
        cacheReadUsdPerMTok: 0,
    },
    [OPENROUTER_MODELS.MISTRAL_CODESTRAL]: {
        inputUsdPerMTok: 0.3,
        outputUsdPerMTok: 0.9,
        cacheCreationUsdPerMTok: 0,
        cacheReadUsdPerMTok: 0,
    },
};

export interface TokenBreakdown {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
}

/**
 * Estimate cost in USD for a single LLM call. Returns 0 for unknown models.
 *
 * Cache-read tokens are billed at a fraction of the input rate, so a request
 * that pays mostly with cache reads costs far less than the raw input-token
 * count would suggest. Counting them at full input price would massively
 * over-report cost on Anthropic.
 */
export function estimateLLMCost(model: ChatModel, tokens: TokenBreakdown): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
        // Local Ollama models have no per-token cost. Anything else missing
        // here is a registry gap worth surfacing once.
        if (!model.startsWith('ollama/')) {
            console.warn(`[observability] no pricing for model "${model}"; cost=0`);
        }
        return 0;
    }
    const inputCost = (tokens.inputTokens / 1_000_000) * pricing.inputUsdPerMTok;
    const outputCost = (tokens.outputTokens / 1_000_000) * pricing.outputUsdPerMTok;
    const cacheCreateCost =
        ((tokens.cacheCreationTokens ?? 0) / 1_000_000) * pricing.cacheCreationUsdPerMTok;
    const cacheReadCost = ((tokens.cacheReadTokens ?? 0) / 1_000_000) * pricing.cacheReadUsdPerMTok;
    return inputCost + outputCost + cacheCreateCost + cacheReadCost;
}

/**
 * The structured event emitted per AI request. Used by Convex inserts, stdout
 * logs, and the admin dashboard. Keep field names stable — analytics joins on
 * them.
 */
export interface AIUsageEvent {
    userId: string;
    conversationId?: string;
    projectId?: string;
    messageId?: string;
    provider: 'anthropic-direct' | 'openrouter' | 'ollama';
    model: ChatModel;
    chatType: string;
    /** True when the user picked 'auto' and the router resolved a concrete model. */
    resolvedFromAuto: boolean;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    estimatedCostUsd: number;
    /** Time-to-first-token in ms. */
    ttfMs?: number;
    /** Total wall-clock latency in ms. */
    totalMs?: number;
    toolCallCount?: number;
    errorType?: string;
    createdAt: number;
}

/**
 * Cache-hit ratio for a single event. Useful for the dashboard. Returns null
 * when there are no cache-eligible tokens (e.g. non-Anthropic models).
 */
export function cacheHitRatio(event: AIUsageEvent): number | null {
    const total = event.cacheReadTokens + event.cacheCreationTokens + event.inputTokens;
    if (total === 0) return null;
    if (event.cacheReadTokens === 0 && event.cacheCreationTokens === 0) return null;
    return event.cacheReadTokens / total;
}

/**
 * Stream timing helper. Call `.start()` before kicking off the stream,
 * `.onFirstToken()` from inside the first `text-delta` (or equivalent), and
 * `.end()` once the stream finishes. Returns immutable timing snapshots.
 *
 * Designed to be wired into Vercel AI SDK's `experimental_transform` /
 * `onFinish` callbacks. All fields default to `undefined` until the
 * corresponding hook fires — never throws on out-of-order calls.
 */
export interface StreamTiming {
    start: () => void;
    onFirstToken: () => void;
    end: () => void;
    snapshot: () => { ttfMs?: number; totalMs?: number };
}

export function measureStreamTiming(): StreamTiming {
    let startedAt: number | undefined;
    let firstTokenAt: number | undefined;
    let endedAt: number | undefined;

    return {
        start: () => {
            startedAt = Date.now();
        },
        onFirstToken: () => {
            if (firstTokenAt !== undefined) return; // idempotent — only the first delta counts
            firstTokenAt = Date.now();
        },
        end: () => {
            endedAt = Date.now();
        },
        snapshot: () => {
            if (startedAt === undefined) return {};
            return {
                ttfMs: firstTokenAt !== undefined ? firstTokenAt - startedAt : undefined,
                totalMs: endedAt !== undefined ? endedAt - startedAt : undefined,
            };
        },
    };
}

/**
 * Build a structured event from the SDK's `LanguageModelUsage` shape. The
 * Vercel AI SDK exposes a slightly different field set depending on provider
 * (Anthropic adds `cachedInputTokens`/`cachedPromptTokens` under
 * `providerMetadata.anthropic`), so we normalise here.
 */
export interface BuildEventInput {
    userId: string;
    conversationId?: string;
    projectId?: string;
    messageId?: string;
    provider: AIUsageEvent['provider'];
    model: ChatModel;
    chatType: string;
    resolvedFromAuto: boolean;
    usage: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        cachedInputTokens?: number;
        cacheCreationInputTokens?: number;
    };
    timing?: { ttfMs?: number; totalMs?: number };
    toolCallCount?: number;
    errorType?: string;
}

export function buildUsageEvent(input: BuildEventInput): AIUsageEvent {
    const inputTokens = input.usage.inputTokens ?? 0;
    const outputTokens = input.usage.outputTokens ?? 0;
    const cacheReadTokens = input.usage.cachedInputTokens ?? 0;
    const cacheCreationTokens = input.usage.cacheCreationInputTokens ?? 0;
    const estimatedCostUsd = estimateLLMCost(input.model, {
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
    });
    return {
        userId: input.userId,
        conversationId: input.conversationId,
        projectId: input.projectId,
        messageId: input.messageId,
        provider: input.provider,
        model: input.model,
        chatType: input.chatType,
        resolvedFromAuto: input.resolvedFromAuto,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        estimatedCostUsd,
        ttfMs: input.timing?.ttfMs,
        totalMs: input.timing?.totalMs,
        toolCallCount: input.toolCallCount,
        errorType: input.errorType,
        createdAt: Date.now(),
    };
}

/**
 * Hook for callers to fire-and-forget. Default impl logs to stdout in a
 * compact JSON line; callers can pass a `sink` to additionally persist to
 * Convex. Sensitive prompt content is never logged here — only counts/IDs.
 */
export interface TrackAIUsageOptions {
    /** Optional persistence callback (e.g. Convex mutation). Failures are swallowed. */
    sink?: (event: AIUsageEvent) => Promise<unknown>;
    /** If true, emits the JSON line to stdout. Default true in dev, false in prod tests. */
    log?: boolean;
}

export async function trackAIUsage(
    event: AIUsageEvent,
    options: TrackAIUsageOptions = {},
): Promise<void> {
    const shouldLog = options.log ?? process.env.NODE_ENV !== 'test';
    if (shouldLog) {
        // Compact line — easy to grep/tail in Railway logs. NO prompt content.
        console.log(
            `[ai-usage] ${JSON.stringify({
                model: event.model,
                provider: event.provider,
                chatType: event.chatType,
                tokens: {
                    in: event.inputTokens,
                    out: event.outputTokens,
                    cacheRead: event.cacheReadTokens,
                    cacheCreate: event.cacheCreationTokens,
                },
                costUsd: Number(event.estimatedCostUsd.toFixed(6)),
                ttfMs: event.ttfMs,
                totalMs: event.totalMs,
                tools: event.toolCallCount,
                err: event.errorType,
                conv: event.conversationId,
            })}`,
        );
    }
    if (options.sink) {
        try {
            await options.sink(event);
        } catch (err) {
            console.warn('[ai-usage] sink failed; event dropped from durable store', err);
        }
    }
}
