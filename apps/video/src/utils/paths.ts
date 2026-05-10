import { easeOutQuart } from './timing';

export interface Point {
    x: number;
    y: number;
}

export interface CursorMoveResult {
    x: number;
    y: number;
    isMoving: boolean;
}

/**
 * Cubic Bezier curve evaluated at parametric `t` (0..1).
 * Used to drive cursor motion along eased paths instead of straight lines.
 */
export const cubicBezier = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
    const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;

    return { x, y };
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Natural cursor motion: cubic-Bezier biased toward target with a slight
 * arch and asymmetric control points (real mouse motion accelerates fast
 * and decelerates as it lands). Time curve is easeOutQuart so the cursor
 * "snaps" toward the target then settles.
 *
 * @param p0 start (top-left of cursor)
 * @param p1 end   (top-left of cursor)
 * @param frameInSegment current frame relative to segment start (0..durationFrames)
 * @param durationFrames total length of the move
 */
export const naturalCursorPath = (
    p0: Point,
    p1: Point,
    frameInSegment: number,
    durationFrames: number,
): Point => {
    const span = Math.max(1, durationFrames);
    const tRaw = Math.max(0, Math.min(1, frameInSegment / span));
    const eased = easeOutQuart(tRaw);

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    // Asymmetric control points biased toward the target (real motion
    // overshoots the midpoint then decelerates).
    const c1: Point = {
        x: p0.x + dx * 0.42,
        y: p0.y + dy * 0.18 - 18,
    };
    const c2: Point = {
        x: p0.x + dx * 0.78,
        y: p0.y + dy * 0.92 - 6,
    };
    return cubicBezier(p0, c1, c2, p1, eased);
};

/**
 * Punchy cursor hop from `start` → `end` over `frames` frames. Designed for
 * realistic mouse motion: easeOutQuart on the time axis (snappy take-off,
 * gentle settle), Bezier path with control points biased toward target
 * (slight overshoot at midpoint). After `frames`, the cursor parks at `end`
 * and `isMoving` is false.
 *
 * Use cases:
 *   - Short hops (within a panel): 12–18 frames.
 *   - Cross-panel hops:           18–24 frames.
 *   - Screen-spanning sweeps:     24–36 frames.
 * Never longer than 36 — that's where motion starts to crawl.
 */
export const cursorMoveToTarget = (
    start: Point,
    end: Point,
    frames: number,
    currentFrame: number,
): CursorMoveResult => {
    const span = Math.max(1, frames);
    if (currentFrame <= 0) return { x: start.x, y: start.y, isMoving: true };
    if (currentFrame >= span) return { x: end.x, y: end.y, isMoving: false };

    const tRaw = currentFrame / span;
    const eased = easeOutQuart(tRaw);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    // Slight upward arch midway so motion reads as natural, not a straight
    // ramp. Magnitude is clamped relative to the move's distance so short
    // hops don't get a comically tall arc.
    const distance = Math.sqrt(dx * dx + dy * dy);
    const arch = Math.min(20, distance * 0.06);
    const c1: Point = {
        x: start.x + dx * 0.42,
        y: start.y + dy * 0.18 - arch,
    };
    const c2: Point = {
        x: start.x + dx * 0.78,
        y: start.y + dy * 0.92 - arch * 0.4,
    };
    const pos = cubicBezier(start, c1, c2, end, eased);
    return { x: pos.x, y: pos.y, isMoving: true };
};
