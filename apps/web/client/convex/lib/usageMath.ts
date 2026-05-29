// Pure, ctx-free helpers for usage metering math.
//
// Kept free of Convex `ctx` so the credit/quota logic can be unit-tested with
// bun:test without a convex-test harness (the repo's CI runner is `bun test`).
// The mutations in usage.ts compose these with `ctx.db` reads/writes.

export interface DeductionBucket {
    _id: string;
    left: number;
    endedAt: number;
    carryOverTotal: number;
}

/**
 * Select the rate-limit bucket to deduct `needed` credits from.
 *
 * Valid = not expired (`endedAt > now`) AND holds at least `needed` credits.
 * Prefers the bucket with the most carry-over (oldest credits first); stable
 * tie-break by id so concurrent replays are deterministic. Returns `null` when
 * no single bucket can cover `needed` — the caller treats that as out-of-quota.
 *
 * For the legacy single-credit path (`needed === 1`) this is equivalent to the
 * old `left > 0` filter, so existing behavior is preserved.
 */
// TODO(image-credits): single-bucket only. A Pro user whose credits are split
// across buckets (e.g. 3 + 4 left) has 7 total but no single bucket covers a
// 5-credit image, so this returns null and the user is wrongly told they're out
// of credits near a period boundary. Safe multi-bucket draining needs the
// usageRecord to link MULTIPLE buckets so revertIncrement can refund each.
// Tracked in BACKLOG.md. Text (needed=1) is unaffected.
export function selectDeductionBucket<T extends DeductionBucket>(
    buckets: readonly T[],
    now: number,
    needed: number,
): T | null {
    const valid = buckets.filter((b) => b.endedAt > now && b.left >= needed);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => {
        if (b.carryOverTotal !== a.carryOverTotal) {
            return b.carryOverTotal - a.carryOverTotal;
        }
        return a._id.localeCompare(b._id);
    });
    return sorted[0] ?? null;
}

/**
 * Sum the credit amount of usage records. Records written before the `amount`
 * field existed (or single-credit records) count as 1.
 */
export function sumUsageAmount(records: readonly { amount?: number }[]): number {
    return records.reduce((acc, r) => acc + (r.amount ?? 1), 0);
}

/**
 * True when an existing count meets or exceeds the cap, i.e. the next operation
 * must be blocked. Pairs with an index-bounded `.take(cap)` read so the count
 * never scans more than `cap` rows.
 */
export function isAtOrOverCap(existingCount: number, cap: number): boolean {
    return existingCount >= cap;
}

/**
 * Normalize a credit cost to a positive integer (minimum 1). Guards against
 * accidental 0 / negative / fractional costs reaching the ledger.
 */
export function normalizeCredits(credits: number | undefined): number {
    if (credits === undefined) return 1;
    const n = Math.floor(credits);
    return n >= 1 ? n : 1;
}
