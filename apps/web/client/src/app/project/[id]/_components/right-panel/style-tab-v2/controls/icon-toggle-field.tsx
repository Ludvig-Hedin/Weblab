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
}

/**
 * Segmented icon control used for enum CSS properties where a glyph reads
 * faster than a word — text-align, text-decoration, font-style, direction,
 * justify-content, align-items. Empty value means "no preference"; the
 * user can toggle the active item off again to reset.
 */
export function IconToggleField({
    value,
    options,
    onCommit,
    className,
    ariaLabel,
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
                    'border-input bg-foreground/5 h-[30px] w-full divide-x divide-[var(--input)] rounded-sm border dark:bg-[rgb(43,43,43)]',
                    className,
                )}
            >
                {options.map((option) => (
                    <Tooltip key={option.value}>
                        <TooltipTrigger asChild>
                            <ToggleGroupItem
                                value={option.value}
                                aria-label={option.label}
                                // Active state uses a brand-blue fill so users can tell
                                // at a glance which option is set without reading the icon.
                                // Brand here is a "whisper" — 15% opacity background +
                                // full-strength foreground keeps the panel calm while
                                // still cuing Weblab. `min-w-0` is critical — radix'
                                // default `min-w-8` forces the group to overflow the
                                // panel when there are 6 options.
                                className="text-foreground-tertiary data-[state=on]:bg-foreground-brand/15 data-[state=on]:text-foreground-brand hover:text-foreground-secondary h-full min-w-0 flex-1 shrink rounded-none px-0 shadow-none transition-[background-color,color,transform] duration-150 first:rounded-l-[8px] last:rounded-r-[8px] active:scale-[0.97]"
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
