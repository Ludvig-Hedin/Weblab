import { ConvexError, v } from 'convex/values';

import type { AiGuardResult } from './lib/aiGuards';
import { internalMutation, mutation } from './_generated/server';
import {
    checkAiGuards,
    checkScreenshotForce,
    isTrustedSpendWriter,
    recordAiSpend,
    releaseAiRequest,
} from './lib/aiGuards';
import { requireUser } from './lib/permissions';

// AI runaway / spike safeguards — Convex entry points.
//
//   checkAndRecord  — called by every Next.js AI route BEFORE the model call:
//                     kill switch, fleet daily budget, per-user spend caps,
//                     per-user request rate limit, auto-continuation cap.
//   recordSpend     — adds a non-chat route's real cost (summarize, inline
//                     edit, tab complete, terminal) to the spend counters.
//                     Chat spend is recorded inside `aiUsageEvents.insert`.
//   _gateForAction  — same checks for Convex AI actions (title, suggestions,
//                     wireframes, project name, diff/scrape/search helpers).
//
// Numbers + copy: convex/lib/aiGuardConfig.ts. Math: convex/lib/aiGuardMath.ts.
// Identity is always derived server-side from the caller's token.

const vGuardBucket = v.union(
    v.literal('llm'),
    v.literal('tabComplete'),
    v.literal('aux'),
    v.literal('none'),
);

export const checkAndRecord = mutation({
    args: {
        bucket: vGuardBucket,
        turn: v.optional(
            v.object({
                // Bounded: `${conversationId}:${lastUserMessageId}`.
                key: v.string(),
                // Conversation id — keys the continuation counter.
                scope: v.string(),
                isContinuation: v.boolean(),
            }),
        ),
        // Requested model id; Pro-only models are refused for non-Pro users
        // here (single tier lookup, before anything is recorded).
        model: v.optional(v.string()),
    },
    handler: async (ctx, { bucket, turn, model }): Promise<AiGuardResult> => {
        const user = await requireUser(ctx);
        const safeTurn = turn
            ? { ...turn, key: turn.key.slice(0, 256), scope: turn.scope.slice(0, 128) }
            : undefined;
        return checkAiGuards(ctx, user._id, {
            bucket,
            turn: safeTurn,
            model: model?.slice(0, 200),
        });
    },
});

/**
 * Undo a `checkAndRecord` for a request the route then refused (402 out of
 * credits, credit check outage), so refusals don't eat the user's rate-limit
 * or continuation budget. Only touches the caller's own rows.
 */
export const release = mutation({
    args: {
        bucket: v.union(v.literal('llm'), v.literal('tabComplete'), v.literal('aux')),
        recordedAt: v.number(),
        turnScope: v.optional(v.string()),
        continuationCounted: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<null> => {
        const user = await requireUser(ctx);
        await releaseAiRequest(ctx, user._id, args);
        return null;
    },
});

export const recordSpend = mutation({
    args: {
        costUsd: v.number(),
        serverSecret: v.optional(v.string()),
    },
    handler: async (ctx, { costUsd, serverSecret }): Promise<null> => {
        const user = await requireUser(ctx);
        if (!isTrustedSpendWriter(serverSecret)) {
            throw new Error('FORBIDDEN: untrusted spend writer');
        }
        await recordAiSpend(ctx, user._id, costUsd);
        return null;
    },
});

/**
 * Gate for Convex AI actions. Auth propagates from the calling action, so the
 * user is the action's caller. Throws a ConvexError carrying the friendly
 * message when blocked (application errors keep their text in production),
 * so every action surfaces the same copy without a model call.
 */
export const _gateForAction = internalMutation({
    args: {
        // false → skip the request-count limiter (kill switch + budget + spend
        // caps still apply). Used by applyDiff, which agent turns call once
        // per file edit.
        rateLimit: v.optional(v.boolean()),
    },
    handler: async (ctx, { rateLimit }): Promise<null> => {
        const user = await requireUser(ctx);
        const result = await checkAiGuards(ctx, user._id, {
            bucket: rateLimit === false ? 'none' : 'aux',
        });
        if (!result.allowed) {
            throw new ConvexError(result.message);
        }
        return null;
    },
});

/** Max one forced screenshot capture per project per window (see config). */
export const _allowScreenshotForce = internalMutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }): Promise<boolean> => {
        return checkScreenshotForce(ctx, projectId);
    },
});

/**
 * Count a Convex action's (estimated) cost toward the caller's spend caps and
 * the fleet budget. Internal: only our own server-side actions can call it,
 * so no server secret is needed. Auth propagates from the calling action.
 */
export const _recordActionSpend = internalMutation({
    args: { costUsd: v.number() },
    handler: async (ctx, { costUsd }): Promise<null> => {
        const user = await requireUser(ctx);
        await recordAiSpend(ctx, user._id, costUsd);
        return null;
    },
});
