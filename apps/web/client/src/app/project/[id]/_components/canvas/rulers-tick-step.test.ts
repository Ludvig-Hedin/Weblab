import { describe, expect, it } from 'bun:test';

import { pickTickStep, RULER_TICK_STEPS } from './rulers-tick-step';

describe('pickTickStep', () => {
    it('uses the canonical 1-2-5 progression', () => {
        // Locks the ladder. A change here is intentional and signals a
        // visible-density shift in the rulers — reviewers should look at
        // the rendered ruler before approving.
        expect(RULER_TICK_STEPS).toEqual([
            1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
        ]);
    });

    it('picks the smallest step whose screen-space distance meets the target', () => {
        // At scale=1.0, target=80px → 100 is the smallest step ≥ 80px on screen.
        expect(pickTickStep(1, 80)).toBe(100);
        // At scale=2.0, target=80px → 50 × 2 = 100px ≥ 80, so 50.
        expect(pickTickStep(2, 80)).toBe(50);
        // Heavy zoom-in (scale=4) → 25 × 4 = 100px works.
        expect(pickTickStep(4, 80)).toBe(25);
    });

    it('falls back to the largest step at extreme zoom-out', () => {
        // At scale=0.001 nothing in the ladder reaches 80px, so we cap at
        // the largest step — rulers stop densifying rather than disappear.
        expect(pickTickStep(0.001, 80)).toBe(10000);
    });

    it('returns the largest fallback for non-finite / non-positive scale', () => {
        // The early-return treats `Number.isFinite` falsy as a defensive
        // fallback — Infinity is lumped in with NaN here because no real
        // canvas zoom hits it, and we'd rather drop to the safe cap than
        // try to use Infinity * step inside the loop.
        expect(pickTickStep(0, 80)).toBe(10000);
        expect(pickTickStep(-1, 80)).toBe(10000);
        expect(pickTickStep(Number.NaN, 80)).toBe(10000);
        expect(pickTickStep(Number.POSITIVE_INFINITY, 80)).toBe(10000);
    });

    it('honors a custom targetMinPx', () => {
        // Larger target → bigger step picked at the same scale.
        expect(pickTickStep(1, 80)).toBe(100);
        expect(pickTickStep(1, 200)).toBe(250);
        expect(pickTickStep(1, 600)).toBe(1000);
    });
});
