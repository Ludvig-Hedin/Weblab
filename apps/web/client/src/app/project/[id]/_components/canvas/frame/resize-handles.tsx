import type { MouseEvent } from 'react';
import { observer } from 'mobx-react-lite';

import type { Frame } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Width-only resize handle for breakpoint frames.
 *
 * Height is auto-driven by the iframe's reported content size (Framer-style:
 * each breakpoint shows the WHOLE page). Resizing width changes the
 * frame's `breakpoint.width`, so dragging Desktop from 1200 → 800 redefines
 * what "Desktop" means for that group. The breakpoint name and override
 * scope follow it; auto-rename across media-query thresholds is intentional
 * NOT done here — the user gets a "drifted from preset" hint in the top bar
 * instead so renames stay user-driven.
 */
export const ResizeHandles = observer(
    ({ frame, setIsResizing }: { frame: Frame; setIsResizing: (isResizing: boolean) => void }) => {
        const editorEngine = useEditorEngine();

        const startResize = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);

            const startX = e.clientX;
            const startWidth = frame.breakpoint?.width ?? frame.dimension.width;
            const minWidth = parseInt(DefaultSettings.MIN_DIMENSIONS.width);

            const resize = (ev: globalThis.MouseEvent) => {
                const scale = editorEngine.canvas.scale;
                const widthDelta = (ev.clientX - startX) / scale;
                const newWidth = Math.max(minWidth, Math.round(startWidth + widthDelta));

                editorEngine.frames.updateAndSaveToStorage(frame.id, {
                    dimension: {
                        width: newWidth,
                        height: frame.dimension.height,
                    },
                    breakpoint: {
                        ...frame.breakpoint,
                        width: newWidth,
                    },
                });
                editorEngine.overlay.undebouncedRefresh();
            };

            const stopResize = (ev: globalThis.MouseEvent) => {
                ev.preventDefault();
                ev.stopPropagation();
                setIsResizing(false);
                window.removeEventListener('mousemove', resize);
                window.removeEventListener('mouseup', stopResize);
                // Repack siblings to the right of this frame after the drag settles.
                editorEngine.frames.repackGroup(frame.groupId);
            };

            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResize);
        };

        return (
            <div className="visible absolute inset-0 min-w-0 opacity-40 transition hover:opacity-60">
                <div
                    className={cn(
                        'absolute -right-10 flex h-full w-10 items-center justify-center',
                        'cursor-e-resize',
                    )}
                    onMouseDown={(e) => startResize(e)}
                    title="Drag to change this breakpoint's width"
                >
                    <div className="bg-foreground-primary/80 h-48 w-1 rounded"></div>
                </div>
            </div>
        );
    },
);
