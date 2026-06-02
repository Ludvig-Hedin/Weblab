'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { throttle } from 'lodash';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { FrameData } from '@/components/store/editor/frames';
import { useEditorEngine } from '@/components/store/editor';
import { getRelativeMousePositionToFrameView } from '@/components/store/editor/overlay/utils';
import { Frames } from './frames';
import { HotkeysArea } from './hotkeys';
import { Overlay } from './overlay';
import { DragSelectOverlay } from './overlay/drag-select';
import { LayoutGuideOverlay } from './overlay/layout-guide';
import { PanOverlay } from './overlay/pan';
import { RecenterCanvasButton } from './recenter-canvas-button';
import { Rulers } from './rulers';
import { getFramesInSelection, getSelectedFrameData } from './selection-utils';

const ZOOM_SENSITIVITY = 0.006;
const PAN_SENSITIVITY = 0.52;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const MAX_X = 10000;
const MAX_Y = 10000;
const MIN_X = -5000;
const MIN_Y = -5000;

// Custom cursor for COMMENT mode — lucide `MessageCirclePlus` baked into an SVG
// data-URI so it works as a CSS cursor (no asset request). Filled brand blue +
// white plus, with a white outline so it stays legible over any frame content.
// Hotspot sits at the bubble tail (bottom-left) where the pin will be placed.
const COMMENT_CURSOR_SVG = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" fill="#0169cc" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 12h8M12 8v8" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg>`,
);
const COMMENT_CURSOR = `url("data:image/svg+xml,${COMMENT_CURSOR_SVG}") 3 26, crosshair`;

export const Canvas = observer(() => {
    const editorEngine = useEditorEngine();
    const containerRef = useRef<HTMLDivElement>(null);
    const scale = editorEngine.canvas.scale;
    const position = editorEngine.canvas.position;
    const [isDragSelecting, setIsDragSelecting] = useState(false);
    const [dragSelectStart, setDragSelectStart] = useState({ x: 0, y: 0 });
    const [dragSelectEnd, setDragSelectEnd] = useState({ x: 0, y: 0 });
    const [framesInSelection, setFramesInSelection] = useState<Set<string>>(new Set());

    const handleCanvasMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }

        if (event.target !== containerRef.current) {
            return;
        }

        // COMMENT mode: place a comment pin at the click location
        if (editorEngine.state.editorMode === EditorMode.COMMENT) {
            if (!containerRef.current) {
                return;
            }
            const rect = containerRef.current.getBoundingClientRect();
            const canvasX = (event.clientX - rect.left - position.x) / scale;
            const canvasY = (event.clientY - rect.top - position.y) / scale;
            editorEngine.comment.setPendingPlacement({ x: canvasX, y: canvasY });
            return;
        }

        // While in CODE mode, a stray click on empty canvas used to silently
        // flip the user back to DESIGN mode and lose context. Stay in CODE
        // mode and just clear any selection — the explicit Esc / mode-switch
        // shortcut is the only way to leave the mode now.
        if (editorEngine.state.editorMode === EditorMode.CODE) {
            editorEngine.clearUI();
            return;
        }
        // Start drag selection only in design mode
        if (editorEngine.state.editorMode === EditorMode.DESIGN) {
            const rect = containerRef.current.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            setIsDragSelecting(true);
            setDragSelectStart({ x, y });
            setDragSelectEnd({ x, y });
            setFramesInSelection(new Set());

            // Set a flag in the editor engine to suppress hover effects
            editorEngine.state.setIsDragSelecting(true);

            // Clear existing selections if not shift-clicking
            if (!event.shiftKey) {
                editorEngine.clearUI();
                editorEngine.frames.deselectAll();
            }
        } else {
            // Only clear UI for left clicks that don't start drag selection
            editorEngine.clearUI();
        }
    };

    const updateFramesInSelection = useCallback(
        (start: { x: number; y: number }, end: { x: number; y: number }) => {
            const intersectingFrameIds = getFramesInSelection(
                editorEngine,
                start,
                end,
                position,
                scale,
            );
            setFramesInSelection(new Set(intersectingFrameIds));
        },
        [position, scale, editorEngine],
    );

    const handleCanvasMouseMove = useCallback(
        throttle((event: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) return;

            // Bug fix #13: cache getBoundingClientRect once — both the presence broadcast
            // and the drag-selection path use it, so calling it twice was wasteful.
            const rect = containerRef.current.getBoundingClientRect();

            // Broadcast cursor position to remote collaborators (always, regardless of drag state).
            // Read position/scale directly from the engine to avoid stale closure values.
            const pos = editorEngine.canvas.position;
            const sc = editorEngine.canvas.scale;
            const canvasX = (event.clientX - rect.left - pos.x) / sc;
            const canvasY = (event.clientY - rect.top - pos.y) / sc;
            editorEngine.presence.updateCursor(canvasX, canvasY);

            if (!isDragSelecting) return;

            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            setDragSelectEnd({ x, y });

            // Update frames in selection for visual feedback
            updateFramesInSelection(dragSelectStart, { x, y });
        }, 16), // ~60fps
        [isDragSelecting, dragSelectStart, updateFramesInSelection, editorEngine],
    );

    const handleCanvasMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
        // Mouse up is now handled by the global listener in useEffect
        // This function is kept for consistency but the logic is in the global handler
    };

    const handleZoom = useCallback(
        (event: WheelEvent) => {
            if (!containerRef.current) {
                return;
            }
            event.preventDefault();
            const zoomFactor = -event.deltaY * ZOOM_SENSITIVITY;
            const rect = containerRef.current.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const newScale = scale * (1 + zoomFactor);
            const lintedScale = clampZoom(newScale);

            const deltaX = (x - position.x) * zoomFactor;
            const deltaY = (y - position.y) * zoomFactor;

            // Add slight Y offset to compensate for drift
            const yOffset = zoomFactor * -32; // TODO: Debug where this offset is coming from

            // Skip when the next scale would be out of range AND we're already at the bound —
            // avoids drift where scale is set but position is not.
            if (
                (newScale < MIN_ZOOM && scale <= MIN_ZOOM) ||
                (newScale > MAX_ZOOM && scale >= MAX_ZOOM)
            ) {
                return;
            }
            editorEngine.canvas.scale = lintedScale;

            const newPosition = clampPosition(
                {
                    x: position.x - deltaX,
                    y: position.y - deltaY - yOffset,
                },
                lintedScale,
            );
            editorEngine.canvas.position = newPosition;
        },
        [scale, position, editorEngine.canvas],
    );

    function clampZoom(scale: number) {
        return Math.min(Math.max(scale, MIN_ZOOM), MAX_ZOOM);
    }

    function clampPosition(position: { x: number; y: number }, scale: number) {
        const effectiveMaxX = MAX_X * scale;
        const effectiveMaxY = MAX_Y * scale;
        const effectiveMinX = MIN_X * scale;
        const effectiveMinY = MIN_Y * scale;

        return {
            x: Math.min(Math.max(position.x, effectiveMinX), effectiveMaxX),
            y: Math.min(Math.max(position.y, effectiveMinY), effectiveMaxY),
        };
    }

    const handlePan = useCallback(
        (event: WheelEvent) => {
            const deltaX = (event.deltaX + (event.shiftKey ? event.deltaY : 0)) * PAN_SENSITIVITY;
            const deltaY = (event.shiftKey ? 0 : event.deltaY) * PAN_SENSITIVITY;

            const newPosition = clampPosition(
                {
                    x: position.x - deltaX,
                    y: position.y - deltaY,
                },
                scale,
            );
            editorEngine.canvas.position = newPosition;
        },
        [scale, position, editorEngine.canvas],
    );

    const handleWheel = useCallback(
        (event: WheelEvent) => {
            const t = event.target;
            if (
                t instanceof HTMLTextAreaElement ||
                t instanceof HTMLInputElement ||
                t instanceof HTMLSelectElement ||
                (t instanceof HTMLElement && t.isContentEditable)
            ) {
                return;
            }
            editorEngine.state.canvasScrolling = true;
            if (event.ctrlKey || event.metaKey) {
                handleZoom(event);
            } else {
                handlePan(event);
            }
        },
        [handleZoom, handlePan, editorEngine.state],
    );

    const middleMouseButtonDown = useCallback((e: MouseEvent) => {
        if (e.button === 1) {
            editorEngine.state.setEditorMode(EditorMode.PAN);
            editorEngine.state.setCanvasPanning(true);
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    const middleMouseButtonUp = useCallback((e: MouseEvent) => {
        if (e.button === 1) {
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            editorEngine.state.setCanvasPanning(false);
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    const transformStyle = useMemo(
        () => ({
            transition: 'transform ease',
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: '0 0',
        }),
        [position.x, position.y, scale],
    );

    useEffect(() => {
        const div = containerRef.current;
        if (div) {
            div.addEventListener('wheel', handleWheel, { passive: false });
            div.addEventListener('mousedown', middleMouseButtonDown);
            div.addEventListener('mouseup', middleMouseButtonUp);
            return () => {
                div.removeEventListener('wheel', handleWheel);
                div.removeEventListener('mousedown', middleMouseButtonDown);
                div.removeEventListener('mouseup', middleMouseButtonUp);
                handleCanvasMouseMove.cancel?.(); // Clean up throttled function
            };
        }
    }, [handleWheel, middleMouseButtonDown, middleMouseButtonUp, handleCanvasMouseMove]);

    // Global mouseup listener to handle drag termination outside canvas
    useEffect(() => {
        if (isDragSelecting) {
            const handleGlobalMouseUp = (event: MouseEvent) => {
                try {
                    // Get frames that intersect with the selection rectangle
                    const selectedFrames = getSelectedFrameData(
                        editorEngine,
                        dragSelectStart,
                        dragSelectEnd,
                        position,
                        scale,
                    );

                    // Select the frames if any were found in the selection
                    if (selectedFrames.length > 0) {
                        editorEngine.frames.select(
                            selectedFrames.map((fd) => fd.frame),
                            event.shiftKey, // multiselect if shift is held
                        );
                    }
                } catch (error) {
                    console.warn('Error during drag selection:', error);
                } finally {
                    // Always clean up drag selection state, even if selection fails
                    setIsDragSelecting(false);
                    setFramesInSelection(new Set());
                    editorEngine.state.setIsDragSelecting(false);
                }
            };

            window.addEventListener('mouseup', handleGlobalMouseUp);
            return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
        }
    }, [isDragSelecting, dragSelectStart, dragSelectEnd, position, scale, editorEngine]);

    // ── Canvas-level drag/drop ──────────────────────────────────────────
    // The per-frame GestureScreen already handles drops over a frame. But
    // dropping on the canvas background (between/around frames) used to do
    // nothing — there's no frame element under the cursor. Pick the nearest
    // ready frame and route the drop there so the user gets a working insert
    // wherever they release the pointer.
    const [isDropping, setIsDropping] = useState(false);

    const pickNearestFrameToPoint = useCallback(
        (clientX: number, clientY: number): FrameData | null => {
            const candidates = editorEngine.frames
                .getAll()
                .filter((data): data is FrameData => !!data?.view);
            if (candidates.length === 0) return null;
            let best: FrameData | null = null;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (const data of candidates) {
                const cx = data.frame.position.x + data.frame.dimension.width / 2;
                const cy = data.frame.position.y + data.frame.dimension.height / 2;
                // Frames are positioned in canvas space; project the cursor too.
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) continue;
                const canvasX = (clientX - rect.left - position.x) / scale;
                const canvasY = (clientY - rect.top - position.y) / scale;
                const dx = canvasX - cx;
                const dy = canvasY - cy;
                const d = dx * dx + dy * dy;
                if (d < bestDistance) {
                    bestDistance = d;
                    best = data;
                }
            }
            return best;
        },
        [editorEngine.frames, position.x, position.y, scale],
    );

    const handleCanvasDragOver = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            // Only act on canvas-level drops (frame's GestureScreen stops propagation
            // when the cursor is over a real frame, so this fires only on bg).
            if (!event.dataTransfer.types.includes('application/json')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            if (!isDropping) setIsDropping(true);
        },
        [isDropping],
    );

    const handleCanvasDrop = useCallback(
        async (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDropping(false);

            const target = pickNearestFrameToPoint(event.clientX, event.clientY);
            if (!target?.view) {
                toast.error('No website frame to drop into', {
                    description: 'Open a frame on the canvas first.',
                });
                return;
            }

            try {
                // Resolve a sensible drop coordinate inside the target frame —
                // either the projected canvas point if the cursor is actually
                // inside the frame's rect, or the frame center as a fallback.
                const rect = containerRef.current?.getBoundingClientRect();
                const dropPos = (() => {
                    if (!rect) {
                        return {
                            x: target.frame.dimension.width / 2,
                            y: target.frame.dimension.height / 2,
                        };
                    }
                    try {
                        return getRelativeMousePositionToFrameView(event, target.view);
                    } catch {
                        return {
                            x: target.frame.dimension.width / 2,
                            y: target.frame.dimension.height / 2,
                        };
                    }
                })();

                const handled = await editorEngine.insert.insertFromDataTransfer(
                    target,
                    dropPos,
                    event.dataTransfer,
                    event.altKey,
                );
                if (handled) {
                    editorEngine.state.setEditorMode(EditorMode.DESIGN);
                    editorEngine.state.setInsertMode(null);
                }
            } catch (error) {
                console.error('Canvas drop failed:', error);
                toast.error('Failed to insert', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        },
        [editorEngine.insert, editorEngine.state, pickNearestFrameToPoint],
    );

    return (
        <HotkeysArea>
            <div
                ref={containerRef}
                data-tour="canvas"
                className={cn(
                    'bg-background-canvas relative flex flex-grow overflow-hidden',
                    // Borders frame the canvas inside the editor chrome — they would
                    // be visually wrong in full-screen preview where the canvas IS
                    // the page, so suppress them in PREVIEW mode.
                    editorEngine.state.editorMode !== EditorMode.PREVIEW &&
                        'border-border-canvas border-t border-r border-l',
                )}
                // COMMENT mode shows a custom comment cursor (MessageCirclePlus)
                // instead of the default crosshair; falls back to crosshair if the
                // browser rejects SVG data-URI cursors.
                style={
                    editorEngine.state.editorMode === EditorMode.COMMENT
                        ? { cursor: COMMENT_CURSOR }
                        : undefined
                }
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onDragOver={handleCanvasDragOver}
                onDragLeave={() => setIsDropping(false)}
                onDrop={(event) => {
                    void handleCanvasDrop(event);
                }}
                onMouseLeave={(e) => {
                    // Hide our cursor from remote users when the pointer exits the canvas
                    editorEngine.presence.clearCursor();

                    // Only terminate drag if no mouse button is pressed
                    // Note: The global mouseup listener will handle the actual cleanup
                    // This is just an additional safety check for when mouse leaves without buttons pressed
                    if (e.buttons === 0 && isDragSelecting) {
                        setIsDragSelecting(false);
                        setFramesInSelection(new Set());
                        editorEngine.state.setIsDragSelecting(false);
                    }
                }}
            >
                <div id={EditorAttributes.CANVAS_CONTAINER_ID} style={transformStyle}>
                    <Frames framesInDragSelection={framesInSelection} />
                </div>
                <RecenterCanvasButton />
                {/* Per-frame layout guide overlay — independent of the rulers
                    flag. Visibility is gated inside the component on
                    `canvas.showLayoutGuides` AND per-guide `visible`. */}
                <LayoutGuideOverlay />
                <DragSelectOverlay
                    startX={dragSelectStart.x}
                    startY={dragSelectStart.y}
                    endX={dragSelectEnd.x}
                    endY={dragSelectEnd.y}
                    isSelecting={isDragSelecting}
                />
                <Overlay />
                {/* Canvas rulers — overlay on top of the canvas content (no
                    padding nudge) so the existing zoom-to-cursor math in
                    handleZoom keeps working unchanged. Rulers cover the
                    first 24px of each axis; pointer-events: none lets
                    canvas interactions reach the content underneath. */}
                {editorEngine.canvas.showRulers && <Rulers />}
                <PanOverlay
                    clampPosition={(position: { x: number; y: number }) =>
                        clampPosition(position, scale)
                    }
                />
                {isDropping && (
                    <div
                        aria-hidden="true"
                        className="border-foreground-brand/60 bg-foreground-brand/5 pointer-events-none absolute inset-2 z-30 flex items-start justify-center rounded-md border-2 border-dashed"
                    >
                        <span className="bg-foreground-brand text-background mt-3 rounded-md px-2 py-1 text-xs font-medium">
                            Drop to insert into nearest frame
                        </span>
                    </div>
                )}
            </div>
        </HotkeysArea>
    );
});
