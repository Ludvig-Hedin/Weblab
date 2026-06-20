import { describe, expect, it } from 'bun:test';

import { clampLockedPosition, computeLockedFit } from './locked-layout';

describe('computeLockedFit', () => {
    it('fits the frame to the gap width and centers it horizontally', () => {
        // 1000px frame at world origin, 900px gap, no padding → scale 0.9.
        const { scale, x, y } = computeLockedFit({
            frameWidth: 1000,
            frameX: 0,
            frameY: 0,
            gapLeft: 0,
            gapRight: 900,
            topGap: 96,
            padding: 0,
        });
        expect(scale).toBeCloseTo(0.9, 5);
        // gapCenter 450 − frameMid(500)*0.9 (=450) → 0.
        expect(x).toBeCloseTo(0, 5);
        // top rests at topGap since frameY is 0.
        expect(y).toBeCloseTo(96, 5);
    });

    it('caps scale at 1 — never magnifies a frame narrower than the gap', () => {
        const { scale, x } = computeLockedFit({
            frameWidth: 300,
            frameX: 0,
            frameY: 0,
            gapLeft: 0,
            gapRight: 900,
            topGap: 0,
            padding: 0,
        });
        expect(scale).toBe(1);
        // Still centered: gapCenter 450 − frameMid(150)*1 → 300.
        expect(x).toBeCloseTo(300, 5);
    });

    it('honors horizontal padding and a non-zero gapLeft', () => {
        // gap 100..1000 (width 900), padding 50 → availWidth 800, scale 0.8.
        const { scale, x } = computeLockedFit({
            frameWidth: 1000,
            frameX: 0,
            frameY: 0,
            gapLeft: 100,
            gapRight: 1000,
            topGap: 0,
            padding: 50,
        });
        expect(scale).toBeCloseTo(0.8, 5);
        // gapCenter 550 − frameMid(500)*0.8 (=400) → 150.
        expect(x).toBeCloseTo(150, 5);
    });

    it('accounts for a non-zero frame world position when centering/aligning', () => {
        const { scale, x, y } = computeLockedFit({
            frameWidth: 500,
            frameX: 200,
            frameY: 80,
            gapLeft: 0,
            gapRight: 1000,
            topGap: 96,
            padding: 0,
            maxScale: 1,
        });
        expect(scale).toBe(1); // 1000/500 = 2, capped to 1
        // gapCenter 500 − frameMid(200+250=450)*1 → 50.
        expect(x).toBeCloseTo(50, 5);
        // topGap 96 − frameY(80)*1 → 16.
        expect(y).toBeCloseTo(16, 5);
    });
});

describe('clampLockedPosition', () => {
    const base = {
        gapLeft: 0,
        gapRight: 900,
        topGap: 100,
        viewportHeight: 800,
        padding: 0,
    };

    it('locks a short frame at topGap and ignores attempts to scroll it', () => {
        const { y } = clampLockedPosition({
            ...base,
            position: { x: 0, y: -500 }, // user tried to scroll up
            scale: 1,
            frame: { x: 0, y: 0, width: 900, height: 400 }, // 400 < availHeight (700)
        });
        // Short page → top pinned at topGap regardless of attempted scroll.
        expect(y).toBeCloseTo(100, 5);
    });

    it('clamps a tall frame so its top/bottom edges never leave the viewport', () => {
        const frame = { x: 0, y: 0, width: 900, height: 2000 }; // taller than viewport
        // Top edge can rest at most at topGap (100) → maxY = 100.
        const tooFarDown = clampLockedPosition({
            ...base,
            position: { x: 0, y: 9999 },
            scale: 1,
            frame,
        });
        expect(tooFarDown.y).toBeCloseTo(100, 5);
        // Bottom edge pinned to viewport bottom (800) → minY = 800 − 2000 = −1200.
        const tooFarUp = clampLockedPosition({
            ...base,
            position: { x: 0, y: -9999 },
            scale: 1,
            frame,
        });
        expect(tooFarUp.y).toBeCloseTo(-1200, 5);
        // A value inside the range passes through untouched.
        const within = clampLockedPosition({
            ...base,
            position: { x: 0, y: -300 },
            scale: 1,
            frame,
        });
        expect(within.y).toBeCloseTo(-300, 5);
    });

    it('lock-centers the X axis when the frame is narrower than the gap', () => {
        const { x } = clampLockedPosition({
            ...base,
            position: { x: 12345, y: 100 }, // bogus horizontal scroll
            scale: 1,
            frame: { x: 0, y: 0, width: 500, height: 300 }, // 500 < gap 900
        });
        // gapCenter 450 − frameMid(250)*1 → 200, independent of the input x.
        expect(x).toBeCloseTo(200, 5);
    });

    it('allows clamped horizontal scroll when the frame is wider than the gap', () => {
        const frame = { x: 0, y: 0, width: 1500, height: 300 }; // wider than gap 900
        // maxX = gapLeft+padding − frameX*scale = 0 ; minX = gapRight − (x+w)*scale = 900−1500 = −600.
        const right = clampLockedPosition({
            ...base,
            position: { x: 999, y: 100 },
            scale: 1,
            frame,
        });
        expect(right.x).toBeCloseTo(0, 5);
        const left = clampLockedPosition({
            ...base,
            position: { x: -999, y: 100 },
            scale: 1,
            frame,
        });
        expect(left.x).toBeCloseTo(-600, 5);
    });
});
