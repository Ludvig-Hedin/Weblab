import { describe, expect, it } from 'bun:test';

import { AI_GUARD_DEFAULTS, readAiGuardConfig, retryHint } from './aiGuardConfig';

describe('readAiGuardConfig', () => {
    it('uses the documented defaults with an empty env', () => {
        const c = readAiGuardConfig({});
        expect(c.disabled).toBe(false);
        expect(c.dailyBudgetUsd).toBe(20);
        expect(c.userCaps.free).toEqual({ hourUsd: 1, dayUsd: 2 });
        expect(c.userCaps.pro).toEqual({ hourUsd: 10, dayUsd: 40 });
        expect(c.buckets.llm.map((r) => r.max)).toEqual([20, 400]);
        expect(c.buckets.tabComplete.map((r) => r.max)).toEqual([120]);
        expect(c.maxContinuationsPerTurn).toBe(AI_GUARD_DEFAULTS.maxContinuationsPerTurn);
    });

    it('reads overrides and the kill switch from env', () => {
        const c = readAiGuardConfig({
            AI_DISABLED: 'true',
            AI_DAILY_BUDGET_USD: '500',
            AI_PRO_DAILY_USD: '80',
            AI_REQUESTS_PER_MINUTE: '30',
        });
        expect(c.disabled).toBe(true);
        expect(c.dailyBudgetUsd).toBe(500);
        expect(c.userCaps.pro.dayUsd).toBe(80);
        expect(c.buckets.llm[0]!.max).toBe(30);
    });

    it('falls back to defaults for junk values', () => {
        const c = readAiGuardConfig({ AI_DAILY_BUDGET_USD: 'lots', AI_FREE_DAILY_USD: '-1' });
        expect(c.dailyBudgetUsd).toBe(20);
        expect(c.userCaps.free.dayUsd).toBe(2);
        expect(readAiGuardConfig({ AI_DISABLED: 'false' }).disabled).toBe(false);
    });
});

describe('retryHint', () => {
    it('formats seconds, minutes and hours', () => {
        expect(retryHint(1)).toBe('Try again in 1 second.');
        expect(retryHint(90)).toBe('Try again in 2 minutes.');
        expect(retryHint(3 * 3600)).toBe('Try again in 3 hours.');
    });
});
