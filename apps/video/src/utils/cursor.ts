/**
 * Cursor motion helpers. Every cursor click in the video must:
 *   1. Have the cursor arrive at the target's pixel coords by `clickFrame - 4`.
 *   2. Stay stationary on the target through `clickFrame`.
 *   3. Click ripple mounts at the cursor's pixel coords (so they always match).
 *
 * Use `cursorAt(frame, segments)` to get the cursor position. Use
 * `tipOffset` when computing the visible click position — the cursor SVG's
 * "tip" is at (3, 2) in its 20×20 source, so the click should be drawn at
 * (cursor.x + 3, cursor.y + 2).
 *
 * Motion language:
 *   - Travel duration default 22 frames (faster than old 28 / 50+).
 *   - End-of-move 4-frame settle compressed (cursor lands by clickFrame - 4).
 *   - Time curve is easeOutQuart (snappy enter, gentle land).
 *   - Bezier control points are asymmetric (biased toward target) — see
 *     `naturalCursorPath`.
 */
import type { Point } from './paths';
import { naturalCursorPath } from './paths';
import { easeInOutQuad } from './timing';

export const CURSOR_TIP_OFFSET: Point = { x: 3, y: 2 };

export interface CursorMoveSegment {
    /** Start frame of this move (composition-local or scene-local — caller's choice). */
    fromFrame: number;
    /** Frame at which the cursor finishes arriving at `to`. The cursor stays
     *  parked at `to` from this frame onward (until a later segment overrides). */
    toFrame: number;
    from: Point;
    to: Point;
    /** Optional control points for a cubic-Bezier curve. Defaults to
     *  `naturalCursorPath`'s control points (asymmetric, biased toward target). */
    c1?: Point;
    c2?: Point;
}

/**
 * Resolve cursor (x, y) for a given frame against a list of moves. Segments
 * are evaluated in order; the first that contains `frame` (or comes before
 * `frame`) determines the cursor's position. Outside the first segment the
 * cursor parks at the first segment's `from`. After the last segment the
 * cursor parks at its `to`.
 */
export const cursorAt = (frame: number, segments: readonly CursorMoveSegment[]): Point => {
    if (segments.length === 0) return { x: 0, y: 0 };
    const first = segments[0]!;
    if (frame < first.fromFrame) return first.from;

    for (const seg of segments) {
        if (frame >= seg.fromFrame && frame <= seg.toFrame) {
            const span = Math.max(1, seg.toFrame - seg.fromFrame);
            const local = frame - seg.fromFrame;
            return naturalCursorPath(seg.from, seg.to, local, span);
        }
    }

    // Find the latest segment that ended before this frame
    let parked: Point = first.from;
    for (const seg of segments) {
        if (seg.toFrame <= frame) parked = seg.to;
    }
    return parked;
};

/**
 * Build a click cue: the cursor arrives at `target` by `clickFrame - 4` and
 * stays there. Use the result as one entry in the segments list passed to
 * `cursorAt`.
 *
 * @param fromPoint Where the cursor was last parked.
 * @param target    Target click position (where the cursor TIP should land).
 * @param clickFrame Frame at which the click happens.
 * @param travelFrames Frames the cursor takes to travel (default 22 — fast,
 *                     natural, never longer than 28 unless the move is
 *                     intentionally a "long sweep").
 */
export const moveToClick = (
    fromPoint: Point,
    target: Point,
    clickFrame: number,
    travelFrames = 22,
): CursorMoveSegment => {
    const settleBefore = 4;
    const fromFrame = clickFrame - travelFrames - settleBefore;
    const toFrame = clickFrame - settleBefore;
    return {
        fromFrame,
        toFrame,
        from: fromPoint,
        // We render the cursor with its TOP-LEFT at the segment's `to`. The
        // tip is at (3, 2), so to place the tip at `target` we offset by
        // `-tipOffset`.
        to: { x: target.x - CURSOR_TIP_OFFSET.x, y: target.y - CURSOR_TIP_OFFSET.y },
    };
};

/**
 * Drift segment: cursor wanders gently between two nearby points to add
 * incidental motion during text-only holds.
 */
export const drift = (
    fromPoint: Point,
    toPoint: Point,
    fromFrame: number,
    toFrame: number,
): CursorMoveSegment => ({
    fromFrame,
    toFrame,
    from: fromPoint,
    to: toPoint,
});

/**
 * Convert a cursor position (top-left of the SVG) into the screen-space
 * tip position — i.e., where a click ripple should be drawn.
 */
export const cursorTip = (pos: Point): Point => ({
    x: pos.x + CURSOR_TIP_OFFSET.x,
    y: pos.y + CURSOR_TIP_OFFSET.y,
});

// Re-export for convenience when scenes only need eased lerps.
export { easeInOutQuad };
