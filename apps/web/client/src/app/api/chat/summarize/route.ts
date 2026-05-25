import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { z } from 'zod';

import type { ChatMessage } from '@weblab/models';
import { summarizeConversation } from '@weblab/ai';

import type { Id } from '../../../../../convex/_generated/dataModel';
import { checkMessageLimit, decrementUsage, getSupabaseUser, incrementUsage } from '../helpers';

// Caps on client-supplied LLM input. Without these, any signed-in caller
// could POST a megabyte-sized `messages` array and drive OpenRouter spend
// against Weblab's account before the (later) `setSummary` ownership check
// runs. Matches the bounds applied to `chatActions.generateSuggestions`.
const MAX_MESSAGES = 200;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_TOTAL_BYTES = 1 * 1024 * 1024;

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
        return new Response(
            JSON.stringify({
                error: err instanceof Error ? err.message : 'Invalid body',
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
        let totalBytes = 0;
        for (const m of parsed.messages) {
            const serialized = JSON.stringify(m);
            if (serialized.length > MAX_MESSAGE_BYTES) {
                return new Response(
                    JSON.stringify({
                        error: `message exceeds ${MAX_MESSAGE_BYTES} bytes`,
                        code: 400,
                    }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                );
            }
            totalBytes += serialized.length;
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

        const result = await summarizeConversation({
            messages: parsed.messages as ChatMessage[],
            abortSignal: req.signal,
        });
        if (!result) {
            await refundOnce();
            return new Response(null, { status: 204 });
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
    }
}
