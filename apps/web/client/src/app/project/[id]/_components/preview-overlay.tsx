'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ParsedError } from '@weblab/utility';
import { DEVICE_OPTIONS } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { FIX_ERRORS_EVENT } from './right-panel/chat-tab/error';
import { PublishButton } from './top-bar/publish';

const PREVIEW_SIZE_STORAGE_KEY = 'weblab.preview.size';
const MIN_PREVIEW_DIM = 200;
const MAX_PREVIEW_DIM = 4000;
const PREVIEW_AREA_PADDING = 32;

interface PreviewSize {
    width: number;
    height: number;
}

function readStoredSize(): PreviewSize | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PREVIEW_SIZE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PreviewSize>;
        if (
            typeof parsed?.width === 'number' &&
            typeof parsed?.height === 'number' &&
            Number.isFinite(parsed.width) &&
            Number.isFinite(parsed.height)
        ) {
            return { width: parsed.width, height: parsed.height };
        }
    } catch {
        // ignore — invalid JSON or storage blocked
    }
    return null;
}

function clampDim(value: number, max: number): number {
    if (!Number.isFinite(value)) return MIN_PREVIEW_DIM;
    return Math.max(MIN_PREVIEW_DIM, Math.min(max, Math.round(value)));
}

function useCopyState() {
    const [copied, setCopied] = useState(false);
    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // clipboard not available
        }
    };
    return { copied, copy };
}

function PreviewErrorLine({ line, index }: { line: string; index: number }) {
    if (/^[×✗]\s+/.test(line)) {
        return (
            <div key={index} className="flex gap-1.5">
                <span className="text-destructive shrink-0">×</span>
                <span className="text-foreground-secondary">{line.replace(/^[×✗]\s+/, '')}</span>
            </div>
        );
    }
    if (/^Error:\s/.test(line)) {
        return (
            <div key={index} className="text-destructive">
                {line}
            </div>
        );
    }
    const lineNumMatch = /^(\s{0,5}\d{1,5}\s*│)(.*)$/.exec(line);
    if (lineNumMatch) {
        return (
            <div key={index} className="flex">
                <span className="text-foreground-tertiary shrink-0 select-none">
                    {lineNumMatch[1]}
                </span>
                <span className="text-foreground-primary">{lineNumMatch[2]}</span>
            </div>
        );
    }
    if (/·\s+[─]+/.test(line)) {
        return (
            <div key={index} className="text-destructive/50">
                {line}
            </div>
        );
    }
    if (/[╭╰│]/.test(line)) {
        return (
            <div key={index} className="text-foreground-tertiary">
                {line}
            </div>
        );
    }
    if (line.startsWith('Caused by:')) {
        return (
            <div key={index} className="text-foreground-secondary mt-2 font-medium">
                {line}
            </div>
        );
    }
    if (line.startsWith('Import trace')) {
        return (
            <div key={index} className="text-foreground-tertiary mt-2">
                {line}
            </div>
        );
    }
    if (line.trim() === '') return <div key={index} className="h-px" />;
    return (
        <div key={index} className="text-foreground-secondary">
            {line}
        </div>
    );
}

function BuildErrorPanel({
    errors,
    onFixWithAI,
    onReload,
}: {
    errors: ParsedError[];
    onFixWithAI: () => void;
    onReload: () => void;
}) {
    const { copied, copy } = useCopyState();
    const errorText = errors.map((e) => e.content).join('\n\n');

    return (
        <div className="flex h-full flex-col items-center justify-center p-8">
            <div className="border-border/20 bg-background-secondary w-full max-w-2xl overflow-hidden rounded-lg border">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="bg-destructive/10 flex h-7 w-7 shrink-0 items-center justify-center rounded">
                        <Icons.ExclamationTriangle className="text-destructive h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-foreground-primary text-small leading-tight font-medium">
                            Build error
                        </p>
                        <p className="text-foreground-tertiary text-mini mt-0.5 leading-tight">
                            Fix the error to see your preview
                        </p>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-border/15 border-t" />

                {/* Error content — same surface as header */}
                <div className="max-h-[26rem] overflow-auto px-4 py-3.5">
                    {errors.map((error, i) => (
                        <div
                            key={`${error.branchId}-${i}`}
                            className={cn('font-mono text-[12px] leading-[1.65]', i > 0 && 'mt-4')}
                        >
                            {error.content.split('\n').map((line, li) => (
                                <PreviewErrorLine key={li} line={line} index={li} />
                            ))}
                        </div>
                    ))}
                </div>

                {/* Divider */}
                <div className="border-border/15 border-t" />

                {/* Actions footer */}
                <div className="flex items-center gap-1.5 px-4 py-2.5">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copy(errorText)}
                        className={cn(
                            'text-foreground-secondary hover:text-foreground-primary h-7 gap-1.5 px-2 text-xs',
                            copied && 'text-foreground-success',
                        )}
                    >
                        {copied ? (
                            <Icons.Check className="h-3 w-3" />
                        ) : (
                            <Icons.Copy className="h-3 w-3" />
                        )}
                        {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onReload}
                        className="text-foreground-secondary hover:text-foreground-primary h-7 gap-1.5 px-2 text-xs"
                    >
                        <Icons.Reload className="h-3 w-3" />
                        Retry
                    </Button>
                    <div className="flex-1" />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onFixWithAI}
                        className="text-foreground-secondary hover:text-foreground-primary h-7 gap-1.5 px-2 text-xs"
                    >
                        <Icons.MagicWand className="h-3 w-3" />
                        Fix with AI
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * Full-viewport preview of the previewed site. Replaces the editor chrome
 * entirely — like "Open in new tab" but inline so the user doesn't lose context.
 *
 * Source URL: prefers the first selected frame, otherwise the first frame.
 * Reload: bumps a key so the iframe remounts with the same src.
 */
interface GroupBreakpoint {
    frameId: string;
    name: string;
    width: number;
    height: number;
}

function DimInput({
    value,
    suffix,
    max,
    onCommit,
}: {
    value: number;
    suffix: 'W' | 'H';
    max: number;
    onCommit: (next: number) => void;
}) {
    const [draft, setDraft] = useState(() => String(Math.round(value)));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setDraft(String(Math.round(value)));
    }, [value, focused]);

    const tryCommit = (raw: string) => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || raw.trim() === '') return;
        const clamped = clampDim(parsed, max);
        onCommit(clamped);
    };

    return (
        <div className="bg-background-bar-active text-foreground-primary flex h-8 items-center gap-1 rounded-md px-2 text-xs tabular-nums">
            <input
                type="number"
                inputMode="numeric"
                aria-label={suffix === 'W' ? 'Width in pixels' : 'Height in pixels'}
                min={MIN_PREVIEW_DIM}
                max={max}
                step={1}
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    tryCommit(e.target.value);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                    setFocused(false);
                    // Restore display to canonical clamped value on blur.
                    const parsed = Number(draft);
                    if (!Number.isFinite(parsed) || draft.trim() === '') {
                        setDraft(String(Math.round(value)));
                    } else {
                        setDraft(String(clampDim(parsed, max)));
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                        setDraft(String(Math.round(value)));
                        (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        e.stopPropagation();
                        const step = e.shiftKey ? 10 : 1;
                        const dir = e.key === 'ArrowUp' ? 1 : -1;
                        const next = clampDim((Number(draft) || value) + dir * step, max);
                        setDraft(String(next));
                        onCommit(next);
                    }
                }}
                className="w-12 [appearance:textfield] bg-transparent text-right focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-foreground-tertiary text-[11px] font-medium">{suffix}</span>
        </div>
    );
}

function DragHandle({
    side,
    onResize,
    onResizeEnd,
}: {
    side: 'left' | 'right';
    onResize: (dx: number) => void;
    onResizeEnd: () => void;
}) {
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX;
        const target = e.currentTarget;
        let lastDx = 0;
        target.setPointerCapture(e.pointerId);

        const handleMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX - lastDx;
            lastDx = ev.clientX - startX;
            onResize(dx);
        };
        const handleUp = (ev: PointerEvent) => {
            target.releasePointerCapture?.(ev.pointerId);
            target.removeEventListener('pointermove', handleMove);
            target.removeEventListener('pointerup', handleUp);
            target.removeEventListener('pointercancel', handleUp);
            onResizeEnd();
        };
        target.addEventListener('pointermove', handleMove);
        target.addEventListener('pointerup', handleUp);
        target.addEventListener('pointercancel', handleUp);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={side === 'left' ? 'Resize from left' : 'Resize from right'}
            onPointerDown={onPointerDown}
            className={cn(
                'absolute top-1/2 z-10 flex h-16 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center',
                side === 'left' ? '-left-3' : '-right-3',
            )}
        >
            <div className="bg-foreground-tertiary/60 group-hover:bg-foreground-secondary h-10 w-1 rounded-full" />
        </div>
    );
}

export const PreviewOverlay = observer(() => {
    const editorEngine = useEditorEngine();
    const [reloadKey, setReloadKey] = useState(0);
    const [size, setSize] = useState<PreviewSize | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const previewAreaRef = useRef<HTMLDivElement>(null);
    const [areaSize, setAreaSize] = useState<PreviewSize>({
        width: 0,
        height: 0,
    });
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Resolved each render — MobX `observer` re-runs the component when the
    // underlying observable frames change, so explicit memoization is noise.
    // Pick the first selected frame, otherwise the first one.
    const allFrames = editorEngine.frames.getAll();
    const sourceFrame =
        allFrames.find((data) => data?.selected)?.frame ?? allFrames[0]?.frame ?? null;
    // Dynamic-route segments (`[slug]`) aren't real URLs — same substitution as
    // the per-frame "open in new tab" link uses.
    const previewUrl = sourceFrame ? sourceFrame.url.replace(/\[([^\]]+)\]/g, 'temp-$1') : null;

    const groupBreakpoints: GroupBreakpoint[] = sourceFrame
        ? editorEngine.frames.getByGroupId(sourceFrame.groupId).map((data) => ({
              frameId: data.frame.id,
              name: data.frame.breakpoint?.name ?? 'Untitled',
              width: data.frame.breakpoint?.width ?? data.frame.dimension.width,
              height: data.frame.dimension.height,
          }))
        : [];

    const buildErrors = editorEngine.branches
        .getAllErrors()
        .filter((e: ParsedError) => e.type === 'terminal');
    const hasBuildErrors = buildErrors.length > 0;

    // Measure preview area and keep clamped on resize.
    useLayoutEffect(() => {
        const el = previewAreaRef.current;
        if (!el) return;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setAreaSize({ width: rect.width, height: rect.height });
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Initialize size: stored value, else fit to area.
    useEffect(() => {
        if (size !== null) return;
        if (areaSize.width <= 0 || areaSize.height <= 0) return;
        const stored = readStoredSize();
        const maxW = Math.max(MIN_PREVIEW_DIM, areaSize.width - PREVIEW_AREA_PADDING);
        const maxH = Math.max(MIN_PREVIEW_DIM, areaSize.height - PREVIEW_AREA_PADDING);
        if (stored) {
            setSize({
                width: clampDim(stored.width, Math.min(MAX_PREVIEW_DIM, maxW)),
                height: clampDim(stored.height, Math.min(MAX_PREVIEW_DIM, maxH)),
            });
        } else {
            setSize({ width: Math.round(maxW), height: Math.round(maxH) });
        }
    }, [size, areaSize]);

    // Clamp size to area when window shrinks.
    useEffect(() => {
        if (!size || areaSize.width <= 0 || areaSize.height <= 0) return;
        const maxW = Math.max(MIN_PREVIEW_DIM, areaSize.width - PREVIEW_AREA_PADDING);
        const maxH = Math.max(MIN_PREVIEW_DIM, areaSize.height - PREVIEW_AREA_PADDING);
        if (size.width > maxW || size.height > maxH) {
            setSize({
                width: Math.min(size.width, maxW),
                height: Math.min(size.height, maxH),
            });
        }
    }, [size, areaSize]);

    // Persist size to localStorage (debounced).
    useEffect(() => {
        if (!size) return;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            try {
                window.localStorage.setItem(PREVIEW_SIZE_STORAGE_KEY, JSON.stringify(size));
            } catch {
                // storage blocked — ignore
            }
        }, 250);
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        };
    }, [size]);

    const handleClose = () => editorEngine.state.setEditorMode(EditorMode.DESIGN);
    const handleReload = () => setReloadKey((k) => k + 1);
    const handleToggleFullscreen = () => setFullscreen((v) => !v);

    const handleFixWithAI = () => {
        editorEngine.state.setEditorMode(EditorMode.DESIGN);
        editorEngine.chat.requestFixErrors();
        window.dispatchEvent(new CustomEvent(FIX_ERRORS_EVENT));
    };

    // Keyboard shortcuts — captured on the overlay root so the iframe never
    // swallows them (the iframe is cross-origin so keyboard events don't bubble).
    // Ref kept stable across renders so the listener doesn't re-register.
    const groupBreakpointsRef = useRef<GroupBreakpoint[]>([]);
    groupBreakpointsRef.current = groupBreakpoints;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Ignore shortcuts when user is typing in an input/textarea.
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            // Escape — close preview.
            if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                editorEngine.state.setEditorMode(EditorMode.DESIGN);
                return;
            }

            // R — reload (no modifiers).
            if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                e.preventDefault();
                setReloadKey((k) => k + 1);
                return;
            }

            // F — toggle fullscreen.
            if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                e.preventDefault();
                setFullscreen((v) => !v);
                return;
            }

            // D — go to design mode.
            if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                e.preventDefault();
                editorEngine.state.setEditorMode(EditorMode.DESIGN);
                return;
            }

            // Tab / Shift+Tab — cycle through breakpoints.
            if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                const bps = groupBreakpointsRef.current;
                if (bps.length < 2) return;
                e.preventDefault();
                setSize((prev) => {
                    if (!prev) return prev;
                    const idx = bps.findIndex((bp) => Math.abs(bp.width - prev.width) < 1);
                    const next = e.shiftKey
                        ? idx <= 0
                            ? bps.length - 1
                            : idx - 1
                        : (idx + 1) % bps.length;
                    const bp = bps[next]!;
                    return { width: bp.width, height: bp.height };
                });
                return;
            }

            // 1–9 — jump to nth breakpoint directly.
            const digit = parseInt(e.key, 10);
            if (
                !isNaN(digit) &&
                digit >= 1 &&
                !e.metaKey &&
                !e.ctrlKey &&
                !e.altKey &&
                !e.shiftKey
            ) {
                const bps = groupBreakpointsRef.current;
                const bp = bps[digit - 1];
                if (bp) {
                    e.preventDefault();
                    setSize({ width: bp.width, height: bp.height });
                }
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // When the preview iframe takes keyboard focus (cross-origin click), steal
    // it back so hotkeys (Esc, R, F, D, Tab, 1-9) keep working without
    // requiring a click outside first. Mouse events still reach the iframe.
    useEffect(() => {
        const handleBlur = () => {
            requestAnimationFrame(() => {
                if (!document.hasFocus()) window.focus();
            });
        };
        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, []);

    const maxWidth = Math.max(
        MIN_PREVIEW_DIM,
        Math.min(MAX_PREVIEW_DIM, areaSize.width - PREVIEW_AREA_PADDING || MAX_PREVIEW_DIM),
    );
    const maxHeight = Math.max(
        MIN_PREVIEW_DIM,
        Math.min(MAX_PREVIEW_DIM, areaSize.height - PREVIEW_AREA_PADDING || MAX_PREVIEW_DIM),
    );

    const setWidth = useCallback(
        (next: number) => {
            setSize((prev) => (prev ? { ...prev, width: clampDim(next, maxWidth) } : prev));
        },
        [maxWidth],
    );
    const setHeight = useCallback(
        (next: number) => {
            setSize((prev) => (prev ? { ...prev, height: clampDim(next, maxHeight) } : prev));
        },
        [maxHeight],
    );

    // Apply a "WxH" device preset (from DEVICE_OPTIONS) to the preview size,
    // clamped to the available preview area.
    const applyDeviceSize = useCallback(
        (dimensions: string) => {
            const [w, h] = dimensions.split('x').map(Number);
            if (
                typeof w === 'number' &&
                Number.isFinite(w) &&
                typeof h === 'number' &&
                Number.isFinite(h)
            ) {
                setSize({ width: clampDim(w, maxWidth), height: clampDim(h, maxHeight) });
            }
        },
        [maxWidth, maxHeight],
    );

    const activeBreakpoint = size
        ? (groupBreakpoints.find((bp) => Math.abs(bp.width - size.width) < 1) ?? null)
        : null;
    const breakpointLabel = activeBreakpoint?.name ?? 'Custom';

    const showHeaderCenter = !hasBuildErrors && size !== null && !fullscreen;

    return (
        <div className="bg-background-canvas fixed inset-0 z-[60] flex flex-col">
            {/* Preview chrome: matches bottom-bar styling so the preview reads as
                a tool surface, not a website chrome. */}
            <header className="bg-background-chrome border-border-bar flex h-14 items-center gap-2 border-b px-4">
                <div className="flex flex-1 items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Close preview"
                                onClick={handleClose}
                                className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-bar-active h-8 gap-1.5 rounded-md px-2"
                            >
                                <Icons.ArrowLeft className="h-4 w-4" />
                                <span className="hidden sm:inline">Close</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" hideArrow>
                            Close preview
                        </TooltipContent>
                    </Tooltip>
                    {!hasBuildErrors && (
                        <>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Reload preview"
                                        onClick={handleReload}
                                        className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-bar-active h-8 gap-1.5 rounded-md px-2"
                                    >
                                        <Icons.Reload className="h-4 w-4" />
                                        <span className="hidden sm:inline">Reload</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" hideArrow>
                                    Reload
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label={
                                            fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                                        }
                                        onClick={handleToggleFullscreen}
                                        className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-bar-active h-8 gap-1.5 rounded-md px-2"
                                    >
                                        <Icons.Corners className="h-4 w-4" />
                                        <span className="hidden sm:inline">
                                            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" hideArrow>
                                    {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                                </TooltipContent>
                            </Tooltip>
                        </>
                    )}
                    {hasBuildErrors && (
                        <div className="ml-2 flex items-center gap-1.5">
                            <div className="bg-destructive/10 flex h-5 w-5 items-center justify-center rounded">
                                <Icons.ExclamationTriangle className="text-destructive h-3 w-3" />
                            </div>
                            <span className="text-destructive text-xs font-medium">
                                Build error
                            </span>
                        </div>
                    )}
                </div>

                {/* Center: breakpoint dropdown + W/H inputs. */}
                {showHeaderCenter && size && (
                    <div className="flex items-center gap-1.5">
                        {groupBreakpoints.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="bg-background-bar-active text-foreground-primary hover:bg-background-bar-active hover:text-foreground-primary h-8 gap-1.5 rounded-md px-2.5 text-xs"
                                    >
                                        <span>{breakpointLabel}</span>
                                        <Icons.ChevronDown className="text-foreground-tertiary h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="center"
                                    className="z-[70] max-h-[60vh] overflow-y-auto"
                                >
                                    {/* Your own breakpoints (the frames in this group). */}
                                    <DropdownMenuLabel className="text-mini text-foreground-tertiary">
                                        Breakpoints
                                    </DropdownMenuLabel>
                                    {groupBreakpoints.map((bp) => (
                                        <DropdownMenuItem
                                            key={bp.frameId}
                                            onSelect={() =>
                                                setSize({
                                                    width: clampDim(bp.width, maxWidth),
                                                    height: clampDim(bp.height, maxHeight),
                                                })
                                            }
                                            className="flex items-center gap-3"
                                        >
                                            <span className="flex-1">{bp.name}</span>
                                            <span className="text-foreground-tertiary tabular-nums">
                                                {Math.round(bp.width)}
                                            </span>
                                        </DropdownMenuItem>
                                    ))}

                                    {/* Detailed device presets — relocated here from the
                                        (now hidden) frame toolbar device selector. */}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-mini text-foreground-tertiary">
                                        Devices
                                    </DropdownMenuLabel>
                                    {Object.entries(DEVICE_OPTIONS)
                                        .filter(([category]) => category !== 'Custom')
                                        .map(([category, devices]) => (
                                            <DropdownMenuGroup key={category}>
                                                <DropdownMenuLabel className="text-micro text-foreground-tertiary/70 px-2 pt-1.5 pb-0.5 font-normal">
                                                    {category}
                                                </DropdownMenuLabel>
                                                {Object.entries(devices).map(
                                                    ([name, dimensions]) => (
                                                        <DropdownMenuItem
                                                            key={`${category}:${name}`}
                                                            onSelect={() =>
                                                                applyDeviceSize(dimensions)
                                                            }
                                                            className="flex items-center gap-3"
                                                        >
                                                            <span className="flex-1">{name}</span>
                                                            <span className="text-foreground-tertiary text-micro tabular-nums">
                                                                {dimensions.replace('x', '×')}
                                                            </span>
                                                        </DropdownMenuItem>
                                                    ),
                                                )}
                                            </DropdownMenuGroup>
                                        ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <DimInput
                            value={size.width}
                            suffix="W"
                            max={maxWidth}
                            onCommit={setWidth}
                        />
                        <DimInput
                            value={size.height}
                            suffix="H"
                            max={maxHeight}
                            onCommit={setHeight}
                        />
                    </div>
                )}

                <div className="flex flex-1 items-center justify-end gap-2">
                    <PublishButton />
                </div>
            </header>

            <div
                ref={previewAreaRef}
                className="bg-background-canvas relative flex flex-1 items-center justify-center overflow-auto"
            >
                {hasBuildErrors ? (
                    <BuildErrorPanel
                        errors={buildErrors}
                        onFixWithAI={handleFixWithAI}
                        onReload={handleReload}
                    />
                ) : previewUrl && size ? (
                    <div
                        className="group bg-background-secondary relative shadow-sm"
                        style={{
                            width: fullscreen ? '100%' : `${size.width}px`,
                            height: fullscreen ? '100%' : `${size.height}px`,
                        }}
                    >
                        {!fullscreen && (
                            <DragHandle
                                side="left"
                                onResize={(dx) =>
                                    setSize((prev) =>
                                        prev
                                            ? {
                                                  ...prev,
                                                  width: clampDim(prev.width - dx * 2, maxWidth),
                                              }
                                            : prev,
                                    )
                                }
                                onResizeEnd={() => undefined}
                            />
                        )}
                        <iframe
                            key={reloadKey}
                            title="Site preview"
                            src={previewUrl}
                            className="h-full w-full border-0"
                        />
                        {!fullscreen && (
                            <DragHandle
                                side="right"
                                onResize={(dx) =>
                                    setSize((prev) =>
                                        prev
                                            ? {
                                                  ...prev,
                                                  width: clampDim(prev.width + dx * 2, maxWidth),
                                              }
                                            : prev,
                                    )
                                }
                                onResizeEnd={() => undefined}
                            />
                        )}
                    </div>
                ) : !previewUrl ? (
                    <p className="text-foreground-tertiary text-sm">No frame to preview.</p>
                ) : null}
            </div>
        </div>
    );
});
