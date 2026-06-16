import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import {
    creditValueUsd,
    FREE_CREDIT_VALUE_USD,
    reconciledBucketLeft,
    usdToCredits,
} from './lib/creditCost';
import { vUsageType } from './lib/enums';
import {
    IMAGE_BURST_PER_MIN,
    IMAGE_BURST_WINDOW_MS,
    IMAGE_CREDIT_COST,
    IMAGE_DAILY_CAP_FREE,
    IMAGE_DAILY_CAP_PRO,
} from './lib/imageLimits';
import { requireUser } from './lib/permissions';
import {
    isAtOrOverCap,
    normalizeCredits,
    selectDeductionBucket,
    sumUsageAmount,
} from './lib/usageMath';

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
    // Pick-first instead of `.unique()`: a user can end up with >1 active
    // subscription (double-click / two-tab checkout race). `.unique()` would
    // throw here and brick usage/chat/billing UI entirely. Take the first and
    // warn for observability.
    const active = await ctx.db
        .query('subscriptions')
        .withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'active'))
        .take(2);
    if (active.length > 1) {
        console.warn('[stripe] multiple active subscriptions for user', userId);
    }
    const subscription = active[0];
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

    const dayRecords = monthRecords.filter(
        // Match the outer index bound `.lte('timestamp', now)` so a record
        // written at exactly `now` (rare but reachable) isn't undercounted.
        (r) => r.timestamp >= dayStart && r.timestamp <= now,
    );

    // Sum credit amounts (not row counts): an image record consumes
    // IMAGE_CREDIT_COST credits, a text message consumes 1. Legacy rows with no
    // `amount` count as 1.
    return {
        daily: {
            period: 'day',
            usageCount: sumUsageAmount(dayRecords),
            limitCount: FREE_DAILY_LIMIT,
        },
        monthly: {
            period: 'month',
            usageCount: sumUsageAmount(monthRecords),
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

// Token-cost billing makes credit costs fractional (a request burns its real
// per-tier credit cost, not a flat 1). The internal callers (`tier`,
// `reserveImage`, the deduction gate) need that precision, but the UI shows
// whole credits — so round at the display boundary only. Clamp to [0, limit]
// so a floored-at-0 bucket never renders as "101 of 100".
function roundUsageForDisplay(result: UsageResult): UsageResult {
    const round = (p: UsagePeriod): UsagePeriod => ({
        ...p,
        usageCount: Math.min(p.limitCount, Math.max(0, Math.round(p.usageCount))),
    });
    return { daily: round(result.daily), monthly: round(result.monthly) };
}

export const get = query({
    args: {},
    handler: async (ctx): Promise<UsageResult> => {
        const user = await requireUser(ctx);
        const now = Date.now();
        const active = await loadActiveSubscriptionWithProduct(ctx, user._id);
        const usage =
            !active || !active.isPro
                ? await freePlanUsage(ctx, user._id, now)
                : await proPlanUsage(ctx, user._id, now);
        return roundUsageForDisplay(usage);
    },
});

/**
 * Returns the auto-router tier classification for the caller. Used by the
 * /api/chat route to decide which model to resolve when the user picks
 * "Auto". Computed from the same usage signals as `get` but boiled down to
 * a single 4-state enum the router consumes.
 *
 * Tiering rules (kept conservative — we'd rather under-promote than
 * over-promote):
 *   - free + monthly < 80%  → 'free'
 *   - free + monthly >= 80% → 'free-heavy'
 *   - pro + monthly < 90%   → 'pro'
 *   - pro + monthly >= 90%  → 'pro-heavy'
 */
export const tier = query({
    args: {},
    handler: async (ctx): Promise<'free' | 'free-heavy' | 'pro' | 'pro-heavy'> => {
        const user = await requireUser(ctx);
        const now = Date.now();
        const active = await loadActiveSubscriptionWithProduct(ctx, user._id);
        const usage =
            !active || !active.isPro
                ? await freePlanUsage(ctx, user._id, now)
                : await proPlanUsage(ctx, user._id, now);
        const monthlyRatio =
            usage.monthly.limitCount > 0 ? usage.monthly.usageCount / usage.monthly.limitCount : 0;
        if (!active || !active.isPro) {
            return monthlyRatio >= 0.8 ? 'free-heavy' : 'free';
        }
        return monthlyRatio >= 0.9 ? 'pro-heavy' : 'pro';
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
        // Public text/deployment usage is always a single credit. The credit
        // multiplier is server-internal (see `reserveImage`), so a client can
        // never request an arbitrary deduction amount.
        return applyIncrement(ctx, user._id, type, 1, traceId);
    },
});

// Shared deduction logic. Deducts `credits` from the best Pro bucket (or just
// records free-tier usage) and writes a single usageRecords row carrying the
// `amount` + the linked bucket. Extracted from the mutation so `reserveImage`
// can reuse it without a mutation-calling-mutation round trip.
async function applyIncrement(
    ctx: MutationCtx,
    userId: Id<'users'>,
    type: 'message' | 'deployment' | 'image',
    credits: number,
    traceId?: string,
): Promise<{
    rateLimitId: Id<'rateLimits'> | undefined;
    usageRecordId: Id<'usageRecords'>;
}> {
    const now = Date.now();
    const amount = normalizeCredits(credits);

    let rateLimitId: Id<'rateLimits'> | undefined;
    const active = await loadActiveSubscriptionWithProduct(ctx, userId);

    if (active && active.isPro) {
        // `> now` (strict, applied in selectDeductionBucket) matches
        // `proPlanUsage`'s display gate — at the exact endedAt ms the bucket is
        // expired and must not deduct credits.
        const buckets = await ctx.db
            .query('rateLimits')
            .withIndex('by_user_time', (q) => q.eq('userId', userId).lte('startedAt', now))
            .collect();
        const candidate = selectDeductionBucket(buckets, now, amount);
        if (!candidate) {
            // Match Drizzle's tx.rollback() — caller catches and treats it as
            // out-of-quota. (No single bucket holds `amount` credits.)
            throw new Error('USAGE_LIMIT_REACHED');
        }
        await ctx.db.patch(candidate._id, {
            left: candidate.left - amount,
            updatedAt: now,
        });
        rateLimitId = candidate._id;
    }

    const usageRecordId = await ctx.db.insert('usageRecords', {
        userId,
        type,
        timestamp: now,
        traceId,
        amount,
        // SECURITY: link the record to the bucket we decremented so
        // `revertIncrement` can refund the SAME bucket without trusting a
        // client-supplied rateLimitId (which would otherwise let any user farm
        // unlimited refunds by replaying their own rate-limit ids).
        linkedRateLimitId: rateLimitId,
    });

    return { rateLimitId, usageRecordId };
}

// Revert a previously-attempted increment. Used when an AI request fails
// after the credit was deducted — we restore the credit and delete the
// audit record so the user is not charged for the failure.
//
// SECURITY: `usageRecordId` is now REQUIRED and authoritative. The refund
// targets the rateLimit bucket stored on the record itself
// (`linkedRateLimitId`), not whatever id the client passes in. The record
// is deleted on first successful refund so a second call against the same
// id is a no-op — refunds cannot be replayed. The `rateLimitId` arg is
// kept for backward compatibility with the API route but is IGNORED.
//
// Without this gate, any signed-in user could call `revertIncrement`
// repeatedly with their own rateLimit id (no record needed) and farm
// unlimited credits.
export const revertIncrement = mutation({
    args: {
        usageRecordId: v.id('usageRecords'),
        // Kept for backward compat with the chat API route's payload. NOT
        // trusted — the authoritative id is read from the usageRecord.
        rateLimitId: v.optional(v.id('rateLimits')),
    },
    handler: async (ctx, { usageRecordId }) => {
        const user = await requireUser(ctx);

        const record = await ctx.db.get(usageRecordId);
        // Idempotent: missing record means a prior call already reverted it.
        if (!record) return { ok: true as const, refunded: false as const };
        if (record.userId !== user._id) throw new Error('FORBIDDEN');

        const linkedId = record.linkedRateLimitId;
        // Refund exactly what was deducted. Legacy/single-credit rows have no
        // `amount` and count as 1; image reservations refund IMAGE_CREDIT_COST.
        const amount = record.amount ?? 1;
        let creditRefunded = false;
        if (linkedId) {
            const rate = await ctx.db.get(linkedId);
            // Defensive: only refund if the bucket still belongs to the same
            // user. (The bucket can roll over before a revert lands; in that
            // case the refund is silently skipped — the credit is already
            // forfeit to the new period.)
            if (rate && rate.userId === user._id) {
                await ctx.db.patch(linkedId, {
                    // Clamp to `max` so a refund can never inflate a bucket above
                    // its ceiling if max/left shifted between deduct and revert
                    // (period rollover, manual grant) — otherwise proPlanUsage
                    // would report a negative usageCount (max - left).
                    left: Math.min(rate.max, rate.left + amount),
                    updatedAt: Date.now(),
                });
                creditRefunded = true;
            }
        }

        await ctx.db.delete(usageRecordId);
        // `refunded` reflects whether a rateLimit credit was actually
        // restored. Free-tier records (no `linkedRateLimitId`) and Pro
        // records whose bucket rolled over both return `false` — the
        // record was still deleted (idempotency holds) but no credit
        // movement happened.
        return { ok: true as const, refunded: creditRefunded };
    },
});

// Reconcile a reserved credit against the request's REAL token cost.
//
// Billing is reserve-then-reconcile: `increment` deducts a flat 1 credit BEFORE
// the stream (the concurrency-safe gate), because the token cost is only known
// AFTER the stream finishes. Once the route has the request's `estimatedCostUsd`
// (from the same usage event it logs to aiUsageEvents), it calls this to convert
// that dollar cost into credits at the user's per-tier credit value and re-base
// the deduction:
//   * PRO: adjust the linked bucket by (actualCredits - reserved). A cheap turn
//     refunds part of the reservation; an expensive turn deducts more (floored
//     at 0 — single-turn overshoot is accepted, see plan).
//   * FREE: no bucket exists, so just rewrite usageRecords.amount; freePlanUsage
//     sums `amount` against the daily/monthly caps.
//
// CUTOVER SAFETY: this never throws for the expected races. A missing record
// (already reverted), a rolled-over/missing bucket, an ownership mismatch, or an
// unpriceable request (cost 0 / no price / unknown model) all degrade to a
// silent no-op or a full reservation refund — a reconcile failure must never
// surface an error to the user or break the stream.
//
// SECURITY: this is a public mutation (the Next.js route calls it with the
// user's Clerk token, like `increment`/`revertIncrement`), and `estimatedCostUsd`
// is supplied by that caller. Two properties keep it from being abused to farm
// credits, mirroring `revertIncrement`:
//   1. `usageRecordId` is SERVER-HELD — `increment` returns it only to the route,
//      never to the browser, and no query exposes it. A client can't obtain a
//      valid id to target (Convex ids are unguessable).
//   2. ONE-TIME — a record is reconciled at most once (guarded on `costUsd`
//      already being set). Without this, a replay with a low cost would refund a
//      real charge over and over. The first (legitimate) call wins; later calls
//      are no-ops. Negative costs are clamped to 0 so a caller can't inflate a
//      refund past the reservation.
export const reconcileUsage = mutation({
    args: {
        usageRecordId: v.id('usageRecords'),
        estimatedCostUsd: v.number(),
    },
    handler: async (ctx, { usageRecordId, estimatedCostUsd }) => {
        const user = await requireUser(ctx);

        const record = await ctx.db.get(usageRecordId);
        // Record gone (a prior revert deleted it) or not ours → nothing to do.
        if (!record || record.userId !== user._id) {
            return { ok: true as const, reconciled: false as const };
        }
        // ONE-TIME: a set `costUsd` means this record was already reconciled.
        // Reject replays — this is the anti-credit-farming guard (mirrors how
        // `revertIncrement` deletes the record to prevent refund replay).
        if (record.costUsd !== undefined) {
            return { ok: true as const, reconciled: false as const };
        }
        // Clamp: never trust a negative cost (would inflate a refund); Convex
        // already rejects NaN/Infinity at the validator boundary.
        const cost = estimatedCostUsd > 0 ? estimatedCostUsd : 0;
        // Credits already deducted up-front by `increment` (a flat 1; legacy
        // rows with no `amount` count as 1).
        const reserved = record.amount ?? 1;

        const linkedId = record.linkedRateLimitId;
        if (linkedId) {
            // PRO path — adjust the exact bucket the reservation hit.
            const bucket = await ctx.db.get(linkedId);
            // Bucket rolled over / missing → the reservation is already forfeit
            // to the new period; leave it and just record the cost for audit
            // (which also marks the record reconciled, so it can't be replayed).
            if (!bucket || bucket.userId !== user._id) {
                await ctx.db.patch(usageRecordId, { costUsd: cost });
                return { ok: true as const, reconciled: false as const };
            }
            const subscription = await ctx.db.get(bucket.subscriptionId);
            const price = subscription ? await ctx.db.get(subscription.priceId) : null;
            const cv = price ? creditValueUsd(price) : 0;
            // cv === 0 (no price / bad data) → usdToCredits returns 0 → full
            // refund of the reservation. Unpriceable means free, never a throw.
            const actualCredits = usdToCredits(cost, cv);
            await ctx.db.patch(linkedId, {
                left: reconciledBucketLeft({
                    bucketLeft: bucket.left,
                    bucketMax: bucket.max,
                    reserved,
                    actualCredits,
                }),
                updatedAt: Date.now(),
            });
            await ctx.db.patch(usageRecordId, {
                amount: actualCredits,
                costUsd: cost,
            });
            return { ok: true as const, reconciled: true as const };
        }

        // FREE path — no bucket to adjust. Rewrite the counted amount so
        // freePlanUsage charges the real token cost against the free caps.
        const actualCredits = usdToCredits(cost, FREE_CREDIT_VALUE_USD);
        await ctx.db.patch(usageRecordId, {
            amount: actualCredits,
            costUsd: cost,
        });
        return { ok: true as const, reconciled: true as const };
    },
});

// Reserve a credit slot for one AI image generation. Three cash guards run in a
// single transaction: (1) per-user daily image cap, (2) per-minute burst limit,
// (3) the credit deduction (IMAGE_CREDIT_COST). The two count checks are
// index-bounded reads (`.take(cap)`), never unbounded scans.
//
// On generation FAILURE the caller MUST call `revertIncrement(usageRecordId)`:
// that refunds the credits AND deletes the usageRecord, so a failed attempt no
// longer counts against the daily/burst caps.
//
// Concurrency: the cap counts and the credit insert span multiple documents, so
// two simultaneous calls can each pass the check before either inserts — a cap
// may be exceeded by ~1 in a tight race. Accepted by design: the credit
// deduction itself is atomic (single rateLimits doc), so this never leaks spend
// beyond one extra cheap image. See spec 2026-05-29-skills-image-gen-design §8.4.
export const reserveImage = mutation({
    args: {
        traceId: v.optional(v.string()),
    },
    handler: async (ctx, { traceId }) => {
        const user = await requireUser(ctx);
        const now = Date.now();

        const active = await loadActiveSubscriptionWithProduct(ctx, user._id);
        const isPro = !!active?.isPro;
        const dailyCap = isPro ? IMAGE_DAILY_CAP_PRO : IMAGE_DAILY_CAP_FREE;

        // (1) Daily cap — count today's (non-reverted) image records. Reads at
        // most `dailyCap` rows via the by_user_type_time index.
        const dayStart = startOfUtcDay(now);
        const todaysImages = await ctx.db
            .query('usageRecords')
            .withIndex('by_user_type_time', (q) =>
                q.eq('userId', user._id).eq('type', 'image').gte('timestamp', dayStart),
            )
            .take(dailyCap);
        if (isAtOrOverCap(todaysImages.length, dailyCap)) {
            throw new Error('IMAGE_DAILY_CAP_REACHED');
        }

        // (2) Burst — count images in the last minute (reads at most BURST rows).
        const windowStart = now - IMAGE_BURST_WINDOW_MS;
        const recentImages = await ctx.db
            .query('usageRecords')
            .withIndex('by_user_type_time', (q) =>
                q.eq('userId', user._id).eq('type', 'image').gt('timestamp', windowStart),
            )
            .take(IMAGE_BURST_PER_MIN);
        if (isAtOrOverCap(recentImages.length, IMAGE_BURST_PER_MIN)) {
            throw new Error('IMAGE_RATE_LIMITED');
        }

        // (3) Free tier shares the text credit pool, but applyIncrement can't
        // enforce it (free users have no rateLimits bucket to deduct). Check the
        // daily/monthly budget here — the same gate checkMessageLimit applies on
        // the text path — so an image can't exceed the free credit allowance.
        // Pro users are enforced atomically by the bucket deduction in step (4).
        if (!isPro) {
            const usage = await freePlanUsage(ctx, user._id, now);
            if (
                usage.daily.usageCount + IMAGE_CREDIT_COST > usage.daily.limitCount ||
                usage.monthly.usageCount + IMAGE_CREDIT_COST > usage.monthly.limitCount
            ) {
                throw new Error('USAGE_LIMIT_REACHED');
            }
        }

        // (4) Deduct credits (throws USAGE_LIMIT_REACHED if unaffordable) and
        // write the usageRecord the caps above count.
        return applyIncrement(ctx, user._id, 'image', IMAGE_CREDIT_COST, traceId);
    },
});
