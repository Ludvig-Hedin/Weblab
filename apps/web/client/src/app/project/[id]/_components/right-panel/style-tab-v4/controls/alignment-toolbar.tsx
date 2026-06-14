'use client';

import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignStartHorizontal,
    AlignStartVertical,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

export type AlignmentValue = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

export interface AlignmentToolbarProps {
    value: string;
    onCommit: (value: AlignmentValue | '') => void;
    className?: string;
}

const OPTION_ICONS: Record<AlignmentValue, typeof AlignStartVertical> = {
    left: AlignStartVertical,
    'center-x': AlignCenterVertical,
    right: AlignEndVertical,
    top: AlignStartHorizontal,
    'center-y': AlignCenterHorizontal,
    bottom: AlignEndHorizontal,
};

/**
 * Six-icon alignment guide row from the Figma. Currently surface-only —
 * each click commits the chosen guide via `onCommit` so the section can
 * translate it into the appropriate CSS (e.g. for absolute-positioned
 * elements: `left:0; right:auto;` for "left", or `transform: translateX(-50%);
 * left:50%;` for "center-x"). The toolbar itself is purely presentational.
 */
export function AlignmentToolbar({ value, onCommit, className }: AlignmentToolbarProps) {
    const t = useTranslations('editor.stylePanel.controls.alignmentToolbar');

    const options = [
        { value: 'left' as AlignmentValue, label: t('alignLeft'), Icon: OPTION_ICONS.left },
        { value: 'center-x' as AlignmentValue, label: t('centerHorizontally'), Icon: OPTION_ICONS['center-x'] },
        { value: 'right' as AlignmentValue, label: t('alignRight'), Icon: OPTION_ICONS.right },
        { value: 'top' as AlignmentValue, label: t('alignTop'), Icon: OPTION_ICONS.top },
        { value: 'center-y' as AlignmentValue, label: t('centerVertically'), Icon: OPTION_ICONS['center-y'] },
        { value: 'bottom' as AlignmentValue, label: t('alignBottom'), Icon: OPTION_ICONS.bottom },
    ];

    return (
        <TooltipProvider delayDuration={400}>
            <ToggleGroup
                type="single"
                value={value || ''}
                onValueChange={(next) => onCommit((next ?? '') as AlignmentValue | '')}
                aria-label={t('groupLabel')}
                className={cn(
                    'flex h-[28px] w-full items-center justify-between gap-0.5',
                    className,
                )}
            >
                {options.map(({ value: optionValue, label, Icon }) => (
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
