// Pure, ctx-free helpers for token-cost credit billing.
//
// A "credit" is the user-facing billing unit (the "100 / 200 / …" shown on the
// pricing card == price.monthlyMessageLimit). Its DOLLAR value is derived
// per-tier so that a plan's total credit budget equals a fixed fraction of the
// plan price — the rest is margin. Each AI request reserves 1 credit up front
// (see usage.ts `increment`) and is then reconciled to its real token cost via
// `reconcileUsage`, which uses these helpers.
//
// Kept free of Convex `ctx` so the math is unit-testable with bun:test without
// a convex-test harness — same pattern as usageMath.ts. The mutations in
// usage.ts compose these with `ctx.db` reads/writes.

/**
 * Fraction of a plan's price that funds raw model spend. The remaining
 * `1 - LLM_COST_BUDGET_FRACTION` is gross margin (a FLOOR — light users who
 * don't exhaust their budget yield more). 0.5 = budget is half the price.
 *
 * Keep in sync with the optional mirror in packages/stripe/src/constants.ts.
 */
export const LLM_COST_BUDGET_FRACTION = 0.5;

/**
 * Dollar value of model spend represented by one FREE-tier credit. Free plans
 * have no price to derive a budget from, so this is set explicitly. Default
 * mirrors the entry Pro tier (T1: $25 / 100 credits * 0.5 = $0.125) so the
 * trial feels like entry Pro. Lower this to make the free tier cheaper.
 */
export const FREE_CREDIT_VALUE_USD = 0.125;

/**
 * Plan price in CENTS per Pro tier key. The Convex `prices` table stores only
 * `key` + `monthlyMessageLimit` (not the dollar cost), so this mirrors the
 * `cost` field of PRO_PRICES in packages/stripe/src/constants.ts — same pattern
 * as the FREE limits mirrored in usage.ts. KEEP IN SYNC with PRO_PRICES.
 */
export const PRO_TIER_COST_CENTS: Record<string, number> = {
    PRO_MONTHLY_TIER_1: 2500,
    PRO_MONTHLY_TIER_2: 5000,
    PRO_MONTHLY_TIER_3: 10000,
    PRO_MONTHLY_TIER_4: 20000,
    PRO_MONTHLY_TIER_5: 29400,
    PRO_MONTHLY_TIER_6: 48000,
    PRO_MONTHLY_TIER_7: 70500,
    PRO_MONTHLY_TIER_8: 92000,
    PRO_MONTHLY_TIER_9: 112500,
    PRO_MONTHLY_TIER_10: 187500,
    PRO_MONTHLY_TIER_11: 375000,
};

/**
 * Dollars of raw model spend that one credit represents on a given paid tier.
 *
 *   creditValueUsd = (costCents / 100) * fraction / monthlyMessageLimit
 *
 * `costCents` is looked up from {@link PRO_TIER_COST_CENTS} by the price's `key`
 * (the DB `prices` row carries `key` + `monthlyMessageLimit`, not the dollar
 * cost). Derived from the SUBSCRIPTION's current price so every bucket for that
 * user (fresh, carry-over, mid-period upgrade delta) values credits identically.
 *
 * Returns 0 when the limit is non-positive or the key is unknown (e.g. a legacy
 * tier) — the caller treats a 0 value as "can't price this" and falls back to
 * the reserved credit (never divides by zero).
 */
export function creditValueUsd(price: { key: string; monthlyMessageLimit: number }): number {
    if (!(price.monthlyMessageLimit > 0)) return 0;
    const costCents = PRO_TIER_COST_CENTS[price.key];
    if (costCents === undefined || !(costCents > 0)) return 0;
    return ((costCents / 100) * LLM_COST_BUDGET_FRACTION) / price.monthlyMessageLimit;
}

/**
 * Convert a request's USD token cost into credits at a given per-credit value.
 *
 * Guards every degenerate input (creditValue <= 0, NaN, negative/zero cost) by
 * returning 0 — a request we can't price (unknown model -> cost 0, local model,
 * bad data) costs nothing rather than throwing or charging a wrong amount.
 */
export function usdToCredits(usd: number, creditValue: number): number {
    if (!(creditValue > 0)) return 0;
    if (!(usd > 0)) return 0;
    return usd / creditValue;
}

/**
 * Net bucket `left` after reconciling a reserved-then-actual deduction.
 *
 * Up front the bucket was reduced by `reserved` credits (a flat 1). Reconcile
 * re-bases to the real cost: net deduction should be `actualCredits`, so we add
 * back the reservation and subtract the actual — i.e. `left -= (actual -
 * reserved)`.
 *   - floored at 0: an expensive turn can't drive the bucket negative
 *     (overshoot is bounded to one turn, by design)
 *   - capped at `max`: a cheap turn's partial refund can't inflate the bucket
 *     above its ceiling if max/left shifted (period rollover, manual grant)
 */
export function reconciledBucketLeft(params: {
    bucketLeft: number;
    bucketMax: number;
    reserved: number;
    actualCredits: number;
}): number {
    const { bucketLeft, bucketMax, reserved, actualCredits } = params;
    const delta = actualCredits - reserved;
    return Math.max(0, Math.min(bucketMax, bucketLeft - delta));
}
