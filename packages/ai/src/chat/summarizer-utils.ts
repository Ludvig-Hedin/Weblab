/**
 * Client-safe portion of the summarizer module. Pure functions that only
 * touch the token counter — no LLM calls, no Node builtins. Safe to import
 * into browser bundles via `@weblab/ai/client`.
 *
 * The actual LLM-running summarizer lives in `./summarizer` (server-only).
 */
import type { ChatMessage } from '@weblab/models';
import { getMaxTokens } from '@weblab/models';

import { countTokensWithRoles } from '../tokens';

/**
 * Hard ratio above which we trigger summarization. 50% of the context
 * window leaves comfortable headroom for the response and tool outputs.
 */
export const SUMMARIZE_THRESHOLD_RATIO = 0.5;

/**
 * Number of recent turns we ALWAYS keep verbatim, regardless of size, so
 * the model has fresh context for the user's latest train of thought.
 */
export const KEEP_RECENT_TURNS = 8;

export interface ShouldSummarizeInput {
    messages: ChatMessage[];
    /** The model that WILL be used for the next turn. Determines context window. */
    targetModel: string;
    /** If a summary already exists for this conversation, pass it so we skip re-running. */
    existingSummaryUpToMessageId?: string;
    /** Optional override of the threshold ratio (test seam). */
    threshold?: number;
}

export interface ShouldSummarizeResult {
    shouldSummarize: boolean;
    estimatedTokens: number;
    targetContextWindow: number;
    reason?: string;
}

export async function shouldSummarize(input: ShouldSummarizeInput): Promise<ShouldSummarizeResult> {
    const ctx = getMaxTokens(input.targetModel as never);
    const threshold = (input.threshold ?? SUMMARIZE_THRESHOLD_RATIO) * ctx;
    const tokens = await countTokensWithRoles(input.messages);
    if (tokens < threshold) {
        return { shouldSummarize: false, estimatedTokens: tokens, targetContextWindow: ctx };
    }
    const summarizable = input.messages.slice(0, -KEEP_RECENT_TURNS);
    const lastSummarizableId = summarizable[summarizable.length - 1]?.id;
    if (
        input.existingSummaryUpToMessageId &&
        lastSummarizableId === input.existingSummaryUpToMessageId
    ) {
        return {
            shouldSummarize: false,
            estimatedTokens: tokens,
            targetContextWindow: ctx,
            reason: 'summary already current',
        };
    }
    return { shouldSummarize: true, estimatedTokens: tokens, targetContextWindow: ctx };
}

/**
 * For request-builder: prepend an existing summary as a synthetic assistant
 * message and drop messages older than the cursor. Returns the slimmed
 * message list ready to send to the main model.
 */
export function applySummaryToMessages(args: {
    messages: ChatMessage[];
    summary?: { text: string; upToMessageId: string } | null;
}): ChatMessage[] {
    if (!args.summary?.text) return args.messages;
    const idx = args.messages.findIndex((m) => m.id === args.summary?.upToMessageId);
    if (idx < 0) return args.messages;
    const recent = args.messages.slice(idx + 1);
    const synthesized: ChatMessage = {
        id: `conv-summary:${args.summary.upToMessageId}`,
        role: 'assistant',
        parts: [
            {
                type: 'text',
                text: `<conversation-summary>\n${args.summary.text}\n</conversation-summary>`,
            },
        ],
    };
    return [synthesized, ...recent];
}
