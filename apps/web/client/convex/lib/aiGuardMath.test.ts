import { describe, expect, it } from 'bun:test';

import {
    addUserSpend,
    clampEventCost,
    DAY_MS,
    evaluateSlidingWindows,
    evaluateTurnContinuation,
    evaluateUserSpend,
    fleetBudgetCrossing,
    fleetContribution,
    HOUR_MS,
    FLEET_SPEND_SHARDS,
    isFleetBudgetExceeded,
    pickFleetShard,
    sumFleetShards,
    utcDayStart,
    withoutRecordedTimestamp,
} from './aiGuardMath';

const MIN = 60_000;
// 2026-01-01T10:00:00Z — mid-day so hour windows never cross midnight.
const NOW = Date.UTC(2026, 0, 1, 10, 0, 0);

describe('evaluateSlidingWindows', () => {
    const rules = [
        { windowMs: MIN, max: 20 },
        { windowMs: HOUR_MS, max: 400 },
    ];

    it('allows 20 requests in a minute, blocks the 21st with a retry time', () => {
        let log: number[] = [];
        for (let i = 0; i < 20; i++) {
            const d = evaluateSlidingWindows(log, NOW + i, rules);
            expect(d.allowed).toBe(true);
            log = d.timestamps;
        }
        const blocked = evaluateSlidingWindows(log, NOW + 20, rules);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBe(60);
        // Blocked requests are not recorded.
        expect(blocked.timestamps).toHaveLength(20);
    });

    it('enforces the hourly cap even when each minute is under its cap', () => {
        // 400 requests spread over the last ~55 minutes (≈7/min).
        const log = Array.from({ length: 400 }, (_, i) => NOW - 55 * MIN + i * 8_000);
        const d = evaluateSlidingWindows(log, NOW, rules);
        expect(d.allowed).toBe(false);
        // The oldest entry leaves the hour window ~5 minutes from now.
        expect(d.retryAfterSeconds).toBeGreaterThan(4 * 60);
        expect(d.retryAfterSeconds).toBeLessThanOrEqual(5 * 60);
    });

    it('drops entries older than the longest window', () => {
        const d = evaluateSlidingWindows([NOW - 2 * HOUR_MS, NOW - 10], NOW, rules);
        expect(d.allowed).toBe(true);
        expect(d.timestamps).toEqual([NOW - 10, NOW]);
    });
});

describe('per-user spend', () => {
    const freeCaps = { hourUsd: 1, dayUsd: 2 };

    it('allows spend under both caps', () => {
        const state = addUserSpend(null, NOW, 0.5);
        expect(evaluateUserSpend(state, NOW, freeCaps).allowed).toBe(true);
    });

    it('blocks at the hourly cap and retries when the oldest slot ages out', () => {
        let state = addUserSpend(null, NOW - 50 * MIN, 0.6);
        state = addUserSpend(state, NOW - 10 * MIN, 0.5);
        const d = evaluateUserSpend(state, NOW, freeCaps);
        expect(d.allowed).toBe(false);
        expect(d.reason).toBe('hour');
        // The 0.6 slot (started ≤ 50 min ago) leaves the window within ~10 min.
        expect(d.retryAfterSeconds).toBeGreaterThan(0);
        expect(d.retryAfterSeconds).toBeLessThanOrEqual(10 * 60);
    });

    it('blocks at the daily cap until the next UTC midnight', () => {
        let state = addUserSpend(null, NOW - 5 * HOUR_MS, 0.9);
        state = addUserSpend(state, NOW - 3 * HOUR_MS, 0.9);
        state = addUserSpend(state, NOW - 90 * MIN, 0.3);
        const d = evaluateUserSpend(state, NOW, freeCaps);
        expect(d.allowed).toBe(false);
        expect(d.reason).toBe('day');
        expect(d.retryAfterSeconds).toBe((utcDayStart(NOW) + DAY_MS - NOW) / 1000);
    });

    it('resets the day total on a new UTC day', () => {
        const yesterday = addUserSpend(null, NOW - DAY_MS, 5);
        const d = evaluateUserSpend(yesterday, NOW, freeCaps);
        expect(d.allowed).toBe(true);
        expect(d.dayUsd).toBe(0);
    });

    it('ignores zero / negative spend', () => {
        const state = addUserSpend(null, NOW, -3);
        expect(state.dayUsd).toBe(0);
        expect(state.hourSlots).toHaveLength(0);
    });

    it('keeps at most 12 five-minute hour slots', () => {
        let state = null as ReturnType<typeof addUserSpend> | null;
        for (let i = 0; i < 30; i++) state = addUserSpend(state, NOW - 120 * MIN + i * 5 * MIN, 0.01);
        expect(state!.hourSlots.length).toBeLessThanOrEqual(12);
    });
});

describe('fleet budget', () => {
    it('clamps forged or invalid event costs', () => {
        expect(clampEventCost(1e9, 10)).toBe(10);
        expect(clampEventCost(-5, 10)).toBe(0);
        expect(clampEventCost(Number.NaN, 10)).toBe(0);
        expect(clampEventCost(0.02, 10)).toBe(0.02);
    });

    it('caps one user share of the fleet total per day', () => {
        expect(fleetContribution(5, 0, 100)).toBe(5);
        expect(fleetContribution(5, 98, 100)).toBe(2);
        expect(fleetContribution(5, 150, 100)).toBe(0);
    });

    it('blocks at or over the budget', () => {
        expect(isFleetBudgetExceeded(299.99, 300)).toBe(false);
        expect(isFleetBudgetExceeded(300, 300)).toBe(true);
    });

    it('logs the crossing once: warning at 80%, exceeded at 100%', () => {
        expect(fleetBudgetCrossing(200, 245, 300)).toBe('warning');
        expect(fleetBudgetCrossing(245, 250, 300)).toBeNull();
        expect(fleetBudgetCrossing(299, 301, 300)).toBe('exceeded');
        expect(fleetBudgetCrossing(301, 305, 300)).toBeNull();
    });
});

describe('evaluateTurnContinuation', () => {
    it('allows 5 continuations per turn and rejects the 6th', () => {
        let state = evaluateTurnContinuation(null, { key: 't1', isContinuation: false }, 5).next;
        for (let i = 0; i < 5; i++) {
            const d = evaluateTurnContinuation(state, { key: 't1', isContinuation: true }, 5);
            expect(d.allowed).toBe(true);
            state = d.next;
        }
        expect(evaluateTurnContinuation(state, { key: 't1', isContinuation: true }, 5).allowed).toBe(
            false,
        );
    });

    it('resets on a fresh user turn', () => {
        const capped = { turnKey: 't1', continuations: 5 };
        const fresh = evaluateTurnContinuation(capped, { key: 't2', isContinuation: false }, 5);
        expect(fresh).toEqual({ allowed: true, next: { turnKey: 't2', continuations: 0 } });
    });

    it('counts a continuation for an unseen turn as the first', () => {
        const d = evaluateTurnContinuation(
            { turnKey: 'old', continuations: 5 },
            { key: 'new', isContinuation: true },
            5,
        );
        expect(d).toEqual({ allowed: true, next: { turnKey: 'new', continuations: 1 } });
    });
});

describe('fleet shards', () => {
    it('sums all shards and ignores junk', () => {
        expect(sumFleetShards([{ usd: 1.5 }, { usd: 2 }, { usd: Number.NaN }])).toBe(3.5);
    });

    it('always picks a shard in range', () => {
        expect(pickFleetShard(() => 0)).toBe(0);
        expect(pickFleetShard(() => 0.9999999)).toBe(FLEET_SPEND_SHARDS - 1);
        expect(pickFleetShard(() => 1)).toBe(FLEET_SPEND_SHARDS - 1);
    });
});

describe('withoutRecordedTimestamp', () => {
    it('removes exactly one matching entry so a refused request is not counted', () => {
        expect(withoutRecordedTimestamp([1, 2, 2, 3], 2)).toEqual([1, 2, 3]);
        expect(withoutRecordedTimestamp([1, 3], 2)).toEqual([1, 3]);
    });
});
