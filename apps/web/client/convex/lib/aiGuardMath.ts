// Pure, ctx-free math for the AI runaway/spike safeguards (see aiGuardConfig).
//
// Kept outside the Convex functions so every limit decision is unit-testable
// without a Convex auth/database harness (same pattern as transcribeRateLimit).

import type { SpendCaps, WindowRule } from './aiGuardConfig';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** Granularity of the rolling-hour spend buckets. */
export const SPEND_SLOT_MS = 5 * 60 * 1000;

export function utcDayStart(now: number): number {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function secondsUntil(target: number, now: number): number {
    return Math.max(1, Math.ceil((target - now) / 1000));
}

// ── Request rate limit (generalised sliding log) ─────────────────────────────

export interface SlidingWindowDecision {
    allowed: boolean;
    retryAfterSeconds: number;
    /** Log to persist: only in-window entries, plus `now` when allowed. */
    timestamps: number[];
}

/**
 * Multi-window sliding-log limiter. A request is allowed only if EVERY rule
 * has fewer than `max` entries inside its window. Blocked requests are not
 * appended, so the log never grows past the largest rule's `max`.
 */
export function evaluateSlidingWindows(
    previous: readonly number[],
    now: number,
    rules: readonly WindowRule[],
): SlidingWindowDecision {
    const longest = rules.reduce((acc, r) => Math.max(acc, r.windowMs), 0);
    const recent = previous.filter((t) => t > now - longest && t <= now).sort((a, b) => a - b);

    let retryAt = 0;
    for (const rule of rules) {
        const inWindow = recent.filter((t) => t > now - rule.windowMs);
        if (inWindow.length >= rule.max) {
            // Enough of the oldest entries must age out to get back under max.
            const mustExpire = inWindow[inWindow.length - rule.max];
            if (mustExpire !== undefined) {
                retryAt = Math.max(retryAt, mustExpire + rule.windowMs);
            }
        }
    }

    if (retryAt > 0) {
        return { allowed: false, retryAfterSeconds: secondsUntil(retryAt, now), timestamps: recent };
    }
    return { allowed: true, retryAfterSeconds: 0, timestamps: [...recent, now] };
}

// ── Per-user spend (rolling hour + UTC day) ──────────────────────────────────

export interface SpendSlot {
    start: number;
    usd: number;
}

export interface UserSpendState {
    dayStart: number;
    dayUsd: number;
    hourSlots: SpendSlot[];
}

/** Drop expired hour slots and reset the day total on a new UTC day. */
export function rollUserSpend(state: UserSpendState | null, now: number): UserSpendState {
    const dayStart = utcDayStart(now);
    if (!state) return { dayStart, dayUsd: 0, hourSlots: [] };
    return {
        dayStart,
        dayUsd: state.dayStart === dayStart ? state.dayUsd : 0,
        hourSlots: state.hourSlots.filter((s) => s.start + HOUR_MS > now),
    };
}

export function addUserSpend(
    state: UserSpendState | null,
    now: number,
    usd: number,
): UserSpendState {
    const rolled = rollUserSpend(state, now);
    if (!(usd > 0)) return rolled;
    const slotStart = now - (now % SPEND_SLOT_MS);
    const slots = [...rolled.hourSlots];
    const last = slots[slots.length - 1];
    if (last && last.start === slotStart) {
        slots[slots.length - 1] = { start: slotStart, usd: last.usd + usd };
    } else {
        slots.push({ start: slotStart, usd });
    }
    return { dayStart: rolled.dayStart, dayUsd: rolled.dayUsd + usd, hourSlots: slots };
}

export interface UserSpendDecision {
    allowed: boolean;
    reason: 'hour' | 'day' | null;
    retryAfterSeconds: number;
    hourUsd: number;
    dayUsd: number;
}

export function evaluateUserSpend(
    state: UserSpendState | null,
    now: number,
    caps: SpendCaps,
): UserSpendDecision {
    const rolled = rollUserSpend(state, now);
    const hourUsd = rolled.hourSlots.reduce((acc, s) => acc + s.usd, 0);
    const dayUsd = rolled.dayUsd;

    if (dayUsd >= caps.dayUsd) {
        return {
            allowed: false,
            reason: 'day',
            retryAfterSeconds: secondsUntil(rolled.dayStart + DAY_MS, now),
            hourUsd,
            dayUsd,
        };
    }
    if (hourUsd >= caps.hourUsd) {
        // Oldest slots age out first; find when the rolling sum drops below cap.
        const slots = [...rolled.hourSlots].sort((a, b) => a.start - b.start);
        let remaining = hourUsd;
        let retryAt = now + HOUR_MS;
        for (const slot of slots) {
            remaining -= slot.usd;
            if (remaining < caps.hourUsd) {
                retryAt = slot.start + HOUR_MS;
                break;
            }
        }
        return {
            allowed: false,
            reason: 'hour',
            retryAfterSeconds: secondsUntil(retryAt, now),
            hourUsd,
            dayUsd,
        };
    }
    return { allowed: true, reason: null, retryAfterSeconds: 0, hourUsd, dayUsd };
}

// ── Fleet-wide daily budget ──────────────────────────────────────────────────

/** Clamp a caller-reported cost to [0, maxEventCostUsd]; NaN → 0. */
export function clampEventCost(costUsd: number, maxEventCostUsd: number): number {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
    return Math.min(costUsd, maxEventCostUsd);
}

/**
 * How much of one event counts toward the fleet total. Capped per user per
 * day so a single (possibly forged) account can't exhaust the whole budget.
 */
export function fleetContribution(
    costUsd: number,
    userDayUsdBefore: number,
    fleetMaxPerUserDayUsd: number,
): number {
    const headroom = Math.max(0, fleetMaxPerUserDayUsd - Math.max(0, userDayUsdBefore));
    return Math.min(Math.max(0, costUsd), headroom);
}

export function isFleetBudgetExceeded(fleetDayUsd: number, budgetUsd: number): boolean {
    return fleetDayUsd >= budgetUsd;
}

/** Which budget log line (if any) an increment from `before` to `after` crosses. */
export function fleetBudgetCrossing(
    before: number,
    after: number,
    budgetUsd: number,
): 'exceeded' | 'warning' | null {
    if (before < budgetUsd && after >= budgetUsd) return 'exceeded';
    const warnAt = budgetUsd * 0.8;
    if (before < warnAt && after >= warnAt) return 'warning';
    return null;
}

// ── Auto-continuation cap ────────────────────────────────────────────────────

export interface TurnState {
    turnKey?: string;
    continuations: number;
}

export interface TurnRequest {
    key: string;
    isContinuation: boolean;
}

/**
 * A fresh user turn resets the counter; each continuation POST for the same
 * turn increments it. A continuation for an unseen turn (reload mid-turn)
 * starts at 1. Rejects once the count would exceed `maxContinuations`.
 */
export function evaluateTurnContinuation(
    state: TurnState | null,
    turn: TurnRequest,
    maxContinuations: number,
): { allowed: boolean; next: TurnState } {
    if (!turn.isContinuation) {
        return { allowed: true, next: { turnKey: turn.key, continuations: 0 } };
    }
    const previous = state?.turnKey === turn.key ? (state?.continuations ?? 0) : 0;
    const count = previous + 1;
    if (count > maxContinuations) {
        return { allowed: false, next: { turnKey: turn.key, continuations: previous } };
    }
    return { allowed: true, next: { turnKey: turn.key, continuations: count } };
}

// ── Fleet counter sharding ───────────────────────────────────────────────────

/** Rows per UTC day for the fleet spend counter (spreads write contention). */
export const FLEET_SPEND_SHARDS = 8;

export function sumFleetShards(rows: readonly { usd: number }[]): number {
    return rows.reduce((acc, r) => acc + (Number.isFinite(r.usd) ? r.usd : 0), 0);
}

/** Pick a shard for one write; `random` is injectable for tests. */
export function pickFleetShard(random: () => number = Math.random): number {
    const n = Math.floor(random() * FLEET_SPEND_SHARDS);
    return Math.min(FLEET_SPEND_SHARDS - 1, Math.max(0, n));
}

// ── Undo a recorded request (request refused after the gate) ─────────────────

/** Remove one entry equal to `recordedAt` (the one the gate appended). */
export function withoutRecordedTimestamp(
    timestamps: readonly number[],
    recordedAt: number,
): number[] {
    const idx = timestamps.lastIndexOf(recordedAt);
    if (idx === -1) return [...timestamps];
    return [...timestamps.slice(0, idx), ...timestamps.slice(idx + 1)];
}
