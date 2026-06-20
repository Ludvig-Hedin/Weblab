// Pure geometry for the Webflow-style "Lock canvas" mode. Kept free of React
// and MobX so it can be unit-tested in isolation. The editor canvas applies
// `translate(pos.x, pos.y) scale(s)` with `transform-origin: 0 0`, so the
// identity used throughout is:  screenX = pos.x + worldX * scale.
//
// All inputs are in the same coordinate space as that transform — window/canvas
// pixels for the gap bounds, world pixels for the frame rect. `gapLeft` /
// `gapRight` are the screen-x bounds of the area between the side panels
// (left-panel right edge … window width − right-panel width).

const DEFAULT_MAX_SCALE = 1; // never upscale a frame past 100% when fitting
const DEFAULT_MIN_SCALE = 0.1;

/** Screen-y the pinned frame's top rests at — clears the top bar (~56) + editor bar. */
export const LOCKED_TOP_GAP = 96;
/** Breathing room around the pinned frame, in screen px. */
export const LOCKED_PADDING = 24;

export interface LockedFitParams {
    /** Frame responsive width in world px (breakpoint.width ?? dimension.width). */
    frameWidth: number;
    /** Frame world-space top-left. */
    frameX: number;
    frameY: number;
    /** Screen-x of the left/right bounds of the gap between the panels. */
    gapLeft: number;
    gapRight: number;
    /** Screen-y the frame's top should rest at (clears top bar + editor bar). */
    topGap: number;
    /** Horizontal breathing room inside the gap, per side. */
    padding: number;
    /** Upper scale cap (default 1 — don't magnify past 100%). */
    maxScale?: number;
    /** Lower scale floor (default 0.1, matching the canvas MIN_ZOOM). */
    minScale?: number;
}

export interface LockedTransform {
    scale: number;
    x: number;
    y: number;
}

export interface LockedClampParams {
    position: { x: number; y: number };
    scale: number;
    /** Focused frame rect in world px (height uses live contentHeight). */
    frame: { x: number; y: number; width: number; height: number };
    gapLeft: number;
    gapRight: number;
    topGap: number;
    /** Canvas viewport height in screen px (≈ window.innerHeight). */
    viewportHeight: number;
    padding: number;
}

function clamp(value: number, min: number, max: number): number {
    if (max < min) return min; // degenerate bounds → prefer the lower edge
    return Math.min(Math.max(value, min), max);
}

/**
 * Fit-to-width: scale the focused frame so it fills the gap between the panels
 * (capped at 100%), center it horizontally, and rest its top at `topGap`.
 */
export function computeLockedFit(params: LockedFitParams): LockedTransform {
    const { frameWidth, frameX, frameY, gapLeft, gapRight, topGap, padding } = params;
    const maxScale = params.maxScale ?? DEFAULT_MAX_SCALE;
    const minScale = params.minScale ?? DEFAULT_MIN_SCALE;

    const gapWidth = Math.max(0, gapRight - gapLeft);
    const availWidth = Math.max(1, gapWidth - padding * 2);

    const rawScale = frameWidth > 0 ? availWidth / frameWidth : maxScale;
    const scale = clamp(rawScale, minScale, maxScale);

    const gapCenterX = gapLeft + gapWidth / 2;
    const frameMidX = frameX + frameWidth / 2;
    const x = gapCenterX - frameMidX * scale;

    const y = topGap - frameY * scale;

    return { scale, x, y };
}

/**
 * Keep the focused frame "containing" the padded viewport: when it is wider /
 * taller than the available area allow scrolling but clamp to its edges (never
 * reveal empty canvas); when it is smaller, lock-center that axis. This powers
 * vertical scroll on tall pages and keeps manual +/- zoom contained.
 */
export function clampLockedPosition(params: LockedClampParams): { x: number; y: number } {
    const { position, scale, frame, gapLeft, gapRight, topGap, viewportHeight, padding } = params;

    const gapWidth = Math.max(0, gapRight - gapLeft);
    const availWidth = Math.max(1, gapWidth - padding * 2);
    const availHeight = Math.max(1, viewportHeight - topGap - padding);

    const frameWidthPx = frame.width * scale;
    const frameHeightPx = frame.height * scale;

    // ── X axis ──────────────────────────────────────────────────────────
    let x: number;
    if (frameWidthPx <= availWidth) {
        const gapCenterX = gapLeft + gapWidth / 2;
        x = gapCenterX - (frame.x + frame.width / 2) * scale;
    } else {
        // left edge ≤ gapLeft+padding  AND  right edge ≥ gapRight−padding
        const maxX = gapLeft + padding - frame.x * scale;
        const minX = gapRight - padding - (frame.x + frame.width) * scale;
        x = clamp(position.x, minX, maxX);
    }

    // ── Y axis ──────────────────────────────────────────────────────────
    let y: number;
    if (frameHeightPx <= availHeight) {
        y = topGap - frame.y * scale;
    } else {
        // top edge ≤ topGap  AND  bottom edge ≥ viewportHeight−padding
        const maxY = topGap - frame.y * scale;
        const minY = viewportHeight - padding - (frame.y + frame.height) * scale;
        y = clamp(position.y, minY, maxY);
    }

    return { x, y };
}
