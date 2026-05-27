'use client';

import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';

import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { pickTickStep, RULER_TICK_STEPS } from './rulers-tick-step';

// Width of each ruler band. Matches Figma's 24px chrome — wide enough for
// 4-digit labels at the design system's 10px scale, narrow enough to leave
// the canvas room.
const RULER_THICKNESS = 24;

// Pixel range, in screen space, for the **labeled** step. Picking a labeled
// step inside this band keeps numbers legible without crowding (~120px is
// the sweet spot Figma uses too).
const TARGET_LABEL_STEP_MIN_PX = 80;

// CSS colors are read off the design tokens at draw time so the rulers
// follow light/dark themes without a re-mount. Names map to global.css
// variables defined in apps/web/client/src/app/globals.css.
const COLOR_VARS = {
    bg: '--background-canvas',
    border: '--border',
    tick: '--foreground-tertiary',
    text: '--foreground-tertiary',
    cursor: '--foreground-brand',
} as const;

function readCssVar(name: string): string {
    if (typeof document === 'undefined') return '#9ca3af';
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    // Most tokens resolve to a bare HSL triplet like "240 5% 64%" — wrap so
    // the canvas API accepts it. Pre-wrapped values (e.g. `rgb(...)`, `#...`)
    // pass through unchanged.
    if (!v) return '#9ca3af';
    if (v.startsWith('rgb') || v.startsWith('hsl') || v.startsWith('#')) return v;
    return `hsl(${v})`;
}

/**
 * Canvas-edge rulers — top + left bands that show pixel coordinates in the
 * canvas's world space (origin matches what frames are positioned against).
 * Re-draws on every zoom/pan tick via observer subscriptions.
 *
 * Mounts inside the canvas container as a sibling of the transformed
 * `#CANVAS_CONTAINER_ID` div so the rulers stay fixed while the canvas
 * pans/zooms. The bands cover the first 24px of each axis — the canvas
 * surface itself doesn't shift, the rulers just sit on top with
 * pointer-events disabled.
 */
export const Rulers = observer(() => {
    const editorEngine = useEditorEngine();
    const scale = editorEngine.canvas.scale;
    const position = editorEngine.canvas.position;

    const topCanvasRef = useRef<HTMLCanvasElement>(null);
    const leftCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        // Draw both bands on every scale / position change. `requestAnimationFrame`
        // would just queue work behind MobX's auto-update; the redraw cost is
        // ~0.2ms on a 1080p canvas so we draw synchronously.
        drawHorizontalRuler(topCanvasRef.current, scale, position.x);
        drawVerticalRuler(leftCanvasRef.current, scale, position.y);
    }, [scale, position.x, position.y]);

    // Resize observer keeps the canvases sized to their containers. The actual
    // DOM <canvas width> is set in device pixels (DPR-aware) while CSS sizes
    // it in CSS pixels.
    useEffect(() => {
        const top = topCanvasRef.current;
        const left = leftCanvasRef.current;
        if (!top || !left) return;
        const resize = () => {
            sizeCanvasToParent(top);
            sizeCanvasToParent(left);
            drawHorizontalRuler(top, scale, position.x);
            drawVerticalRuler(left, scale, position.y);
        };
        resize();
        const ro = new ResizeObserver(resize);
        if (top.parentElement) ro.observe(top.parentElement);
        if (left.parentElement) ro.observe(left.parentElement);
        window.addEventListener('resize', resize);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', resize);
        };
        // The drawing useEffect above re-runs on scale/position changes; this
        // one only watches DOM size.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            {/* Corner mask — sits at top-left where the two bands meet so
                their tick marks don't draw into each other. Matches Figma. */}
            <div
                aria-hidden
                className="bg-background-canvas border-border absolute top-0 left-0 z-30 border-r border-b"
                style={{ width: RULER_THICKNESS, height: RULER_THICKNESS }}
            />
            {/* Top band — full width minus the corner mask. */}
            <div
                aria-hidden
                className={cn(
                    'bg-background-canvas border-border pointer-events-none absolute top-0 z-30 border-b',
                )}
                style={{
                    left: RULER_THICKNESS,
                    right: 0,
                    height: RULER_THICKNESS,
                }}
            >
                <canvas ref={topCanvasRef} className="block h-full w-full" />
            </div>
            {/* Left band — full height minus the corner mask. */}
            <div
                aria-hidden
                className={cn(
                    'bg-background-canvas border-border pointer-events-none absolute left-0 z-30 border-r',
                )}
                style={{
                    top: RULER_THICKNESS,
                    bottom: 0,
                    width: RULER_THICKNESS,
                }}
            >
                <canvas ref={leftCanvasRef} className="block h-full w-full" />
            </div>
        </>
    );
});

function sizeCanvasToParent(canvas: HTMLCanvasElement) {
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio ?? 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    // Multiply backing store by DPR so we draw crisp on retina. CSS size
    // stays at the parent's clientWidth/Height via the `w-full h-full` class.
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
}

function drawHorizontalRuler(canvas: HTMLCanvasElement | null, scale: number, positionX: number) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio ?? 1;
    const widthCss = canvas.width / dpr;
    const heightCss = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, widthCss, heightCss);

    const tickColor = readCssVar(COLOR_VARS.tick);
    const textColor = readCssVar(COLOR_VARS.text);

    // The ruler band lives just below y=0 of the canvas-container coord
    // system. Map screenX → canvasX via the inverse of the canvas
    // transform: canvasX = (screenX - positionX) / scale. The ruler band
    // is offset right by RULER_THICKNESS in CSS (corner mask + left band),
    // so add it back when computing screen coords.
    const labelStep = pickTickStep(scale, TARGET_LABEL_STEP_MIN_PX);
    const subStep = labelStep / 5;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = textColor;
    ctx.lineWidth = 1;
    // Crisp pixel-grid rendering — half-pixel offset is the canonical
    // 2D-canvas trick for 1px-wide strokes.
    ctx.translate(0.5, 0.5);
    ctx.font = '10px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'top';

    // Compute the first labeled tick whose screen X is >= 0. We work in
    // canvas (world) coords for the math, then project to screen px.
    const visibleCanvasMin = -positionX / scale - RULER_THICKNESS / scale;
    const visibleCanvasMax = visibleCanvasMin + widthCss / scale;
    const firstSub = Math.ceil(visibleCanvasMin / subStep) * subStep;

    for (let c = firstSub; c <= visibleCanvasMax; c += subStep) {
        const screenX = c * scale + positionX - RULER_THICKNESS;
        if (screenX < -1 || screenX > widthCss + 1) continue;
        const isMajor = nearlyMultiple(c, labelStep);
        const tickHeight = isMajor ? 8 : 4;
        ctx.beginPath();
        ctx.moveTo(screenX, heightCss - tickHeight);
        ctx.lineTo(screenX, heightCss);
        ctx.stroke();
        if (isMajor) {
            const label = formatTickLabel(c);
            ctx.fillText(label, screenX + 3, 3);
        }
    }
    ctx.restore();
}

function drawVerticalRuler(canvas: HTMLCanvasElement | null, scale: number, positionY: number) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio ?? 1;
    const widthCss = canvas.width / dpr;
    const heightCss = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, widthCss, heightCss);

    const tickColor = readCssVar(COLOR_VARS.tick);
    const textColor = readCssVar(COLOR_VARS.text);

    const labelStep = pickTickStep(scale, TARGET_LABEL_STEP_MIN_PX);
    const subStep = labelStep / 5;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = textColor;
    ctx.lineWidth = 1;
    ctx.translate(0.5, 0.5);
    ctx.font = '10px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'top';

    // Vertical band runs the height of the canvas minus the top band.
    // canvasY corresponding to screenY=0 inside this band is at:
    //   canvasY = (0 - positionY + RULER_THICKNESS) / scale
    // because the band is offset down by RULER_THICKNESS in CSS.
    const visibleCanvasMin = -positionY / scale - RULER_THICKNESS / scale;
    const visibleCanvasMax = visibleCanvasMin + heightCss / scale;
    const firstSub = Math.ceil(visibleCanvasMin / subStep) * subStep;

    for (let c = firstSub; c <= visibleCanvasMax; c += subStep) {
        const screenY = c * scale + positionY - RULER_THICKNESS;
        if (screenY < -1 || screenY > heightCss + 1) continue;
        const isMajor = nearlyMultiple(c, labelStep);
        const tickWidth = isMajor ? 8 : 4;
        ctx.beginPath();
        ctx.moveTo(widthCss - tickWidth, screenY);
        ctx.lineTo(widthCss, screenY);
        ctx.stroke();
        if (isMajor) {
            // Rotated labels — Figma's vertical ruler reads bottom-to-top.
            const label = formatTickLabel(c);
            ctx.save();
            ctx.translate(widthCss - tickWidth - 3, screenY + 3);
            ctx.rotate(-Math.PI / 2);
            // After rotate(-90°), +x in the new frame points up the page,
            // so we draw the label horizontally and let the rotation flip it.
            ctx.fillText(label, 0, 0);
            ctx.restore();
        }
    }
    ctx.restore();
}

function formatTickLabel(canvasCoord: number): string {
    // Round to integer at the tick boundary — sub-pixel labels would just be
    // noise. Figma also rounds at this level.
    const rounded = Math.round(canvasCoord);
    return String(rounded);
}

function nearlyMultiple(value: number, step: number): boolean {
    // Floating-point safe "is value an integer multiple of step?".
    // Tolerance is well under 1px at any reasonable zoom level.
    if (step === 0) return false;
    const ratio = value / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

// Re-export the step ladder for the unit test in __tests__/rulers-tick-step.test.ts.
export { RULER_TICK_STEPS };
