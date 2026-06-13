'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';
import { Icons } from '@weblab/ui/icons';
import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { openPreviewWindow } from '../canvas/frame/preview-url';

// All four editor views surfaced inline as the primary mode switcher.
// Previously Preview + CMS lived as separate icon buttons elsewhere on the
// top bar; promoting them here makes the four modes a single, consistent
// control. Inactive items use a muted foreground so the active one reads
// clearly without colour beyond the underline indicator.
const MODE_TOGGLE_ITEMS: {
    mode: EditorMode;
    hotkey: Hotkey;
}[] = [
    { mode: EditorMode.DESIGN, hotkey: Hotkey.SELECT },
    { mode: EditorMode.CODE, hotkey: Hotkey.CODE },
    { mode: EditorMode.PREVIEW, hotkey: Hotkey.PREVIEW },
    { mode: EditorMode.CMS, hotkey: Hotkey.MODE_CMS },
];

// Preview is promoted out of the inline tab strip into a dedicated play button
// (it's an action — "run the site" — not an edit surface). The desktop tabs
// therefore omit it; the mobile dropdown keeps all four for compactness.
const DESKTOP_TAB_ITEMS = MODE_TOGGLE_ITEMS.filter((item) => item.mode !== EditorMode.PREVIEW);

export const ModeToggle = observer(() => {
    const t = useTranslations();
    const editorEngine = useEditorEngine();
    const mode = editorEngine.state.editorMode;

    const activeIndex = DESKTOP_TAB_ITEMS.findIndex((item) => item.mode === mode);
    // -1 when the current mode isn't one of the desktop tabs (Preview, Pan,
    // Comment, CMS). In that case we hide the active-plate entirely rather than
    // letting it sit on Design — see the measurement effects below.
    const safeIndex = activeIndex >= 0 ? activeIndex : 0;

    // Measure the active tab's actual rect so the indicator spans the full
    // width of the visible label + padding. The previous percentage-based
    // math assumed equal tab widths, but the toggle group is `w-fit` with
    // intrinsic-sized items, so the underline rendered shorter than the tab.
    const groupRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [indicator, setIndicator] = useState<{
        x: number;
        width: number;
        top: number;
        height: number;
    } | null>(null);

    useLayoutEffect(() => {
        // No active desktop tab (Preview/Pan/Comment/CMS) → hide the plate so it
        // doesn't park on Design.
        if (activeIndex < 0) {
            setIndicator(null);
            return;
        }
        const group = groupRef.current;
        const item = itemRefs.current[safeIndex];
        if (!group || !item) return;
        const groupRect = group.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        setIndicator({
            x: itemRect.left - groupRect.left,
            width: itemRect.width,
            top: itemRect.top - groupRect.top,
            height: itemRect.height,
        });
        // `mode` would be redundant — `safeIndex` is derived synchronously
        // from `mode`, so both always change in the same render.
    }, [safeIndex, activeIndex]);

    useEffect(() => {
        if (activeIndex < 0) return;
        const group = groupRef.current;
        if (!group || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            const item = itemRefs.current[safeIndex];
            if (!item) return;
            const groupRect = group.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            setIndicator({
                x: itemRect.left - groupRect.left,
                width: itemRect.width,
                top: itemRect.top - groupRect.top,
                height: itemRect.height,
            });
        });
        ro.observe(group);
        return () => ro.disconnect();
    }, [safeIndex, activeIndex]);

    // Safe lookup so a new EditorMode without a matching translation key
    // does not throw `Cannot read properties of undefined (reading 'name')`.
    const modeLabel = (m: EditorMode): string => {
        const key = m.toLowerCase() as keyof typeof transKeys.editor.modes;
        const entry = transKeys.editor.modes[key];
        return entry ? t(entry.name) : m;
    };
    // MODE_TOGGLE_ITEMS is a non-empty const, so the first item is always defined.
    const activeModeItem =
        MODE_TOGGLE_ITEMS.find((item) => item.mode === mode) ?? MODE_TOGGLE_ITEMS[0]!;
    const activeLabel = modeLabel(activeModeItem.mode);

    // Active preview URL — same source the inline PreviewOverlay uses: the
    // selected frame, else the first frame.
    const allFrames = editorEngine.frames.getAll();
    const sourceFrame =
        allFrames.find((data) => data?.selected)?.frame ?? allFrames[0]?.frame ?? null;
    const previewUrl = sourceFrame?.url ?? null;
    const popout = (popMode: 'tab' | 'window') => {
        if (previewUrl) openPreviewWindow(editorEngine.projectId, previewUrl, popMode);
    };

    return (
        <div className="relative">
            {/* Mobile: compact dropdown */}
            <div className="flex md:hidden">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="compact"
                            className="text-foreground-primary text-small"
                        >
                            {activeLabel}
                            <Icons.ChevronDown className="h-3 w-3 opacity-60" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-36">
                        {MODE_TOGGLE_ITEMS.map((item) => (
                            <DropdownMenuItem
                                key={item.mode}
                                onClick={() => editorEngine.state.setEditorMode(item.mode)}
                                className={cn(
                                    'text-small cursor-pointer',
                                    mode === item.mode && 'text-foreground-primary font-medium',
                                )}
                            >
                                {modeLabel(item.mode)}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Desktop: inline toggle group + dedicated Preview play button */}
            <div className="hidden items-center gap-1 md:flex">
                <div ref={groupRef} className="relative">
                    {/* Active-tab plate — a rounded fill that glides between tabs.
                        Rendered before the items so it paints behind them; the
                        labels sit on top (relative z-10) and stay readable. */}
                    <motion.div
                        className="bg-background-bar-active pointer-events-none absolute rounded-md"
                        initial={false}
                        style={{ top: indicator?.top ?? 0, height: indicator?.height ?? 0 }}
                        animate={{
                            // Hidden (opacity 0) until the first measurement lands
                            // so it doesn't flash from {x:0,width:0} on mount.
                            width: indicator?.width ?? 0,
                            x: indicator?.x ?? 0,
                            opacity: indicator ? 1 : 0,
                        }}
                        transition={{
                            type: 'tween',
                            ease: 'easeInOut',
                            duration: 0.2,
                        }}
                    />
                    <ToggleGroup
                        // border-0 + rounded-none strip the ToggleGroup primitive's
                        // default border/radius so the mode tabs read as a flat
                        // header control, not a boxed segmented control.
                        className="h-7 rounded-none border-0 font-normal"
                        type="single"
                        value={mode}
                        onValueChange={(value) => {
                            if (value) {
                                editorEngine.state.setEditorMode(value as EditorMode);
                            }
                        }}
                    >
                        {DESKTOP_TAB_ITEMS.map((item, idx) => (
                            <Tooltip key={item.mode}>
                                <TooltipTrigger asChild>
                                    <ToggleGroupItem
                                        ref={(el) => {
                                            itemRefs.current[idx] = el;
                                        }}
                                        value={item.mode}
                                        aria-label={item.hotkey.description}
                                        className={cn(
                                            'text-small relative z-10 cursor-pointer bg-transparent px-4 py-2 whitespace-nowrap transition-colors duration-150 ease-in-out',
                                            mode === item.mode
                                                ? 'text-foreground-active hover:text-foreground-active hover:bg-transparent'
                                                : 'text-foreground-tertiary hover:text-foreground-secondary hover:bg-transparent',
                                        )}
                                    >
                                        {modeLabel(item.mode)}
                                    </ToggleGroupItem>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="mt-0" hideArrow>
                                    <HotkeyLabel hotkey={item.hotkey} />
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </ToggleGroup>
                </div>

                {/* Preview — promoted out of the tab strip into a play button.
                    Keeps the onboarding-tour anchor so first-run tooltips still
                    point here. */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            data-tour="preview-button"
                            aria-label={Hotkey.PREVIEW.description}
                            onClick={() => editorEngine.state.setEditorMode(EditorMode.PREVIEW)}
                            className="text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active h-7 w-7 rounded-md"
                        >
                            <Icons.Play className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="mt-0" hideArrow>
                        <HotkeyLabel hotkey={Hotkey.PREVIEW} />
                    </TooltipContent>
                </Tooltip>

                {/* Pop the live preview out into its own tab/window — a resilient
                    surface that hot-reloads and auto-recovers from sandbox errors. */}
                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Open preview window"
                                    disabled={!previewUrl}
                                    className="text-foreground-tertiary hover:text-foreground-primary hover:bg-background-bar-active h-7 w-7 rounded-md"
                                >
                                    <Icons.ExternalLink className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="mt-0" hideArrow>
                            Open preview window
                        </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => popout('tab')}>
                            Open in new tab
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => popout('window')}>
                            Open in new window
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
});
