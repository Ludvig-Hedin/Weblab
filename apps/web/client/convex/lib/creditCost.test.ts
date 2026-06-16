import { describe, expect, it } from 'bun:test';

import {
    creditValueUsd,
    FREE_CREDIT_VALUE_USD,
    LLM_COST_BUDGET_FRACTION,
    reconciledBucketLeft,
    usdToCredits,
} from './creditCost';

describe('creditValueUsd', () => {
    it('values entry tier T1 at $0.125/credit ($25 * 0.5 / 100)', () => {
        expect(creditValueUsd({ key: 'PRO_MONTHLY_TIER_1', monthlyMessageLimit: 100 })).toBeCloseTo(
            0.125,
            10,
        );
    });

    it('keeps a constant $/credit across the linearly-priced tiers (T4)', () => {
        expect(creditValueUsd({ key: 'PRO_MONTHLY_TIER_4', monthlyMessageLimit: 800 })).toBeCloseTo(
            0.125,
            10,
        );
    });

    it('prices the "Unlimited" T11 far lower so its budget stays bounded', () => {
        // $3750 * 0.5 / 99999 ≈ $0.01875 — total budget resolves to ~$1875 (50%).
        const cv = creditValueUsd({
            key: 'PRO_MONTHLY_TIER_11',
            monthlyMessageLimit: 99999,
        });
        expect(cv).toBeCloseTo(0.018750187, 8);
        expect(cv * 99999).toBeCloseTo(1875, 6);
    });

    it('reflects the budget fraction: total credit budget == price * fraction', () => {
        const price = { key: 'PRO_MONTHLY_TIER_2', monthlyMessageLimit: 200 }; // $50, T2
        const budget = creditValueUsd(price) * price.monthlyMessageLimit;
        expect(budget).toBeCloseTo((5000 / 100) * LLM_COST_BUDGET_FRACTION, 10);
    });

    it('returns 0 for a non-positive message limit (no divide-by-zero)', () => {
        expect(creditValueUsd({ key: 'PRO_MONTHLY_TIER_1', monthlyMessageLimit: 0 })).toBe(0);
        expect(creditValueUsd({ key: 'PRO_MONTHLY_TIER_1', monthlyMessageLimit: -5 })).toBe(0);
    });

    it('returns 0 for an unknown/legacy tier key (treated as unpriceable)', () => {
        expect(creditValueUsd({ key: 'PRO_MONTHLY_TIER_25', monthlyMessageLimit: 100 })).toBe(0);
        expect(creditValueUsd({ key: 'nonsense', monthlyMessageLimit: 100 })).toBe(0);
    });
});

describe('usdToCredits', () => {
    it('converts a $0.05 message on T1 to 0.4 credits', () => {
        const cv = creditValueUsd({
            key: 'PRO_MONTHLY_TIER_1',
            monthlyMessageLimit: 100,
        }); // 0.125
        expect(usdToCredits(0.05, cv)).toBeCloseTo(0.4, 10);
    });

    it('converts the same $0.05 message to ~2.67 credits on T11 (cheaper credits)', () => {
        const cv = creditValueUsd({
            key: 'PRO_MONTHLY_TIER_11',
            monthlyMessageLimit: 99999,
        });
        expect(usdToCredits(0.05, cv)).toBeCloseTo(2.6667, 3);
    });

    it('prices a free message via FREE_CREDIT_VALUE_USD', () => {
        expect(usdToCredits(0.0625, FREE_CREDIT_VALUE_USD)).toBeCloseTo(0.5, 10);
    });

    it('returns 0 for an unpriceable request (creditValue 0)', () => {
        expect(usdToCredits(0.05, 0)).toBe(0);
        expect(usdToCredits(0.05, -1)).toBe(0);
        expect(usdToCredits(0.05, NaN)).toBe(0);
    });

    it('returns 0 for a zero/negative/NaN cost', () => {
        expect(usdToCredits(0, 0.125)).toBe(0);
        expect(usdToCredits(-0.05, 0.125)).toBe(0);
        expect(usdToCredits(NaN, 0.125)).toBe(0);
    });
});

describe('reconciledBucketLeft', () => {
    it('refunds part of the reservation for a cheap turn (actual < reserved)', () => {
        // Reserved 1, actual 0.4 -> delta -0.6 -> left rises by 0.6.
        expect(
            reconciledBucketLeft({
                bucketLeft: 99,
                bucketMax: 100,
                reserved: 1,
                actualCredits: 0.4,
            }),
        ).toBeCloseTo(99.6, 10);
    });

    it('deducts more for an expensive turn (actual > reserved)', () => {
        // Reserved 1, actual 3 -> delta +2 -> left drops by 2.
        expect(
            reconciledBucketLeft({
                bucketLeft: 99,
                bucketMax: 100,
                reserved: 1,
                actualCredits: 3,
            }),
        ).toBeCloseTo(97, 10);
    });

    it('floors at 0 — a pricey turn cannot drive the bucket negative', () => {
        expect(
            reconciledBucketLeft({
                bucketLeft: 0,
                bucketMax: 100,
                reserved: 1,
                actualCredits: 5,
            }),
        ).toBe(0);
    });

    it('caps at max — a refund cannot inflate the bucket above its ceiling', () => {
        // bucketLeft already at max; a 0-cost refund would push to max+1.
        expect(
            reconciledBucketLeft({
                bucketLeft: 100,
                bucketMax: 100,
                reserved: 1,
                actualCredits: 0,
            }),
        ).toBe(100);
    });

    it('full-refunds the reservation when the turn is unpriceable (actual 0)', () => {
        expect(
            reconciledBucketLeft({
                bucketLeft: 50,
                bucketMax: 100,
                reserved: 1,
                actualCredits: 0,
            }),
        ).toBeCloseTo(51, 10);
    });
});
