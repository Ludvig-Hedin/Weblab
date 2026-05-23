'use client';

import type { ReactNode } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

export interface SegmentedDisplayOption {
    value: string;
    label: string;
    icon?: ReactNode;
}

export interface SegmentedDisplayProps {
    value: string;
    options: readonly SegmentedDisplayOption[];
    onCommit: (value: string) => void;
    className?: string;
    ariaLabel?: string;
    /**
     * Whether the current value is an explicit override (`true`) or just the
     * inherited/computed default (`false`). Drives the two-tier active state:
     *
     *   - `true`  → STRONG active — a raised, opaque selected pill that reads
     *     as "you set this".
     *   - `false` → QUIET active — a soft neutral fill that reads as "this is
     *     the default, not your choice".
     *
     * Optional; defaults to `true` so existing call sites keep the prior
     * (clearly-active) treatment until a section threads `isSet` through.
     */
    isSet?: boolean;
}

/**
 * Wide segmented control with text-first labels — used for Display
 * (Flex/Grid/Block) and Direction in the Figma redesign. Compared to the
 * shared icon-toggle field, this variant is taller, shows labels alongside
 * any icon, and gives each segment equal width even when label lengths differ.
 *
 * Responsive: the right panel is resizable and can get narrow. The control
 * lives in a `@container`, and the text label collapses to icon-only below
 * ~210px (4 options × ~52px each — icon + label + padding) via the
 * `@max-[210px]:hidden` container variant. The icon and tooltip stay, so the
 * label is still discoverable when collapsed.
 *
 * The active highlight is driven by `value` matching `option.value`. The
 * STRENGTH of that highlight is driven by `isSet` — a two-tier treatment so
 * an inherited/computed Display value reads quieter than an explicit override.
 */
export function SegmentedDisplay({
    value,
    options,
    onCommit,
    className,
    ariaLabel,
    isSet = true,
}: SegmentedDisplayProps) {
    return (
        <TooltipProvider delayDuration={400}>
            <div className="@container w-full min-w-0">
                <ToggleGroup
                    type="single"
                    value={value || ''}
                    onValueChange={(next) => onCommit(next ?? '')}
                    aria-label={ariaLabel}
                    className={cn(
                        'bg-background-secondary flex h-[26px] w-full divide-x divide-[var(--border)] overflow-hidden rounded-[10px] border border-transparent dark:bg-[#262626]',
                        className,
                    )}
                >
                    {options.map((option) => (
                        <Tooltip key={option.value}>
                            <TooltipTrigger asChild>
                                <ToggleGroupItem
                                    value={option.value}
                                    aria-label={option.label}
                                    // Two-tier active state:
                                    //  - STRONG (isSet): a raised, opaque pill —
                                    //    `bg-background` (light) / a lifted dark
                                    //    surface + `shadow-sm` + primary text.
                                    //    Unmistakable in both themes.
                                    //  - QUIET (!isSet): a soft neutral fill, no
                                    //    shadow, no brand color, secondary text —
                                    //    reads as "this is the default".
                                    // Focus ring is keyboard-only.
                                    className={cn(
                                        'text-foreground-secondary hover:text-foreground-primary text-mini focus-visible:ring-foreground-brand/30 h-full min-w-0 flex-1 shrink cursor-pointer gap-1.5 rounded-none px-2 shadow-none transition-[background-color,color,box-shadow,transform] duration-150 outline-none focus-visible:ring-[3px] active:scale-[0.97]',
                                        isSet
                                            ? 'data-[state=on]:bg-foreground-brand/15 data-[state=on]:text-foreground-brand'
                                            : 'data-[state=on]:bg-foreground-brand/10 data-[state=on]:text-foreground-brand/90',
                                    )}
                                >
                                    {option.icon}
                                    <span className="truncate @max-[210px]:hidden">
                                        {option.label}
                                    </span>
                                </ToggleGroupItem>
                            </TooltipTrigger>
                            <TooltipContent side="top">{option.label}</TooltipContent>
                        </Tooltip>
                    ))}
                </ToggleGroup>
            </div>
        </TooltipProvider>
    );
}
