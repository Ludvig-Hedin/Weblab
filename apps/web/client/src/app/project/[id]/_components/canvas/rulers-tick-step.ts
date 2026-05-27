/**
 * Adaptive tick-step ladder for the canvas rulers. Extracted from
 * `rulers.tsx` so the heuristic can be locked behind a unit test —
 * visual drift in the step picker is the kind of bug only humans catch
 * unless we pin it.
 *
 * The labeled step is the canvas-space distance between two numbered
 * tick marks (e.g. "0 — 100 — 200" at scale=1, "0 — 1000 — 2000" zoomed
 * out). Sub-ticks are drawn at one-fifth of the labeled step.
 */

// Standard 1-2-5 progression — same family Figma and Sketch use. Anything
// outside this set looks unbalanced (e.g. "every 3px" leaves odd labels).
export const RULER_TICK_STEPS = [
    1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
] as const;

/**
 * Pick the smallest step whose **screen-space** distance is at least
 * `targetMinPx`. Falls back to the largest available step at extreme
 * zoom-out so tick marks never become denser than this minimum.
 *
 * @param scale Canvas world → screen scale factor (e.g. 0.5 zoomed out).
 * @param targetMinPx Minimum number of CSS pixels between labeled ticks.
 */
export function pickTickStep(scale: number, targetMinPx: number): number {
    // `RULER_TICK_STEPS` is non-empty + readonly, so the last index is safe to
    // dereference. The type-system widens it to `number | undefined` because
    // `noUncheckedIndexedAccess` is on; use a const fallback to satisfy that.
    const fallback = RULER_TICK_STEPS[RULER_TICK_STEPS.length - 1] ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) return fallback;
    for (const step of RULER_TICK_STEPS) {
        if (step * scale >= targetMinPx) return step;
    }
    return fallback;
}
