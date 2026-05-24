import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { vUsageType } from './lib/enums';
import { requireUser } from './lib/permissions';

// Convex usage tracking.
//
// Ported from apps/web/client/src/server/api/routers/usage/index.ts. Free
// users are calendar-bounded counts over `usageRecords`. PRO users have
// dedicated `rateLimits` rows that get decremented as usage happens.
//
// Concurrency note (race-safety): Convex mutations are serializable per
// document. A read-then-patch on a rateLimits row is atomic at the doc
// level; concurrent decrements get OCC retries automatically — no manual
// transaction needed.

// Mirrors the FREE_PRODUCT_CONFIG limits in @weblab/stripe so the Convex
// bundle doesn't need to import the whole stripe package just for two
// numbers. Keep these in sync with packages/stripe/src/constants.ts.
const FREE_DAILY_LIMIT = 5;
const FREE_MONTHLY_LIMIT = 50;

interface UsagePeriod {
    period: 'day' | 'month';
    usageCount: number;
    limitCount: number;
}

interface UsageResult {
    daily: UsagePeriod;
    monthly: UsagePeriod;
}

function startOfUtcDay(now: number): number {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcMonth(now: number): number {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function loadActiveSubscriptionWithProduct(
    ctx: QueryCtx,
    userId: Id<'users'>,
): Promise<{
    subscription: Doc<'subscriptions'>;
    isPro: boolean;
} | null> {
    const subscription = await ctx.db
        .query('subscriptions')
        .withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'active'))
        .unique();
    if (!subscription) return null;
    const product = await ctx.db.get(subscription.productId);
    return { subscription, isPro: product?.type === 'pro' };
}

async function freePlanUsage(
    ctx: QueryCtx,
    userId: Id<'users'>,
    now: number,
): Promise<UsageResult> {
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);

    // Count records via the by_user_time index, bounded to the relevant
    // window. `.collect()` returns all matching docs — for usage this is
    // O(records-this-month) which is acceptable for free-tier volumes.
    const monthRecords = await ctx.db
        .query('usageRecords')
        .withIndex('by_user_time', (q) =>
            q.eq('userId', userId).gte('timestamp', monthStart).lte('timestamp', now),
        )
        .collect();

    const lastDayCount = monthRecords.filter(
        (r) => r.timestamp >= dayStart && r.timestamp < now,
    ).length;

    return {
        daily: {
            period: 'day',
            usageCount: lastDayCount,
            limitCount: FREE_DAILY_LIMIT,
        },
        monthly: {
            period: 'month',
            usageCount: monthRecords.length,
            limitCount: FREE_MONTHLY_LIMIT,
        },
    };
}

async function proPlanUsage(ctx: QueryCtx, userId: Id<'users'>, now: number): Promise<UsageResult> {
    // Sum all valid (non-expired) rate limits. Drizzle had a SUM aggregate;
    // Convex doesn't expose one, so we collect within the date window and
    // reduce in JS — rate-limit row count per user is small (one row per
    // billing period + carry-overs).
    const rates = await ctx.db
        .query('rateLimits')
        .withIndex('by_user_time', (q) => q.eq('userId', userId).lte('startedAt', now))
        .collect();
    const valid = rates.filter((r) => r.endedAt > now);
    const left = valid.reduce((acc, r) => acc + r.left, 0);
    const max = valid.reduce((acc, r) => acc + r.max, 0);

    return {
        daily: {
            period: 'day',
            usageCount: max - left,
            limitCount: max,
        },
        monthly: {
            period: 'month',
            usageCount: max - left,
            limitCount: max,
        },
    };
}

export const get = query({
    args: {},
    handler: async (ctx): Promise<UsageResult> => {
        const user = await requireUser(ctx);
        const now = Date.now();
        const active = await loadActiveSubscriptionWithProduct(ctx, user._id);
        if (!active || !active.isPro) {
            return freePlanUsage(ctx, user._id, now);
        }
        return proPlanUsage(ctx, user._id, now);
    },
});

// Increment usage:
//  * For PRO users with an active subscription: locate the rate limit with
//    the most carry-over (== oldest credits first) and decrement `left`.
//    Throw if no credits remain — the caller catches and surfaces the
//    quota error.
//  * For free users (no active sub OR FREE-typed product): insert a record
//    without touching any rate-limit rows; quota is enforced upstream by
//    counting records.
export const increment = mutation({
    args: {
        type: vUsageType,
        traceId: v.optional(v.string()),
    },
    handler: async (ctx, { type, traceId }) => {
        const user = await requireUser(ctx);
        const now = Date.now();

        let rateLimitId: Id<'rateLimits'> | undefined;
        const active = await loadActiveSubscriptionWithProduct(ctx, user._id);

        if (active && active.isPro) {
            const candidate = await pickRateLimitForDeduction(ctx, user._id, now);
            if (!candidate) {
                // Match Drizzle's tx.rollback() — caller catches and treats
                // it as out-of-quota.
                throw new Error('USAGE_LIMIT_REACHED');
            }
            await ctx.db.patch(candidate._id, {
                left: candidate.left - 1,
                updatedAt: now,
            });
            rateLimitId = candidate._id;
        }

        const usageRecordId = await ctx.db.insert('usageRecords', {
            userId: user._id,
            type,
            timestamp: now,
            traceId,
        });

        return { rateLimitId, usageRecordId };
    },
});

async function pickRateLimitForDeduction(
    ctx: MutationCtx,
    userId: Id<'users'>,
    now: number,
): Promise<Doc<'rateLimits'> | null> {
    const candidates = await ctx.db
        .query('rateLimits')
        .withIndex('by_user_time', (q) => q.eq('userId', userId).lte('startedAt', now))
        .collect();
    const valid = candidates.filter((r) => r.endedAt >= now && r.left > 0);
    if (valid.length === 0) return null;
    // Deduct from the bucket with the most carry-over (= oldest credits)
    // first. Stable tie-break by id keeps multi-row concurrent updates
    // deterministic across replays.
    valid.sort((a, b) => {
        if (b.carryOverTotal !== a.carryOverTotal) {
            return b.carryOverTotal - a.carryOverTotal;
        }
        return a._id.localeCompare(b._id);
    });
    return valid[0] ?? null;
}

// Revert a previously-attempted increment. Used when an AI request fails
// after the credit was deducted — we restore the credit and delete the
// audit record so the user is not charged for the failure.
export const revertIncrement = mutation({
    args: {
        usageRecordId: v.optional(v.id('usageRecords')),
        rateLimitId: v.optional(v.id('rateLimits')),
    },
    handler: async (ctx, { usageRecordId, rateLimitId }) => {
        const user = await requireUser(ctx);

        if (rateLimitId) {
            const rate = await ctx.db.get(rateLimitId);
            if (rate && rate.userId === user._id) {
                await ctx.db.patch(rateLimitId, {
                    left: rate.left + 1,
                    updatedAt: Date.now(),
                });
            }
        }

        if (usageRecordId) {
            const record = await ctx.db.get(usageRecordId);
            if (record && record.userId === user._id) {
                await ctx.db.delete(usageRecordId);
            }
        }

        return { rateLimitId, usageRecordId };
    },
});
