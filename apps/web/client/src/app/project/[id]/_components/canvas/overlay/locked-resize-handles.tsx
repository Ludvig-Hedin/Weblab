'use client';

import type { MouseEvent } from 'react';
import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';

import { DefaultSettings } from '@weblab/constants';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Webflow-style gutter resize handles for "Lock canvas" mode.
 *
 * Renders two vertical bars at the on-screen left/right edges of the pinned
 * (focused) frame. Dragging either changes the frame's responsive
 * `breakpoint.width` — same persistence path as the per-frame `ResizeHandles`
 * (frame/resize-handles.tsx). The fit/center layout (useLockedCanvasLayout)
 * reacts to the width change and re-fits, so the page stays centered and filling
 * the gap while the device width grows — exactly Webflow's behavior.
 *
 * Only mounted (by Canvas) when `state.canvasLocked` is true.
 */
export const LockedResizeHandles = observer(() => {
    const editorEngine = useEditorEngine();
    // Safety net for a drag interrupted by unmount (canvas unlocked, frame
    // deleted, mode change): without it the window listeners live forever and
    // every later mousemove keeps writing frame width. Mirrors
    // frame/resize-handles.tsx's activeResizeCleanupRef.
    const activeResizeCleanupRef = useRef<(() => void) | null>(null);
    useEffect(
        () => () => {
            activeResizeCleanupRef.current?.();
        },
        [],
    );

    // Focused frame: selected, falling back to the primary (lowest
    // breakpoint.order — getAll() is order-sorted, so [0]).
    const focused = editorEngine.frames.selected[0] ?? editorEngine.frames.getAll()[0];
    if (!focused) return null;

    const frame = focused.frame;
    const scale = editorEngine.canvas.scale;
    const position = editorEngine.canvas.position;
    const width = frame.breakpoint?.width ?? frame.dimension.width;

    const leftEdge = position.x + frame.position.x * scale;
    const rightEdge = leftEdge + width * scale;

    const startResize = (e: MouseEvent, side: 'left' | 'right') => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = frame.breakpoint?.width ?? frame.dimension.width;
        const minWidth = parseInt(DefaultSettings.MIN_DIMENSIONS.width);

        const resize = (ev: globalThis.MouseEvent) => {
            // Button released outside the window: mouseup never fired, so on
            // re-entry the width would chase the cursor with nothing held.
            if (ev.buttons === 0) {
                stopResize(ev);
                return;
            }
            // Read scale fresh each tick — the layout re-fits as the width grows,
            // so the canvas scale shifts mid-drag.
            const currentScale = editorEngine.canvas.scale;
            const deltaWorld = (ev.clientX - startX) / currentScale;
            // Right handle widens when dragged right; left handle when dragged left.
            const signed = side === 'right' ? deltaWorld : -deltaWorld;
            const newWidth = Math.max(minWidth, Math.round(startWidth + signed));

            void editorEngine.frames.updateAndSaveToStorage(frame.id, {
                dimension: { width: newWidth, height: frame.dimension.height },
                breakpoint: frame.breakpoint
                    ? { ...frame.breakpoint, width: newWidth }
                    : frame.breakpoint,
            });
            void editorEngine.overlay.undebouncedRefresh();
        };

        const stopResize = (ev: globalThis.MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            removeListeners();
            editorEngine.frames.repackGroup(frame.groupId);
        };

        const removeListeners = () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResize);
            activeResizeCleanupRef.current = null;
        };

        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize);
        activeResizeCleanupRef.current = removeListeners;
    };

    const handle = (side: 'left' | 'right', edge: number) => (
        <div
            key={side}
            className="group pointer-events-auto absolute top-14 bottom-0 flex w-4 cursor-ew-resize items-center justify-center"
            style={{ left: edge - 8 }}
            onMouseDown={(e) => startResize(e, side)}
            title="Drag to change the responsive width"
        >
            <div
                className={cn(
                    'h-40 max-h-[40%] w-1 rounded-full transition-colors',
                    'bg-foreground-primary/30 group-hover:bg-foreground-brand',
                )}
            />
        </div>
    );

    return (
        <div className="pointer-events-none absolute inset-0 z-30">
            {handle('left', leftEdge)}
            {handle('right', rightEdge)}
        </div>
    );
});
