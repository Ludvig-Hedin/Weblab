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

export interface FlowSegmentOption {
    value: string;
    label: string;
    icon: ReactNode;
}

export interface FlowSegmentProps {
    value: string;
    options: readonly FlowSegmentOption[];
    onCommit: (value: string) => void;
    /** Total container height (defaults to 32 — Layout flow row). */
    height?: number;
    ariaLabel?: string;
    className?: string;
}

/**
 * Wide segmented icon-only control (Flow row in Layout, Type tabs in
 * Background). Container `bg-input` rounded-8, 2px inner padding.
 * Active item uses the v4 muted-grey active state — NOT brand colour.
 */
export function FlowSegment({
    value,
    options,
    onCommit,
    height = 28,
    ariaLabel,
    className,
}: FlowSegmentProps) {
    return (
        <TooltipProvider delayDuration={400}>
            <ToggleGroup
                type="single"
                value={value || ''}
                onValueChange={(next) => onCommit(next ?? '')}
                aria-label={ariaLabel}
                className={cn(
                    'bg-background-secondary grid w-full grid-cols-4 gap-0 rounded-[10px] p-[2px]',
                    className,
                )}
                style={{ height, gridAutoRows: '1fr' }}
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
