'use client';

import { useCallback, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { EditorMode } from '@weblab/models';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { ErrorsConsole } from './errors-console';
import { PreviewThemeToggle } from './preview-theme-toggle';
import { TerminalArea } from './terminal-area';

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_FACTOR = 1.25;
// px of pointer drag that = 1% zoom change
const DRAG_PX_PER_PERCENT = 3;

const TOOLBAR_ITEMS = ({ t }: { t: ReturnType<typeof useTranslations> }) => [
    {
        mode: EditorMode.DESIGN,
        icon: Icons.CursorArrow,
        hotkey: Hotkey.SELECT,
        label: t(transKeys.editor.toolbar.tools.select.name),
        tooltip: t(transKeys.editor.toolbar.tools.select.tooltip),
    },
    {
        mode: EditorMode.PAN,
        icon: Icons.Hand,
        hotkey: Hotkey.PAN,
        label: t(transKeys.editor.toolbar.tools.pan.name),
        tooltip: t(transKeys.editor.toolbar.tools.pan.tooltip),
    },
    {
        mode: EditorMode.COMMENT,
        icon: Icons.ChatBubble,
        hotkey: Hotkey.COMMENT,
        label: t(transKeys.editor.toolbar.tools.comment.name),
        tooltip: t(transKeys.editor.toolbar.tools.comment.tooltip),
    },
];

export const BottomBar = observer(() => {
    const t = useTranslations();
    const editorEngine = useEditorEngine();
    const toolbarItems = TOOLBAR_ITEMS({ t });
    const shouldShow = [EditorMode.DESIGN, EditorMode.PAN, EditorMode.COMMENT].includes(
        editorEngine.state.editorMode,
    );

    // ── Zoom input state ──────────────────────────────────────────────────────
    const [isEditingZoom, setIsEditingZoom] = useState(false);
    const [zoomInputValue, setZoomInputValue] = useState('');
    const zoomInputRef = useRef<HTMLInputElement>(null);
    const dragStartX = useRef<number | null>(null);
    const dragStartScale = useRef<number>(1);
    const isDragging = useRef(false);
    const cancelledRef = useRef(false);

    const handleZoomPointerDown = useCallback(
        (e: React.PointerEvent<HTMLInputElement>) => {
            if (isEditingZoom) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragStartX.current = e.clientX;
            dragStartScale.current = editorEngine.canvas.scale;
            isDragging.current = false;
        },
        [isEditingZoom, editorEngine.canvas.scale],
    );

    const handleZoomPointerMove = useCallback(
        (e: React.PointerEvent<HTMLInputElement>) => {
            if (dragStartX.current === null || isEditingZoom) return;
            const delta = e.clientX - dragStartX.current;
            if (Math.abs(delta) > 3) isDragging.current = true;
            if (!isDragging.current) return;
            const percentDelta = delta / DRAG_PX_PER_PERCENT / 100;
            const newScale = Math.min(
                MAX_SCALE,
                Math.max(MIN_SCALE, dragStartScale.current + percentDelta),
            );
            editorEngine.canvas.scale = newScale;
        },
        [isEditingZoom, editorEngine.canvas],
    );

    const handleZoomPointerUp = useCallback(
        (e: React.PointerEvent<HTMLInputElement>) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (!isDragging.current && dragStartX.current !== null) {
                // No drag happened → enter edit mode
                const current = Math.round(editorEngine.canvas.scale * 100).toString();
                setZoomInputValue(current);
                setIsEditingZoom(true);
                setTimeout(() => {
                    zoomInputRef.current?.select();
                }, 0);
            }
            dragStartX.current = null;
            isDragging.current = false;
        },
        [editorEngine.canvas.scale],
    );

    const commitZoomInput = useCallback(() => {
        // Guard against a second commit (e.g. blur firing right after Enter
        // already committed + blurred): once we've left edit mode there's no
        // fresh input to apply, so re-running would re-apply stale text.
        if (!isEditingZoom) return;
        if (cancelledRef.current) {
            cancelledRef.current = false;
            setIsEditingZoom(false);
            return;
        }
        const parsed = parseInt(zoomInputValue, 10);
        if (!isNaN(parsed) && parsed > 0) {
            editorEngine.canvas.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed / 100));
        }
        setIsEditingZoom(false);
    }, [isEditingZoom, zoomInputValue, editorEngine.canvas]);

    return (
        <div className="mb-4">
            <AnimatePresence mode="wait">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{
                        opacity: shouldShow ? 1 : 0,
                        y: shouldShow ? 0 : 20,
                    }}
                    className="border-border-bar bg-background-bar flex flex-col rounded-lg border p-1 shadow-xl"
                    transition={{
                        type: 'spring',
                        bounce: 0.1,
                        duration: 0.4,
                        stiffness: 200,
                        damping: 25,
                    }}
                    style={{
                        pointerEvents: shouldShow ? 'auto' : 'none',
                        visibility: shouldShow ? 'visible' : 'hidden',
                    }}
                >
                    <TerminalArea>
                        {/* Mode buttons — plain buttons to avoid Radix rounding overrides */}
                        <div className="flex items-center gap-0.5">
                            {toolbarItems.map((item) => {
                                // Free pan is meaningless while the canvas is locked.
                                const disabled =
                                    item.mode === EditorMode.PAN && editorEngine.state.canvasLocked;
                                return (
                                    <Tooltip key={item.mode}>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => {
                                                    if (disabled) return;
                                                    editorEngine.state.setEditorMode(item.mode);
                                                }}
                                                disabled={disabled}
                                                aria-label={item.hotkey.description}
                                                className={cn(
                                                    'flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-all duration-150 ease-in-out',
                                                    editorEngine.state.editorMode === item.mode
                                                        ? 'bg-background-bar-active text-foreground-primary'
                                                        : 'text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active',
                                                    disabled && 'pointer-events-none opacity-40',
                                                )}
                                            >
                                                <item.icon />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent sideOffset={5} hideArrow>
                                            <HotkeyLabel hotkey={item.hotkey} />
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            })}
                        </div>

                        <div className="bg-border-bar/80 mx-0.5 h-5 w-px" />

                        {/* Zoom controls */}
                        <div className="flex items-center gap-0">
                            <button
                                onClick={() => {
                                    editorEngine.canvas.scale = Math.max(
                                        MIN_SCALE,
                                        editorEngine.canvas.scale / ZOOM_FACTOR,
                                    );
                                }}
                                className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active flex h-7 w-6 items-center justify-center rounded-md transition-all duration-150"
                                aria-label="Zoom out"
                            >
                                <Icons.Minus className="h-3 w-3" />
                            </button>

                            {/* Draggable / editable zoom % */}
                            <input
                                ref={zoomInputRef}
                                type="text"
                                inputMode="numeric"
                                value={
                                    isEditingZoom
                                        ? zoomInputValue
                                        : `${Math.round(editorEngine.canvas.scale * 100)}%`
                                }
                                readOnly={!isEditingZoom}
                                onChange={(e) => setZoomInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        commitZoomInput();
                                        // Blur so a stray later blur can't
                                        // re-commit; the `!isEditingZoom` guard
                                        // in commitZoomInput also no-ops it.
                                        zoomInputRef.current?.blur();
                                    }
                                    if (e.key === 'Escape') {
                                        cancelledRef.current = true;
                                        zoomInputRef.current?.blur();
                                    }
                                }}
                                onBlur={commitZoomInput}
                                onPointerDown={handleZoomPointerDown}
                                onPointerMove={handleZoomPointerMove}
                                onPointerUp={handleZoomPointerUp}
                                className={cn(
                                    'text-foreground-secondary text-mini w-10 border-none bg-transparent text-center tabular-nums transition-colors outline-none select-none',
                                    isEditingZoom
                                        ? 'text-foreground-primary cursor-text'
                                        : 'hover:text-foreground-primary cursor-ew-resize',
                                )}
                            />

                            <button
                                onClick={() => {
                                    editorEngine.canvas.scale = Math.min(
                                        MAX_SCALE,
                                        editorEngine.canvas.scale * ZOOM_FACTOR,
                                    );
                                }}
                                className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active flex h-7 w-6 items-center justify-center rounded-md transition-all duration-150"
                                aria-label="Zoom in"
                            >
                                <Icons.Plus className="h-3 w-3" />
                            </button>
                        </div>

                        <div className="bg-border-bar/80 mx-0.5 h-5 w-px" />

                        {/* Lock canvas — Webflow-style pinned, fit-to-width preview. */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => {
                                        // Leaving PAN when locking — free pan is
                                        // disabled while locked.
                                        if (
                                            !editorEngine.state.canvasLocked &&
                                            editorEngine.state.editorMode === EditorMode.PAN
                                        ) {
                                            editorEngine.state.setEditorMode(EditorMode.DESIGN);
                                        }
                                        editorEngine.state.toggleCanvasLocked();
                                    }}
                                    aria-label={
                                        editorEngine.state.canvasLocked
                                            ? 'Unlock canvas'
                                            : 'Lock canvas'
                                    }
                                    className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-all duration-150 ease-in-out',
                                        editorEngine.state.canvasLocked
                                            ? 'bg-background-bar-active text-foreground-primary'
                                            : 'text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active',
                                    )}
                                >
                                    {editorEngine.state.canvasLocked ? (
                                        <Icons.LockClosed />
                                    ) : (
                                        <Icons.LockOpen />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={5} hideArrow>
                                {/* TODO(i18n): hardcoded (mirrors recent bottom-bar/main
                                    strings) to avoid next-intl typegen staleness. */}
                                {editorEngine.state.canvasLocked
                                    ? 'Unlock canvas'
                                    : 'Lock canvas — fit to width'}
                            </TooltipContent>
                        </Tooltip>

                        <div className="bg-border-bar/80 mx-0.5 h-5 w-px" />

                        {/* Theme toggle for the previewed site (light / dark / system). */}
                        <PreviewThemeToggle />

                        <div className="bg-border-bar/80 mx-0.5 h-5 w-px" />

                        {/* Errors console — surfaces dev-server errors with one-click AI fix
                            without forcing the user to open the chat panel. */}
                        <ErrorsConsole />
                    </TerminalArea>
                </motion.div>
            </AnimatePresence>
        </div>
    );
});
