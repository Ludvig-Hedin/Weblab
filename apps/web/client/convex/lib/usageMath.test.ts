import { describe, expect, it } from 'bun:test';

import {
    isAtOrOverCap,
    normalizeCredits,
    selectDeductionBucket,
    sumUsageAmount,
    type DeductionBucket,
} from './usageMath';

const NOW = 1_000_000;

function bucket(partial: Partial<DeductionBucket> & { _id: string }): DeductionBucket {
    return {
        left: 100,
        endedAt: NOW + 10_000,
        carryOverTotal: 0,
        ...partial,
    };
}

describe('selectDeductionBucket', () => {
    it('returns null when there are no buckets', () => {
        expect(selectDeductionBucket([], NOW, 1)).toBeNull();
    });

    it('ignores expired buckets (endedAt <= now)', () => {
        const expired = bucket({ _id: 'a', endedAt: NOW, left: 100 });
        expect(selectDeductionBucket([expired], NOW, 1)).toBeNull();
    });

    it('returns null when no single bucket can cover the needed credits', () => {
        const b1 = bucket({ _id: 'a', left: 3 });
        const b2 = bucket({ _id: 'b', left: 4 });
        // Sum is 7 but no single bucket has >= 5 — stricter single-bucket rule.
        expect(selectDeductionBucket([b1, b2], NOW, 5)).toBeNull();
    });

    it('picks a bucket that has exactly the needed credits', () => {
        const b = bucket({ _id: 'a', left: 5 });
        expect(selectDeductionBucket([b], NOW, 5)?._id).toBe('a');
    });

    it('prefers the bucket with the most carry-over (oldest credits first)', () => {
        const low = bucket({ _id: 'a', carryOverTotal: 1 });
        const high = bucket({ _id: 'b', carryOverTotal: 9 });
        expect(selectDeductionBucket([low, high], NOW, 1)?._id).toBe('b');
    });

    it('breaks carry-over ties deterministically by id', () => {
        const b1 = bucket({ _id: 'zzz', carryOverTotal: 5 });
        const b2 = bucket({ _id: 'aaa', carryOverTotal: 5 });
        expect(selectDeductionBucket([b1, b2], NOW, 1)?._id).toBe('aaa');
    });

    it('is equivalent to the legacy left>0 filter when needed is 1', () => {
        const empty = bucket({ _id: 'a', left: 0 });
        const one = bucket({ _id: 'b', left: 1 });
        expect(selectDeductionBucket([empty, one], NOW, 1)?._id).toBe('b');
    });
});

describe('sumUsageAmount', () => {
    it('treats records without an amount as 1 (legacy rows)', () => {
        expect(sumUsageAmount([{}, {}, {}])).toBe(3);
    });

    it('sums explicit amounts', () => {
        expect(sumUsageAmount([{ amount: 5 }, { amount: 1 }])).toBe(6);
    });

    it('mixes legacy and amount-bearing records', () => {
        expect(sumUsageAmount([{ amount: 5 }, {}, { amount: 2 }])).toBe(8);
    });

    it('is 0 for an empty list', () => {
        expect(sumUsageAmount([])).toBe(0);
    });
});

describe('isAtOrOverCap', () => {
    it('blocks at the cap boundary', () => {
        expect(isAtOrOverCap(2, 2)).toBe(true);
    });
    it('allows below the cap', () => {
        expect(isAtOrOverCap(1, 2)).toBe(false);
    });
    it('blocks above the cap', () => {
        expect(isAtOrOverCap(3, 2)).toBe(true);
    });
});

describe('normalizeCredits', () => {
    it('defaults undefined to 1', () => {
        expect(normalizeCredits(undefined)).toBe(1);
    });
    it('floors fractional costs', () => {
        expect(normalizeCredits(5.9)).toBe(5);
    });
    it('clamps zero and negatives up to 1', () => {
        expect(normalizeCredits(0)).toBe(1);
        expect(normalizeCredits(-3)).toBe(1);
    });
    it('passes through valid positive integers', () => {
        expect(normalizeCredits(5)).toBe(5);
    });
});
