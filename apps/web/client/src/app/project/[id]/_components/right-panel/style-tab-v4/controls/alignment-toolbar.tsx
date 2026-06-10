'use client';

import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignStartHorizontal,
    AlignStartVertical,
} from 'lucide-react';

import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

export type AlignmentValue = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

export interface AlignmentToolbarProps {
    value: string;
    onCommit: (value: AlignmentValue | '') => void;
    className?: string;
}

const OPTIONS: {
    value: AlignmentValue;
    label: string;
    Icon: typeof AlignStartVertical;
}[] = [
    { value: 'left', label: 'Align left', Icon: AlignStartVertical },
    {
        value: 'center-x',
        label: 'Center horizontally',
        Icon: AlignCenterVertical,
    },
    { value: 'right', label: 'Align right', Icon: AlignEndVertical },
    { value: 'top', label: 'Align top', Icon: AlignStartHorizontal },
    {
        value: 'center-y',
        label: 'Center vertically',
        Icon: AlignCenterHorizontal,
    },
    { value: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];

/**
 * Six-icon alignment guide row from the Figma. Currently surface-only —
 * each click commits the chosen guide via `onCommit` so the section can
 * translate it into the appropriate CSS (e.g. for absolute-positioned
 * elements: `left:0; right:auto;` for "left", or `transform: translateX(-50%);
 * left:50%;` for "center-x"). The toolbar itself is purely presentational.
 */
export function AlignmentToolbar({ value, onCommit, className }: AlignmentToolbarProps) {
    return (
        <TooltipProvider delayDuration={400}>
            <ToggleGroup
                type="single"
                value={value || ''}
                onValueChange={(next) => onCommit((next ?? '') as AlignmentValue | '')}
                aria-label="Position alignment"
                className={cn(
                    'flex h-[26px] w-full items-center justify-between gap-0.5',
                    className,
                )}
            >
                {OPTIONS.map(({ value: optionValue, label, Icon }) => (
                    <Tooltip key={optionValue}>
                        <TooltipTrigger asChild>
                            <ToggleGroupItem
                                value={optionValue}
                                aria-label={label}
                                className="text-foreground-secondary data-[state=on]:bg-foreground-brand/15 data-[state=on]:text-foreground-brand hover:bg-foreground/5 hover:text-foreground-primary h-full w-7 shrink-0 rounded-xs transition-colors"
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
}
