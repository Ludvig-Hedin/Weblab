'use client';

import { useEffect, useState } from 'react';

import type { EditorEngine } from '@/components/store/editor/engine';
import {
    clampLockedPosition,
    computeLockedFit,
    LOCKED_PADDING,
    LOCKED_TOP_GAP,
} from '../_components/canvas/locked-layout';

/**
 * Drives the Webflow-style "Lock canvas" layout. While `state.canvasLocked` is
 * true it pins the focused frame fit-to-width between the side panels and keeps
 * it contained as panels/window/zoom change. Does nothing when unlocked.
 *
 * Called from `main.tsx`, which already measures the panel gap
 * (`toolbarLeft` / `toolbarRight` from usePanelMeasurements). `main` is an
 * observer, so the observable reads here make it react to lock/frame/scale.
 */
export function useLockedCanvasLayout(
    editorEngine: EditorEngine,
    toolbarLeft: number,
    toolbarRight: number,
) {
    const [viewport, setViewport] = useState(() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
    }));

    useEffect(() => {
        const onResize = () =>
            setViewport({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const locked = editorEngine.state.canvasLocked;
    // Focused frame: selected, falling back to the primary (order-sorted [0]).
    const focused = editorEngine.frames.selected[0] ?? editorEngine.frames.getAll()[0] ?? null;
    const focusedId = focused?.frame.id ?? null;
    const focusedWidth = focused
        ? (focused.frame.breakpoint?.width ?? focused.frame.dimension.width)
        : 0;
    const focusedX = focused?.frame.position.x ?? 0;
    const focusedY = focused?.frame.position.y ?? 0;
    const focusedDimHeight = focused?.frame.dimension.height ?? 0;
    const scale = editorEngine.canvas.scale;

    // Structural re-fit: on lock-on, frame switch, responsive-width change, and
    // panel/window resize — recompute fit-to-width scale + centered position.
    useEffect(() => {
        if (!locked || !focusedId) return;
        const fit = computeLockedFit({
            frameWidth: focusedWidth,
            frameX: focusedX,
            frameY: focusedY,
            gapLeft: toolbarLeft,
            gapRight: viewport.width - toolbarRight,
            topGap: LOCKED_TOP_GAP,
            padding: LOCKED_PADDING,
        });
        editorEngine.canvas.scale = fit.scale;
        editorEngine.canvas.position = { x: fit.x, y: fit.y };
    }, [
        editorEngine,
        locked,
        focusedId,
        focusedWidth,
        focusedX,
        focusedY,
        toolbarLeft,
        toolbarRight,
        viewport.width,
        viewport.height,
    ]);

    // Keep the frame contained on manual +/- zoom (scale changes) without
    // re-fitting — so zooming in never reveals empty canvas.
    useEffect(() => {
        if (!locked || !focusedId) return;
        const height = editorEngine.frames.get(focusedId)?.contentHeight ?? focusedDimHeight;
        const clamped = clampLockedPosition({
            position: editorEngine.canvas.position,
            scale,
            frame: { x: focusedX, y: focusedY, width: focusedWidth, height },
            gapLeft: toolbarLeft,
            gapRight: viewport.width - toolbarRight,
            topGap: LOCKED_TOP_GAP,
            viewportHeight: viewport.height,
            padding: LOCKED_PADDING,
        });
        editorEngine.canvas.position = clamped;
    }, [
        editorEngine,
        locked,
        scale,
        focusedId,
        focusedWidth,
        focusedX,
        focusedY,
        focusedDimHeight,
        toolbarLeft,
        toolbarRight,
        viewport.width,
        viewport.height,
    ]);
}
