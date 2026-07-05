import { describe, expect, it } from 'bun:test';

import { OverlayState } from './state';

// Regression: resize-drag overlay feedback was dead because updateClickedRects
// mutated rects in place (Object.assign), which never changed the observable
// array reference — the canvas overlay memoizes on that reference and returned
// stale nodes, freezing the selection rect during a resize drag.
describe('OverlayState.updateClickedRects', () => {
    const seedRect = () => ({
        width: 100,
        height: 50,
        top: 10,
        left: 20,
    });

    it('replaces the array reference so a memo keyed on it re-renders', () => {
        const state = new OverlayState();
        state.addClickRect(seedRect(), null, false, 'a');
        const before = state.clickRects;

        state.updateClickedRects({ width: 200 });

        expect(state.clickRects).not.toBe(before);
    });

    it('merges the new rect fields onto every click rect (fresh objects)', () => {
        const state = new OverlayState();
        state.addClickRect(seedRect(), null, false, 'a');
        state.addClickRect(seedRect(), null, false, 'b');
        const firstBefore = state.clickRects[0];

        state.updateClickedRects({ width: 200, top: 40 });

        // New element objects (not mutated in place).
        expect(state.clickRects[0]).not.toBe(firstBefore);
        // Updated fields applied.
        expect(state.clickRects.every((r) => r.width === 200 && r.top === 40)).toBe(true);
        // Untouched fields preserved.
        expect(state.clickRects[0]?.height).toBe(50);
        expect(state.clickRects[0]?.left).toBe(20);
        // Identity preserved.
        expect(state.clickRects[0]?.id).toBe('a');
        expect(state.clickRects[1]?.id).toBe('b');
    });

    it('is a no-op shape change on an empty selection', () => {
        const state = new OverlayState();
        expect(() => state.updateClickedRects({ width: 5 })).not.toThrow();
        expect(state.clickRects).toEqual([]);
    });
});
