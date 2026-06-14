'use client';

import {
    ArrowDownUp,
    ArrowLeftRight,
    ArrowUpDown,
    Crop,
    Eye,
    EyeOff,
    Maximize2,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useStyleBatchSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';

interface GrowOption {
    value: string;
    label: string;
    Icon: typeof Maximize2;
    /** CSS the click should commit — e.g. `flex-grow: 1` ⇒ `{flex-grow:'1'}` */
    write: { property: string; value: string }[];
}

const GROW_WRITE: Record<string, { property: string; value: string }[]> = {
    horizontal: [
        { property: 'flex-grow', value: '1' },
        { property: 'width', value: 'auto' },
    ],
    vertical: [
        { property: 'flex-grow', value: '1' },
        { property: 'height', value: 'auto' },
    ],
    fill: [
        { property: 'width', value: '100%' },
        { property: 'height', value: '100%' },
    ],
};

interface OverflowOption {
    value: string;
    label: string;
    /** Some segments label themselves with a word instead of a glyph. */
    Icon?: typeof Eye;
    text?: string;
}

/**
 * Shared geometry for the connected toggle pills used by both rows. A single
 * 28px-tall pill with hairline-divided, equal-width segments that fill the
 * row.
 *
 * The active segment uses a two-tier treatment driven by each row's `isSet`
 * prop — see {@link TOGGLE_ITEM_BASE_CLASS} and {@link toggleItemClass}:
 *   - STRONG (isSet): a raised, opaque pill — `bg-background` (light) / a
 *     lifted dark surface + `shadow-sm` + primary text. Unmistakable in both
 *     themes.
 *   - QUIET (!isSet): a soft neutral fill, no shadow, no brand color,
 *     secondary text — reads as "this is the default, not your choice".
 *
 * Focus ring is keyboard-only (`focus-visible:` on each segment).
 */
const TOGGLE_GROUP_CLASS =
    'border-transparent bg-background-secondary flex h-[28px] w-full divide-x divide-border rounded-[10px] border';
const TOGGLE_ITEM_BASE_CLASS =
    'text-foreground-secondary hover:text-foreground-primary flex h-full flex-1 cursor-pointer items-center justify-center rounded-none transition-[background-color,color,box-shadow] outline-none focus-visible:ring-foreground-brand/30 focus-visible:ring-[3px] focus-visible:ring-inset first:rounded-l-[9px] last:rounded-r-[9px]';
const TOGGLE_ITEM_STRONG_ACTIVE =
    'data-[state=on]:bg-foreground-brand/15 data-[state=on]:text-foreground-brand';
const TOGGLE_ITEM_QUIET_ACTIVE =
    'data-[state=on]:bg-foreground-brand/10 data-[state=on]:text-foreground-brand/90';

/** Resolve the per-segment class for the current `isSet` tier. */
function toggleItemClass(isSet: boolean, extra?: string): string {
    return cn(
        TOGGLE_ITEM_BASE_CLASS,
        isSet ? TOGGLE_ITEM_STRONG_ACTIVE : TOGGLE_ITEM_QUIET_ACTIVE,
        extra,
    );
}

export interface GrowRowProps {
    className?: string;
    /**
     * Whether the active Grow preset is an explicit override (`true`) or just
     * the inherited/computed default (`false`). Drives the two-tier active
     * state — STRONG vs QUIET. Optional; defaults to `true` so existing call
     * sites keep the clearly-active treatment until a section threads it
     * through.
     */
    isSet?: boolean;
}

/**
 * Grow — the three "Grow" preset icons from the Figma's Size section:
 * grow horizontally, grow vertically, fill. Each preset writes one or more
 * CSS properties through `StyleManager` (via `useStyleSetter`), so undo/redo
 * and write-target preferences continue to apply uniformly.
 *
 * The group fills its row width like every other Size control — the parent
 * `PropertyControl`-style row supplies the "Grow" label.
 */
export const GrowRow = observer(function GrowRow({ className, isSet = true }: GrowRowProps) {
    const t = useTranslations('editor.stylePanel.controls.growOverflow');
    const flexGrow = useStyleValue('flex-grow');
    const width = useStyleValue('width');
    const height = useStyleValue('height');

    const { setMultiple } = useStyleBatchSetter();

    const growOptions: GrowOption[] = [
        { value: 'horizontal', label: t('growHorizontally'), Icon: ArrowLeftRight, write: GROW_WRITE.horizontal! },
        { value: 'vertical', label: t('growVertically'), Icon: ArrowUpDown, write: GROW_WRITE.vertical! },
        { value: 'fill', label: t('fill'), Icon: Maximize2, write: GROW_WRITE.fill! },
    ];

    const activeGrow = (() => {
        if (width.value === '100%' && height.value === '100%') return 'fill';
        if (flexGrow.value === '1' && height.value === 'auto') return 'vertical';
        if (flexGrow.value === '1' && width.value === 'auto') return 'horizontal';
        return '';
    })();

    // A preset writes 2 properties — commit them as one history entry so a
    // single Cmd+Z reverts the whole "grow" gesture.
    const applyGrow = (value: string) => {
        const opt = growOptions.find((o) => o.value === value);
        if (!opt) return;
        setMultiple(opt.write);
    };

    return (
        <TooltipProvider delayDuration={400}>
            <ToggleGroup
                type="single"
                value={activeGrow}
                onValueChange={(next) => next && applyGrow(next)}
                aria-label={t('growLabel')}
                className={cn(TOGGLE_GROUP_CLASS, className)}
            >
                {growOptions.map(({ value, label, Icon }) => (
                    <Tooltip key={value}>
                        <TooltipTrigger asChild>
                            <ToggleGroupItem
                                value={value}
                                aria-label={label}
                                className={toggleItemClass(isSet)}
                            >
                                <Icon className="size-3" />
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent side="top">{label}</TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>
        </TooltipProvider>
    );
});

export interface OverflowRowProps {
    className?: string;
    /**
     * Whether the active Overflow value is an explicit override (`true`) or
     * just the inherited/computed default (`false`). Drives the two-tier
     * active state — STRONG vs QUIET. Optional; defaults to `true` so existing
     * call sites keep the clearly-active treatment until a section threads it
     * through.
     */
    isSet?: boolean;
}

/**
 * Overflow — a four-segment connected toggle that acts on `overflow-x` and
 * `overflow-y` together (the common case; separate axis controls remain
 * reachable in the Custom expander). Segments: Visible · Hidden · Clip ·
 * Auto. The first three carry glyphs; the fourth carries the word "Auto"
 * since "scroll on overflow" has no obvious universal icon.
 *
 * Each segment writes through `StyleManager` (via `useStyleSetter`) so
 * undo/redo and write-target preferences apply uniformly.
 */
export const OverflowRow = observer(function OverflowRow({
    className,
    isSet = true,
}: OverflowRowProps) {
    const t = useTranslations('editor.stylePanel.controls.growOverflow');
    const overflowX = useStyleValue('overflow-x');
    const overflowY = useStyleValue('overflow-y');
    const overflow = useStyleValue('overflow');

    const { setMultiple } = useStyleBatchSetter();

    const overflowOptions: OverflowOption[] = [
        { value: 'visible', label: t('visible'), Icon: Eye },
        { value: 'hidden', label: t('hidden'), Icon: EyeOff },
        { value: 'clip', label: t('clip'), Icon: Crop },
        { value: 'auto', label: t('autoScroll'), Icon: ArrowDownUp, text: 'Auto' },
    ];

    const activeOverflow = (() => {
        if (overflowX.value === overflowY.value && overflowX.value) return overflowX.value;
        if (overflow.value) return overflow.value;
        return 'visible';
    })();

    // overflow-x + overflow-y in one history entry — one Cmd+Z reverts both.
    const applyOverflow = (value: string) => {
        setMultiple([
            { property: 'overflow-x', value },
            { property: 'overflow-y', value },
        ]);
    };

    return (
        <TooltipProvider delayDuration={400}>
            <ToggleGroup
                type="single"
                value={activeOverflow}
                onValueChange={(next) => next && applyOverflow(next)}
                aria-label={t('overflowLabel')}
                className={cn(TOGGLE_GROUP_CLASS, className)}
            >
                {overflowOptions.map(({ value, label, Icon, text }) => (
                    <Tooltip key={value}>
                        <TooltipTrigger asChild>
                            <ToggleGroupItem
                                value={value}
                                aria-label={label}
                                className={toggleItemClass(
                                    isSet,
                                    text ? 'text-[11px] font-medium' : undefined,
                                )}
                            >
                                {Icon && <Icon className="size-3" />}
                                {text}
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent side="top">{label}</TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>
        </TooltipProvider>
    );
});
