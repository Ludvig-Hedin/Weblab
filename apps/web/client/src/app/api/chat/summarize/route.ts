import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { z } from 'zod';

import type { ChatMessage } from '@weblab/models';
import { summarizeConversation } from '@weblab/ai';

import type { Id } from '../../../../../convex/_generated/dataModel';
import {
    checkMessageLimit,
    decrementUsage,
    getSupabaseUser,
    incrementUsage,
    reconcileUsageCost,
} from '../helpers';

// Caps on client-supplied LLM input. Without these, any signed-in caller
// could POST a megabyte-sized `messages` array and drive OpenRouter spend
// against Weblab's account before the (later) `setSummary` ownership check
// runs. Matches the bounds applied to `chatActions.generateSuggestions`.
const MAX_MESSAGES = 200;
// Keep in sync with /api/chat: a single message legitimately carries large
// tool outputs (read_skill bodies, file context). 16KB rejected real
// conversations and silently disabled summarization for them.
const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

// Per-conversation cooldown for the background summarizer. The client fires
// this route during typing / mid-stream; without a gate each keystroke would
// burn another credit + OpenRouter call. 60s lines up with how fast a
// human-paced chat actually pushes new tokens.
const SUMMARIZE_COOLDOWN_MS = 60_000;
// Memory guard for the in-process cooldown map. If the process serves more
// than this many distinct conversations between prunes, sweep entries older
// than the cooldown window.
const SUMMARY_FIRES_PRUNE_THRESHOLD = 2_000;

const recentSummaryFires = new Map<string, number>();

function pruneSummaryFiresIfLarge(now: number): void {
    if (recentSummaryFires.size < SUMMARY_FIRES_PRUNE_THRESHOLD) return;
    for (const [conversationId, firedAt] of recentSummaryFires) {
        if (now - firedAt > SUMMARIZE_COOLDOWN_MS) {
            recentSummaryFires.delete(conversationId);
        }
    }
}

/**
 * Background summarization endpoint.
 *
 * Called by `useConversationSummarizer` when the on-screen chat exceeds 50%
 * of the active model's context window. Returns 204 No Content on success —
 * the summary lands in Convex and the next /api/chat turn picks it up via
 * conversations.getSummary.
 *
 * This route never blocks the user. The client fires it during typing or
 * mid-stream of the previous turn; failures are logged and ignored.
 */

const BodySchema = z.object({
    conversationId: z.string().min(1),
    messages: z.array(z.any()).min(2),
});

const getConvexToken = async (): Promise<string | undefined> => {
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    return token ?? undefined;
};

export async function POST(req: NextRequest) {
    const user = await getSupabaseUser(req);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized', code: 401 }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const usageCheck = await checkMessageLimit(req);
    if (usageCheck.exceeded) {
        return new Response(
            JSON.stringify({
                error: 'Credit limit exceeded.',
                code: 402,
                usage: usageCheck.usage,
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
        );
    }

    let parsed: z.infer<typeof BodySchema>;
    try {
        parsed = BodySchema.parse(await req.json());
    } catch (err: unknown) {
        // Log the detailed Zod error server-side; return a fixed message so the
        // response doesn't echo request-body slices back to the caller (matches
        // the sibling /api/chat route's handling).
        console.error('[chat/summarize] invalid request body', err);
        return new Response(
            JSON.stringify({
                error: 'Invalid request body.',
                code: 400,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }

    // Bound the payload BEFORE sending to OpenRouter — caps the worst-case
    // LLM bill per request to ~1 MB of input and 200 messages.
    if (parsed.messages.length > MAX_MESSAGES) {
        return new Response(
            JSON.stringify({
                error: `too many messages (max ${MAX_MESSAGES})`,
                code: 400,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }
    {
        // Count UTF-8 bytes (not UTF-16 code units) so multibyte content
        // (emoji, CJK) is bounded by the same byte budget as /api/chat. JS
        // `string.length` undercounts UTF-8 by up to 3× for CJK and 2× for
        // surrogate-pair emoji, which would let crafted payloads bypass the
        // MAX_MESSAGE_BYTES cap as measured by OpenRouter token billing.
        const encoder = new TextEncoder();
        let totalBytes = 0;
        for (const m of parsed.messages) {
            const messageBytes = encoder.encode(JSON.stringify(m)).length;
            if (messageBytes > MAX_MESSAGE_BYTES) {
                return new Response(
                    JSON.stringify({
                        error: `message exceeds ${MAX_MESSAGE_BYTES} bytes`,
                        code: 400,
                    }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                );
            }
            totalBytes += messageBytes;
            if (totalBytes > MAX_TOTAL_BYTES) {
                return new Response(
                    JSON.stringify({
                        error: `total payload exceeds ${MAX_TOTAL_BYTES} bytes`,
                        code: 400,
                    }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                );
            }
        }
    }

    // Verify the caller can access body.conversationId BEFORE invoking the
    // paid LLM. `conversations.get` runs `requireCap('project.view')` and
    // throws for non-members — without this gate, a signed-in caller could
    // pass any conversationId and burn OpenRouter spend; the `setSummary`
    // mutation later rejects, but the LLM bill has already landed.
    const ownershipToken = await getConvexToken();
    try {
        await fetchQuery(
            api.conversations.get,
            { conversationId: parsed.conversationId as Id<'conversations'> },
            { token: ownershipToken },
        );
    } catch {
        return new Response(JSON.stringify({ error: 'Forbidden', code: 403 }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Drop redundant fires BEFORE charging the user. The client-side
    // `useConversationSummarizer` runs on every keystroke once the context
    // window crosses 50%, so without a server-side gate a single typing
    // session can burn dozens of credits from the user's daily quota and
    // surface as an unexpected "credit limit exceeded" toast next turn.
    //
    // Two cheap gates, in order of selectivity:
    //   1. Same-tip check — if `conversations.getSummary` already covers the
    //      last message id in the payload, the LLM was already invoked for
    //      this exact tip. Skip.
    //   2. Per-process cooldown — even when the tip moves message-by-message,
    //      cap to one summary per conversation per `SUMMARIZE_COOLDOWN_MS`.
    //      Map is process-local; replicas don't share state. That's
    //      acceptable: the worst case under fan-out is N replicas × 1 fire
    //      per cooldown window, vs the unbounded burst the client can
    //      generate today.
    const lastMessage = parsed.messages[parsed.messages.length - 1] as { id?: string } | undefined;
    const lastMessageId = lastMessage?.id;

    if (lastMessageId) {
        const existingSummary = await fetchQuery(
            api.conversations.getSummary,
            { conversationId: parsed.conversationId as Id<'conversations'> },
            { token: ownershipToken },
        ).catch(() => null);
        if (existingSummary?.upToMessageId === lastMessageId) {
            return new Response(null, { status: 204 });
        }
    }

    const now = Date.now();
    const lastFireAt = recentSummaryFires.get(parsed.conversationId) ?? 0;
    if (now - lastFireAt < SUMMARIZE_COOLDOWN_MS) {
        return new Response(null, { status: 204 });
    }
    recentSummaryFires.set(parsed.conversationId, now);
    pruneSummaryFiresIfLarge(now);

    // The cooldown set above is an in-flight concurrency guard (dedupes rapid /
    // concurrent summarize calls so they don't double-charge). RETAIN it only
    // when summarization actually succeeds — the `finally` below clears it on
    // every failure path (credit-limit 402, null result, thrown error) so the
    // next chat turn can re-attempt, instead of being silently 204'd for the
    // full cooldown window. Without this, a single failure blocked summaries for
    // SUMMARIZE_COOLDOWN_MS, contradicting the catch comment's retry promise.
    let succeeded = false;

    let usageRecord: {
        usageRecordId: string | undefined;
        rateLimitId: string | undefined;
    } | null = null;
    let refunded = false;
    const refundOnce = async () => {
        if (refunded || !usageRecord) return;
        refunded = true;
        await decrementUsage(req, usageRecord);
    };

    try {
        const incrementResult = await incrementUsage(
            req,
            `summary:${parsed.conversationId}:${Date.now()}`,
        );
        if (incrementResult && 'limitReached' in incrementResult) {
            return new Response(JSON.stringify({ error: 'Credit limit exceeded.', code: 402 }), {
                status: 402,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        usageRecord = incrementResult;

        let costUsd: number | undefined;
        const result = await summarizeConversation({
            messages: parsed.messages as ChatMessage[],
            abortSignal: req.signal,
            onUsage: ({ estimatedCostUsd }) => {
                costUsd = estimatedCostUsd;
            },
        });
        if (!result) {
            await refundOnce();
            return new Response(null, { status: 204 });
        }
        // Reconcile the reserved credit against the real token cost. Awaited so
        // the mutation isn't dropped when this non-streaming handler freezes
        // after returning; reconcileUsageCost swallows its own errors.
        if (costUsd !== undefined) {
            await reconcileUsageCost(usageRecord, costUsd);
        }
        await fetchMutation(
            api.conversations.setSummary,
            {
                conversationId: parsed.conversationId as Id<'conversations'>,
                summaryText: result.summaryText,
                summarizedUpToMessageId: result.summarizedUpToMessageId,
            },
            { token: ownershipToken },
        );
        succeeded = true;
        return new Response(null, { status: 204 });
    } catch (err: unknown) {
        await refundOnce();
        // Background path — log but don't surface a hard error. The next
        // chat turn will simply re-attempt summarization at the same
        // threshold.
        console.warn('[chat/summarize] failed:', err);
        return new Response(
            JSON.stringify({
                error: 'An unexpected error occurred while summarizing chat.',
                code: 500,
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    } finally {
        // Keep the cooldown only after a successful summary; clear it on every
        // failure path so the next chat turn can re-attempt summarization.
        if (!succeeded) {
            recentSummaryFires.delete(parsed.conversationId);
        }
    }
}
