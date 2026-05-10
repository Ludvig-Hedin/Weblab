import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { observer } from 'mobx-react-lite';

import type { Frame } from '@weblab/models';
import { DEFAULT_BREAKPOINT_PRESETS } from '@weblab/db';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { HoverOnlyTooltip } from '../../../editor-bar/hover-tooltip';
import { BranchDisplay } from './branch';
import { createMouseMoveHandler } from './helpers';
import { PageSelector } from './page-selector';

export const TopBar = observer(
    ({ frame, isInDragSelection = false }: { frame: Frame; isInDragSelection?: boolean }) => {
        const editorEngine = useEditorEngine();
        const isSelected = editorEngine.frames.isSelected(frame.id);
        const topBarRef = useRef<HTMLDivElement>(null);
        const toolBarRef = useRef<HTMLDivElement>(null);
        const [customWidthInput, setCustomWidthInput] = useState('');
        const [addBreakpointMenuOpen, setAddBreakpointMenuOpen] = useState(false);
        const [shouldShowExternalLink, setShouldShowExternalLink] = useState(true);
        const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

        useEffect(() => {
            const calculateVisibility = () => {
                if (!topBarRef.current || !toolBarRef.current || !isSelected) {
                    setShouldShowExternalLink(false);
                    return;
                }

                const topBarWidth = topBarRef.current.clientWidth;
                const toolBarWidth = toolBarRef.current.clientWidth;
                const scale = editorEngine.canvas.scale;

                // Both toolbar and external link are scaled down by (1/scale)
                // So their visual widths are: actualWidth / scale
                const visualToolBarWidth = toolBarWidth / scale;
                const visualExternalLinkWidth = 32 / scale; // Button is ~32px, scaled down
                const padding = 10 / scale; // Some padding between elements, also scaled

                // Calculate if there's enough space for both toolbar and external link
                // Add extra buffer to hide the external link before it gets too cramped
                const totalNeededWidth = visualToolBarWidth + visualExternalLinkWidth + padding;
                const hasEnoughSpace = topBarWidth >= totalNeededWidth;

                setShouldShowExternalLink(hasEnoughSpace);
            };

            // Calculate on mount and when dependencies change
            calculateVisibility();

            // Recalculate when the window resizes or canvas scale changes
            const handleResize = () => calculateVisibility();
            window.addEventListener('resize', handleResize);

            return () => window.removeEventListener('resize', handleResize);
        }, [isSelected, editorEngine.canvas.scale, frame.dimension.width]);

        const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
            // Ignore right clicks or other button presses
            if (e.button !== 0) return;

            // Prevent text selection and default behaviors
            e.preventDefault();

            mouseDownRef.current = {
                x: e.clientX,
                y: e.clientY,
                time: Date.now(),
            };

            // If not multiselect and the clicked frame is not selected, select it first
            if (!editorEngine.frames.isSelected(frame.id) && !e.shiftKey) {
                editorEngine.frames.select([frame], false);
            }

            // Capture the selected frames after a possible selection update
            const selectedFrames = editorEngine.frames.selected.map((frameData) => frameData.frame);
            const framesToMove = selectedFrames.length > 0 ? selectedFrames : [frame];

            createMouseMoveHandler(e, {
                editorEngine,
                selectedFrames: framesToMove,
                clearElements,
            });
        };

        const clearElements = () => {
            editorEngine.elements.clear();
            editorEngine.overlay.clearUI();
        };

        const handleReload = () => {
            editorEngine.frames.reloadView(frame.id);
        };

        const handleGoBack = async () => {
            await editorEngine.frames.goBack(frame.id);
        };

        const handleGoForward = async () => {
            await editorEngine.frames.goForward(frame.id);
        };

        // Sibling frames in the same group, ordered by `breakpoint.order`. Used to
        // know whether this is the rightmost frame (where the "+" lives) and to
        // detect width drift from the original preset.
        const groupSiblings = editorEngine.frames.getByGroupId(frame.groupId);
        const isRightmostInGroup =
            groupSiblings.length > 0 &&
            groupSiblings[groupSiblings.length - 1]?.frame.id === frame.id;

        // A "drifted" frame is one whose current width differs from its
        // breakpoint preset (e.g. user dragged Desktop from 1200 → 800). We
        // surface this in the badge instead of auto-renaming so the breakpoint
        // identity stays user-driven.
        const presetForId = DEFAULT_BREAKPOINT_PRESETS.find((p) => p.id === frame.breakpoint?.id);
        const presetWidth = presetForId?.width;
        const driftedFromPreset =
            !!presetWidth && Math.abs((frame.breakpoint?.width ?? 0) - presetWidth) >= 1;

        const handleRestorePreset = () => {
            if (!presetWidth) return;
            void editorEngine.frames.updateAndSaveToStorage(frame.id, {
                dimension: { width: presetWidth, height: frame.dimension.height },
                breakpoint: { ...frame.breakpoint, width: presetWidth },
            });
            setTimeout(() => editorEngine.frames.repackGroup(frame.groupId), 0);
        };

        const handleAddBreakpoint = (preset: { id: string; name: string; width: number }) => {
            void editorEngine.frames.addBreakpoint(frame.groupId, preset);
        };

        const handleDeleteBreakpoint = () => {
            if (groupSiblings.length <= 1) return;
            void editorEngine.frames.delete(frame.id);
        };

        const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
            if (!mouseDownRef.current) {
                return;
            }

            const currentTime = Date.now();
            const timeDiff = currentTime - mouseDownRef.current.time;
            const distance = Math.sqrt(
                Math.pow(e.clientX - mouseDownRef.current.x, 2) +
                    Math.pow(e.clientY - mouseDownRef.current.y, 2),
            );

            // Don't register click if it was a long hold (>200ms) or significant movement (>5px)
            if (timeDiff > 200 || distance > 5) {
                mouseDownRef.current = null;
                return;
            }

            mouseDownRef.current = null;
            editorEngine.frames.select([frame], e.shiftKey);
        };

        // Match the bottom-bar surface — chrome bg + bar border + small rounded
        // corners. The selected-frame state shifts to the bar-active fill so the
        // selection is still legible without the previous translucent blue tint.
        return (
            <div
                ref={topBarRef}
                className={cn(
                    'bg-background-chrome border-border-bar text-foreground-secondary group-hover:text-foreground relative m-auto flex cursor-grab flex-row items-center overflow-hidden border shadow-sm hover:shadow active:cursor-grabbing',
                    isSelected && 'bg-background-bar-active text-foreground-primary',
                    !isSelected &&
                        isInDragSelection &&
                        'fill-foreground-brand text-foreground-brand',
                )}
                style={{
                    height: `${28 / editorEngine.canvas.scale}px`,
                    width: `${frame.dimension.width}px`,
                    marginBottom: `${8 / editorEngine.canvas.scale}px`,
                    borderRadius: `${6 / editorEngine.canvas.scale}px`,
                    paddingTop: `${16 / editorEngine.canvas.scale}px`,
                    paddingBottom: `${16 / editorEngine.canvas.scale}px`,
                    paddingLeft: `${4 / editorEngine.canvas.scale}px`,
                    paddingRight: `${4 / editorEngine.canvas.scale}px`,
                }}
                onMouseDown={handleMouseDown}
                onClick={handleClick}
            >
                <div
                    className="flex flex-row items-center"
                    style={{
                        transform: `scale(${1 / editorEngine.canvas.scale})`,
                        transformOrigin: 'left center',
                    }}
                    ref={toolBarRef}
                >
                    <HoverOnlyTooltip content="Go back" side="top" className="mb-1" hideArrow>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active h-auto cursor-pointer rounded-md px-1 py-1',
                                !editorEngine.frames.navigation.canGoBack(frame.id) &&
                                    'pointer-events-none opacity-30',
                                !isSelected && 'hidden',
                            )}
                            onClick={handleGoBack}
                            disabled={!editorEngine.frames.navigation.canGoBack(frame.id)}
                        >
                            <Icons.ArrowLeft />
                        </Button>
                    </HoverOnlyTooltip>
                    <HoverOnlyTooltip content="Go forward" side="top" className="mb-1" hideArrow>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active h-auto cursor-pointer rounded-md px-1 py-1',
                                !editorEngine.frames.navigation.canGoForward(frame.id) &&
                                    'pointer-events-none opacity-30',
                                !isSelected && 'hidden',
                            )}
                            onClick={handleGoForward}
                            disabled={!editorEngine.frames.navigation.canGoForward(frame.id)}
                        >
                            <Icons.ArrowRight />
                        </Button>
                    </HoverOnlyTooltip>
                    <HoverOnlyTooltip content="Refresh Page" side="top" className="mb-2" hideArrow>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active h-auto cursor-pointer rounded-md',
                                !isSelected && 'hidden',
                            )}
                            onClick={handleReload}
                        >
                            <Icons.Reload />
                        </Button>
                    </HoverOnlyTooltip>
                    <BranchDisplay frame={frame} />
                    <span
                        className={cn(
                            'mb-0.5 ml-1.25',
                            isSelected
                                ? 'text-foreground-secondary'
                                : 'text-foreground-secondary/50',
                        )}
                    >
                        ·
                    </span>
                    <PageSelector frame={frame} />
                    <span
                        className={cn(
                            'mx-1.5',
                            isSelected
                                ? 'text-foreground-secondary'
                                : 'text-foreground-secondary/50',
                        )}
                    >
                        ·
                    </span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    'hover:bg-background-bar-active flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs',
                                    isSelected
                                        ? 'text-foreground-primary'
                                        : 'text-foreground-secondary',
                                )}
                                title={
                                    driftedFromPreset
                                        ? `Drifted from ${frame.breakpoint?.name} preset (${presetWidth}px)`
                                        : `${frame.breakpoint?.name} breakpoint`
                                }
                                onClick={(e) => e.stopPropagation()}
                            >
                                <span className="font-medium">
                                    {frame.breakpoint?.name ?? 'Frame'}
                                </span>
                                <span className="text-foreground-tertiary">
                                    {frame.breakpoint?.width ?? frame.dimension.width}
                                </span>
                                {driftedFromPreset && (
                                    <span
                                        className="bg-foreground-warning/80 inline-block h-1.5 w-1.5 rounded-full"
                                        title={`Drifted from ${presetWidth}px`}
                                    />
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            className="min-w-44"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <DropdownMenuLabel>Breakpoint</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {driftedFromPreset && (
                                <DropdownMenuItem onSelect={handleRestorePreset}>
                                    Restore preset ({presetWidth}px)
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                onSelect={handleDeleteBreakpoint}
                                disabled={groupSiblings.length <= 1}
                                className="text-destructive"
                            >
                                Remove from group
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {isRightmostInGroup && isSelected && (
                        <DropdownMenu
                            open={addBreakpointMenuOpen}
                            onOpenChange={(open) => {
                                setAddBreakpointMenuOpen(open);
                                if (!open) setCustomWidthInput('');
                            }}
                        >
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="hover:bg-background-bar-active text-foreground-tertiary hover:text-foreground-primary ml-1 flex items-center justify-center rounded-md px-1.5 py-0.5"
                                    title="Add breakpoint"
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <Icons.Plus className="h-3.5 w-3.5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="min-w-52"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <DropdownMenuLabel>Add breakpoint</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {[
                                    { id: 'phone-landscape', name: 'Phone Landscape', width: 844 },
                                    {
                                        id: 'tablet-landscape',
                                        name: 'Tablet Landscape',
                                        width: 1024,
                                    },
                                    { id: 'wide', name: 'Wide', width: 1440 },
                                    { id: 'ultra-wide', name: 'Ultra Wide', width: 1920 },
                                ].map((preset) => (
                                    <DropdownMenuItem
                                        key={preset.id}
                                        onSelect={() => {
                                            handleAddBreakpoint(preset);
                                            setAddBreakpointMenuOpen(false);
                                        }}
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <span>{preset.name}</span>
                                            <span className="text-foreground-tertiary text-xs">
                                                {preset.width}px
                                            </span>
                                        </div>
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                {/* Custom-width inline input. Using a plain row instead of
                                 * DropdownMenuItem so keyboard events (digits, arrows) don't
                                 * trigger menu navigation, and Radix doesn't auto-close while
                                 * the user is typing. Enter or the Add button commits. */}
                                <div
                                    className="flex items-center gap-2 px-2 py-1.5"
                                    onKeyDown={(e) => {
                                        // Stop arrow keys from moving menu focus away from the input.
                                        if (
                                            e.key === 'ArrowUp' ||
                                            e.key === 'ArrowDown' ||
                                            e.key === 'ArrowLeft' ||
                                            e.key === 'ArrowRight'
                                        ) {
                                            e.stopPropagation();
                                        }
                                    }}
                                >
                                    <span className="text-foreground-secondary text-xs">
                                        Custom
                                    </span>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={100}
                                        max={4000}
                                        step={1}
                                        placeholder="900"
                                        value={customWidthInput}
                                        onChange={(e) => setCustomWidthInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const width = Number(customWidthInput);
                                                if (
                                                    !Number.isFinite(width) ||
                                                    width < 100 ||
                                                    width > 4000
                                                )
                                                    return;
                                                handleAddBreakpoint({
                                                    id: `custom-${width}-${Date.now()}`,
                                                    name: `Custom ${width}`,
                                                    width,
                                                });
                                                setCustomWidthInput('');
                                                setAddBreakpointMenuOpen(false);
                                            } else if (e.key === 'Escape') {
                                                setAddBreakpointMenuOpen(false);
                                            }
                                        }}
                                        autoFocus
                                        className="bg-background-tertiary/60 text-foreground text-mini focus:ring-foreground-brand w-20 rounded-md px-2 py-1 focus:ring-1 focus:outline-none"
                                    />
                                    <span className="text-foreground-tertiary text-mini">px</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="ml-auto h-6 px-2 text-xs"
                                        disabled={(() => {
                                            const w = Number(customWidthInput);
                                            return (
                                                !customWidthInput ||
                                                !Number.isFinite(w) ||
                                                w < 100 ||
                                                w > 4000
                                            );
                                        })()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const width = Number(customWidthInput);
                                            if (
                                                !Number.isFinite(width) ||
                                                width < 100 ||
                                                width > 4000
                                            )
                                                return;
                                            handleAddBreakpoint({
                                                id: `custom-${width}-${Date.now()}`,
                                                name: `Custom ${width}`,
                                                width,
                                            });
                                            setCustomWidthInput('');
                                            setAddBreakpointMenuOpen(false);
                                        }}
                                    >
                                        Add
                                    </Button>
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                <HoverOnlyTooltip
                    content="Preview in new tab"
                    side="top"
                    hideArrow
                    className="mb-0"
                >
                    <Link
                        className={cn(
                            'absolute top-1/2 right-1 -translate-y-1/2 transition-opacity duration-300',
                        )}
                        href={frame.url.replace(/\[([^\]]+)\]/g, 'temp-$1')} // Dynamic routes are not supported so we replace them with a temporary value
                        target="_blank"
                        style={{
                            transform: `scale(${1 / editorEngine.canvas.scale})`,
                            transformOrigin: 'right center',
                            opacity: shouldShowExternalLink ? 1 : 0,
                            pointerEvents: shouldShowExternalLink ? 'auto' : 'none',
                        }}
                    >
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active rounded-md"
                        >
                            <Icons.ExternalLink />
                        </Button>
                    </Link>
                </HoverOnlyTooltip>
            </div>
        );
    },
);
