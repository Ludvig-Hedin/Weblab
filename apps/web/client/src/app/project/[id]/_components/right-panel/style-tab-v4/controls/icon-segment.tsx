'use client';

import type { ReactNode } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import {
    SEGMENT_ACTIVE_CLASSES,
    SEGMENT_INACTIVE_CLASSES,
    SEGMENT_ITEM_CLASSES,
} from './constants';

export interface IconSegmentOption {
    value: string;
    label: string;
    icon: ReactNode;
}

export interface IconSegmentProps {
    value: string;
    options: readonly IconSegmentOption[];
    onCommit: (value: string) => void;
    /** Total container height (defaults to 30 — standard row). */
    height?: number;
    ariaLabel?: string;
    className?: string;
}

/**
 * Segmented icon-only control (text-align, flex direction). Same visual
 * grammar as FlowSegment but with `auto-cols-fr` so 2/3/4/5/6 buttons
 * all share equal width.
 */
export function IconSegment({
    value,
    options,
    onCommit,
    height = 28,
    ariaLabel,
    className,
}: IconSegmentProps) {
    return (
        <TooltipProvider delayDuration={400}>
            <ToggleGroup
                type="single"
                value={value || ''}
                onValueChange={(next) => onCommit(next ?? '')}
                aria-label={ariaLabel}
                className={cn(
                    'bg-background-secondary grid w-full gap-0 rounded-[10px] p-[2px]',
                    className,
                )}
                style={{
                    height,
                    gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
                }}
            >
                {options.map((option) => (
                    <Tooltip key={option.value}>
                        <TooltipTrigger asChild>
                            <ToggleGroupItem
                                value={option.value}
                                aria-label={option.label}
                                className={cn(
                                    SEGMENT_ITEM_CLASSES,
                                    SEGMENT_INACTIVE_CLASSES,
                                    SEGMENT_ACTIVE_CLASSES,
                                )}
                            >
                                {option.icon}
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-mini">
                            {option.label}
                        </TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>
        </TooltipProvider>
    );
}
