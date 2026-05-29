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

export const ModeToggle = observer(() => {
    const t = useTranslations();
    const editorEngine = useEditorEngine();
    const mode = editorEngine.state.editorMode;

    const activeIndex = MODE_TOGGLE_ITEMS.findIndex((item) => item.mode === mode);
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
    } | null>(null);

    useLayoutEffect(() => {
        const group = groupRef.current;
        const item = itemRefs.current[safeIndex];
        if (!group || !item) return;
        const groupRect = group.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        setIndicator({ x: itemRect.left - groupRect.left, width: itemRect.width });
        // `mode` would be redundant — `safeIndex` is derived synchronously
        // from `mode`, so both always change in the same render.
    }, [safeIndex]);

    useEffect(() => {
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
            });
        });
        ro.observe(group);
        return () => ro.disconnect();
    }, [safeIndex]);

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

            {/* Desktop: inline toggle group */}
            <div ref={groupRef} className="relative hidden md:block">
                <ToggleGroup
                    // border-0 + rounded-none strip the ToggleGroup primitive's
                    // default border/radius so the mode tabs read as a flat
                    // header control, not a boxed segmented control.
                    className="mt-1 h-7 rounded-none border-0 font-normal"
                    type="single"
                    value={mode}
                    onValueChange={(value) => {
                        if (value) {
                            editorEngine.state.setEditorMode(value as EditorMode);
                        }
                    }}
                >
                    {MODE_TOGGLE_ITEMS.map((item, idx) => (
                        <Tooltip key={item.mode}>
                            <TooltipTrigger asChild>
                                <ToggleGroupItem
                                    ref={(el) => {
                                        itemRefs.current[idx] = el;
                                    }}
                                    value={item.mode}
                                    aria-label={item.hotkey.description}
                                    // Preserve the onboarding-tour anchor that
                                    // previously lived on the play-icon button so
                                    // first-run tooltips still point at Preview.
                                    data-tour={
                                        item.mode === EditorMode.PREVIEW
                                            ? 'preview-button'
                                            : undefined
                                    }
                                    className={cn(
                                        'text-small cursor-pointer bg-transparent px-4 py-2 whitespace-nowrap transition-colors duration-150 ease-in-out',
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
                <motion.div
                    className="bg-foreground-active absolute -top-1 h-0.5 rounded-full"
                    initial={false}
                    animate={{
                        // Hide the indicator (opacity 0) until the first
                        // measurement lands so it doesn't flash from {x:0,
                        // width:0} → measured rect on initial mount.
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
            </div>
        </div>
    );
});
