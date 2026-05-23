'use client';

import type { ReactNode } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

export interface IconToggleOption {
    value: string;
    label: string;
    icon: ReactNode;
}

export interface IconToggleFieldProps {
    value: string;
    options: readonly IconToggleOption[];
    onCommit: (value: string) => void;
    className?: string;
    /** Aria label for the group (e.g. "Text alignment"). */
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
 * Segmented icon control (v3 fork) used for enum CSS properties where a glyph
 * reads faster than a word — text-align, text-decoration, font-style,
 * direction, justify-content, align-items. Empty value means "no preference";
 * the user can toggle the active item off again to reset.
 *
 * v3 differences vs v2:
 *   - Two-tier active state via `isSet` (see prop docs). The old single
 *     `bg-foreground-brand/15` whisper read too faint — the strong tier is now
 *     a raised opaque pill that's unmistakable in both light and dark.
 *   - Keyboard-only focus ring: each segment rings on `focus-visible` only,
 *     never on mouse-click.
 */
export function IconToggleField({
    value,
    options,
    onCommit,
    className,
    ariaLabel,
    isSet = true,
}: IconToggleFieldProps) {
    return (
        <TooltipProvider delayDuration={400}>
            <ToggleGroup
                type="single"
                size="sm"
                value={value || ''}
                onValueChange={(next) => onCommit(next ?? '')}
                aria-label={ariaLabel}
                className={cn(
                    // Same row geometry as the other fields — see FIELD_BASE_CLASSES —
                    // but rendered as a segmented group: subtle dividers between items.
                    // No internal padding here; each item handles its own.
                    'bg-background-secondary h-[30px] w-full divide-x divide-[var(--border)] rounded-[10px] border border-transparent dark:bg-[#101010]',
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
                                //    surface + `shadow-sm` + primary text. Reads
                                //    unmistakably as "you set this".
                                //  - QUIET (!isSet): a soft neutral fill, no
                                //    shadow, no brand color, secondary text —
                                //    reads as "this is the default".
                                // `min-w-0` is critical — radix' default `min-w-8`
                                // forces the group to overflow the panel when
                                // there are 6 options. Focus ring is keyboard-only.
                                className={cn(
                                    'text-foreground-tertiary hover:text-foreground-secondary focus-visible:ring-foreground-brand/30 h-full min-w-0 flex-1 shrink cursor-pointer rounded-none px-0 shadow-none transition-[background-color,color,box-shadow,transform] duration-150 outline-none first:rounded-l-[9px] last:rounded-r-[9px] focus-visible:ring-[3px] active:scale-[0.97]',
                                    isSet
                                        ? 'data-[state=on]:bg-foreground-brand/15 data-[state=on]:text-foreground-brand'
                                        : 'data-[state=on]:bg-foreground-brand/10 data-[state=on]:text-foreground-brand/90',
                                )}
                            >
                                {option.icon}
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent side="top">{option.label}</TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>
        </TooltipProvider>
    );
}
