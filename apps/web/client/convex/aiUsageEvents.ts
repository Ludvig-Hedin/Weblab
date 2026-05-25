import { v } from 'convex/values';

import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { getOptionalUser } from './lib/permissions';

/**
 * Convex backing for `aiUsageEvents` — per-request AI cost/token/latency
 * telemetry. Inserted fire-and-forget from the chat API route; queried by
 * the /admin/usage dashboard.
 *
 * No content (prompts, outputs) is stored here — counts and ids only. Each
 * row corresponds to one LLM call (one chat turn or one summarizer run).
 */

/**
 * Resolve admin status by checking the caller's email against a comma-
 * separated `WEBLAB_ADMIN_EMAILS` env var. Convex env vars are set with
 * `npx convex env set WEBLAB_ADMIN_EMAILS "you@example.com,team@..."`.
 *
 * Returning false when the env var is unset means the dashboard is locked
 * by default — safer than defaulting open.
 */
async function isWeblabAdmin(ctx: QueryCtx): Promise<boolean> {
    const allowlist = process.env.WEBLAB_ADMIN_EMAILS;
    if (!allowlist) return false;
    const user = await getOptionalUser(ctx);
    if (!user?.email) return false;
    const allowed = allowlist
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return allowed.includes(user.email.toLowerCase());
}

async function requireAdmin(ctx: QueryCtx): Promise<void> {
    const ok = await isWeblabAdmin(ctx);
    if (!ok) throw new Error('FORBIDDEN: admin only');
}

/**
 * Non-throwing admin check. The dashboard page calls this first and renders
 * a graceful "not authorized" state when the caller is not an admin, rather
 * than letting useQuery propagate the FORBIDDEN error into React.
 */
export const amIAdmin = query({
    args: {},
    handler: async (ctx) => {
        return isWeblabAdmin(ctx);
    },
});

/**
 * Insert a usage event. Called from the chat API route — caller is already
 * authenticated; we cross-check userId matches the caller's user row so a
 * forged userId from the server-side caller can't write someone else's row.
 *
 * Failure here is non-fatal for the chat experience: the route handler
 * wraps this call in a try/catch and continues. We still throw on bad
 * input so the failure is visible in logs.
 */
export const insert = mutation({
    args: {
        userId: v.id('users'),
        conversationId: v.optional(v.id('conversations')),
        projectId: v.optional(v.id('projects')),
        // SDK-generated UUID (not a Convex Id). See schema.ts for rationale.
        messageId: v.optional(v.string()),
        provider: v.string(),
        model: v.string(),
        chatType: v.string(),
        resolvedFromAuto: v.boolean(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        cacheCreationTokens: v.number(),
        cacheReadTokens: v.number(),
        estimatedCostUsd: v.number(),
        ttfMs: v.optional(v.number()),
        totalMs: v.optional(v.number()),
        toolCallCount: v.optional(v.number()),
        errorType: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const caller = await getOptionalUser(ctx);
        if (!caller || caller._id !== args.userId) {
            // Surface but don't break the response — chat route already
            // logged the upstream usage. Keep this strict, though: writing
            // someone else's usage row would corrupt billing analytics.
            throw new Error('FORBIDDEN: usage event userId mismatch');
        }
        const id = await ctx.db.insert('aiUsageEvents', {
            ...args,
            createdAt: Date.now(),
        });
        return id;
    },
});

/**
 * Admin: paginated usage events across all users. Supports filtering by
 * userId, model, or conversation. `since` is epoch ms — useful for the
 * dashboard's "last 7 days" / "last 30 days" filters.
 */
export const listAdmin = query({
    args: {
        userId: v.optional(v.id('users')),
        model: v.optional(v.string()),
        conversationId: v.optional(v.id('conversations')),
        since: v.optional(v.number()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, { userId, model, conversationId, since, limit }) => {
        await requireAdmin(ctx);
        const take = Math.min(limit ?? 200, 1000);
        // Pick the most-selective index for the supplied filters. Convex
        // queries can only use one index — we pick by specificity.
        if (conversationId) {
            return ctx.db
                .query('aiUsageEvents')
                .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
                .order('desc')
                .take(take);
        }
        if (userId) {
            return ctx.db
                .query('aiUsageEvents')
                .withIndex('by_user_createdAt', (q) =>
                    since !== undefined
                        ? q.eq('userId', userId).gte('createdAt', since)
                        : q.eq('userId', userId),
                )
                .order('desc')
                .take(take);
        }
        if (model) {
            return ctx.db
                .query('aiUsageEvents')
                .withIndex('by_model_createdAt', (q) =>
                    since !== undefined
                        ? q.eq('model', model).gte('createdAt', since)
                        : q.eq('model', model),
                )
                .order('desc')
                .take(take);
        }
        if (since !== undefined) {
            return ctx.db
                .query('aiUsageEvents')
                .withIndex('by_createdAt', (q) => q.gte('createdAt', since))
                .order('desc')
                .take(take);
        }
        return ctx.db.query('aiUsageEvents').order('desc').take(take);
    },
});

/**
 * Admin: aggregate totals for the dashboard header. Returns total spend,
 * total tokens, cache-hit ratio, and request count. Window is `since`
 * epoch ms (default: last 30 days).
 */
export const aggregateAdmin = query({
    args: {
        since: v.optional(v.number()),
    },
    handler: async (ctx, { since }) => {
        await requireAdmin(ctx);
        const cutoff = since ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
        // For volumes we expect (single-figure tens of thousands of events),
        // scanning is fine. If this ever becomes hot we can pre-aggregate
        // in a daily cron.
        const events = await ctx.db
            .query('aiUsageEvents')
            .withIndex('by_createdAt', (q) => q.gte('createdAt', cutoff))
            .collect();
        let totalCost = 0;
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;
        let errorCount = 0;
        let ttfSum = 0;
        let ttfCount = 0;
        const perModel = new Map<
            string,
            { count: number; cost: number; inTok: number; outTok: number }
        >();
        for (const e of events) {
            totalCost += e.estimatedCostUsd;
            inputTokens += e.inputTokens;
            outputTokens += e.outputTokens;
            cacheReadTokens += e.cacheReadTokens;
            cacheCreationTokens += e.cacheCreationTokens;
            if (e.errorType) errorCount += 1;
            if (typeof e.ttfMs === 'number') {
                ttfSum += e.ttfMs;
                ttfCount += 1;
            }
            const slot = perModel.get(e.model) ?? {
                count: 0,
                cost: 0,
                inTok: 0,
                outTok: 0,
            };
            slot.count += 1;
            slot.cost += e.estimatedCostUsd;
            slot.inTok += e.inputTokens;
            slot.outTok += e.outputTokens;
            perModel.set(e.model, slot);
        }
        const totalCacheEligible = cacheReadTokens + cacheCreationTokens + inputTokens;
        return {
            since: cutoff,
            requestCount: events.length,
            totalCostUsd: totalCost,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheCreationTokens,
            cacheHitRatio: totalCacheEligible > 0 ? cacheReadTokens / totalCacheEligible : null,
            errorCount,
            avgTtfMs: ttfCount > 0 ? ttfSum / ttfCount : null,
            byModel: Array.from(perModel.entries())
                .map(([model, stats]) => ({ model, ...stats }))
                .sort((a, b) => b.cost - a.cost),
        };
    },
});

/**
 * Public read-only helper for the chat UI: total spend on a single
 * conversation. Lets the per-conversation header show the running cost.
 * Gated by the same project.view cap conversations.get uses.
 */
export const conversationTotals = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const caller = await getOptionalUser(ctx);
        if (!caller) throw new Error('UNAUTHORIZED');
        const conv = await ctx.db.get(conversationId);
        if (!conv) return null;
        // Reuse conversations.get's permission shape via inline check —
        // pulling requireCap here would require a project lookup we already
        // have. Caller must own the conversation's project.
        // Re-load the project membership via permission helper.
        // For now: only the caller's own events are returned, which is
        // strictly tighter than project-view and avoids extra checks.
        const events = await ctx.db
            .query('aiUsageEvents')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
            .filter((q) => q.eq(q.field('userId'), caller._id))
            .collect();
        let cost = 0;
        let inTok = 0;
        let outTok = 0;
        for (const e of events) {
            cost += e.estimatedCostUsd;
            inTok += e.inputTokens;
            outTok += e.outputTokens;
        }
        return {
            requestCount: events.length,
            estimatedCostUsd: cost,
            inputTokens: inTok,
            outputTokens: outTok,
        };
    },
});
