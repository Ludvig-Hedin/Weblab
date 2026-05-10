'use client';

import type { KeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';

import type { ReasoningEffort } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';

const REASONING_OPTIONS = [
    {
        value: 'minimal',
        labelKey: transKeys.editor.panels.edit.tabs.chat.effort.fast.label,
        hintKey: transKeys.editor.panels.edit.tabs.chat.effort.fast.hint,
    },
    {
        value: 'low',
        labelKey: transKeys.editor.panels.edit.tabs.chat.effort.light.label,
        hintKey: transKeys.editor.panels.edit.tabs.chat.effort.light.hint,
    },
    {
        value: 'medium',
        labelKey: transKeys.editor.panels.edit.tabs.chat.effort.balanced.label,
        hintKey: transKeys.editor.panels.edit.tabs.chat.effort.balanced.hint,
    },
    {
        value: 'high',
        labelKey: transKeys.editor.panels.edit.tabs.chat.effort.deep.label,
        hintKey: transKeys.editor.panels.edit.tabs.chat.effort.deep.hint,
    },
] as const satisfies ReadonlyArray<{ value: ReasoningEffort; labelKey: string; hintKey: string }>;

export interface ReasoningEffortPillsProps {
    value: ReasoningEffort;
    onChange: (next: ReasoningEffort) => void;
    className?: string;
    /** Extra class on each pill button — used to tune padding/font for the host. */
    pillClassName?: string;
}

/**
 * Segmented control for the reasoning-effort knob. Used inside both the v1
 * dropdown footer and the v2 popover footer so the surface is consistent.
 *
 * Implements WAI-ARIA radio-group keyboard semantics: ArrowLeft / ArrowRight
 * (and Up / Down for vertical readers) move focus and change the value.
 */
export const ReasoningEffortPills = ({
    value,
    onChange,
    className,
    pillClassName,
}: ReasoningEffortPillsProps) => {
    const t = useTranslations();
    const refs = useRef<Array<HTMLButtonElement | null>>([]);

    const focusAt = useCallback((idx: number) => {
        const el = refs.current[idx];
        el?.focus();
    }, []);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
            if (
                event.key !== 'ArrowLeft' &&
                event.key !== 'ArrowRight' &&
                event.key !== 'ArrowUp' &&
                event.key !== 'ArrowDown'
            ) {
                return;
            }
            event.preventDefault();
            const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex =
                (index + direction + REASONING_OPTIONS.length) % REASONING_OPTIONS.length;
            const nextOption = REASONING_OPTIONS[nextIndex];
            if (!nextOption) return;
            onChange(nextOption.value);
            focusAt(nextIndex);
        },
        [focusAt, onChange],
    );

    const effortLabel = t(transKeys.editor.panels.edit.tabs.chat.effort.label);
    const effortTooltip = t(transKeys.editor.panels.edit.tabs.chat.effort.tooltip);

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="text-foreground-tertiary text-mini flex items-center justify-between font-normal">
                <span>{effortLabel}</span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Icons.QuestionMarkCircled className="text-foreground-tertiary/70 h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={4} className="max-w-[220px] text-xs">
                        {effortTooltip}
                    </TooltipContent>
                </Tooltip>
            </div>
            <div
                className="bg-background-secondary/40 grid grid-cols-4 gap-0.5 rounded-md p-0.5"
                role="radiogroup"
                aria-label={effortLabel}
            >
                {REASONING_OPTIONS.map((option, index) => {
                    const active = option.value === value;
                    const label = t(option.labelKey);
                    const hint = t(option.hintKey);
                    return (
                        <Tooltip key={option.value}>
                            <TooltipTrigger asChild>
                                <button
                                    ref={(el) => {
                                        refs.current[index] = el;
                                    }}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    tabIndex={active ? 0 : -1}
                                    onClick={() => onChange(option.value)}
                                    onKeyDown={(event) => handleKeyDown(event, index)}
                                    className={cn(
                                        'text-mini focus-visible:ring-ring rounded-[6px] px-2 py-1 font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none',
                                        active
                                            ? 'bg-background-primary text-foreground-primary shadow-sm'
                                            : 'text-foreground-tertiary hover:text-foreground-secondary',
                                        pillClassName,
                                    )}
                                >
                                    {label}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent
                                side="top"
                                sideOffset={4}
                                className="max-w-[200px] text-xs"
                            >
                                {hint}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </div>
    );
};
