'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { IconButtonSm } from './icon-button-sm';
import { IconNumberInput } from './icon-number-input';

type Side = 'top' | 'right' | 'bottom' | 'left';

export interface PerSidePopoverProps {
    /** Trigger contents — typically a per-side glyph icon. */
    triggerIcon: React.ReactNode;
    /** Aria label for the trigger button. */
    triggerLabel: string;
    /** Current values per side. */
    values: Record<Side, string>;
    /** Commit callback per side. */
    onCommit: (side: Side, value: string) => void;
    /** Optional shared units list (defaults px/%/em/rem). */
    units?: readonly string[];
    /** Optional keyword list (e.g. `['auto']`) surfaced in the unit pill. */
    keywords?: readonly string[];
    /** Whether the trigger should appear pressed (open). */
    triggerPressed?: boolean;
}

/**
 * Group-head action that opens a Popover with 4 per-side number inputs
 * arranged in a small TRBL grid. Used by Layout (padding/margin per-
 * side detail) and Border (stroke per-side detail).
 */
export function PerSidePopover({
    triggerIcon,
    triggerLabel,
    values,
    onCommit,
    units,
    keywords,
    triggerPressed,
}: PerSidePopoverProps) {
    const t = useTranslations('editor.stylePanel');
    return (
        <Popover>
            <PopoverTrigger asChild>
                <IconButtonSm label={triggerLabel} pressed={triggerPressed}>
                    {triggerIcon}
                </IconButtonSm>
            </PopoverTrigger>
            <PopoverContent align="end" className={cn('w-[240px] rounded-[10px] p-2')}>
                <div className="text-foreground-secondary mb-2 text-[11px]">{t('common.perSide')}</div>
                <div
                    className="grid items-center justify-items-center"
                    style={{
                        gridTemplateColumns: '1fr 1fr',
                        gridTemplateRows: 'auto auto',
                        columnGap: 6,
                        rowGap: 6,
                    }}
                >
                    <IconNumberInput
                        glyph="T"
                        value={values.top}
                        onCommit={(v) => onCommit('top', v)}
                        units={units}
                        keywords={keywords}
                        aria-label={t('common.top')}
                    />
                    <IconNumberInput
                        glyph="R"
                        value={values.right}
                        onCommit={(v) => onCommit('right', v)}
                        units={units}
                        keywords={keywords}
                        aria-label={t('common.right')}
                    />
                    <IconNumberInput
                        glyph="B"
                        value={values.bottom}
                        onCommit={(v) => onCommit('bottom', v)}
                        units={units}
                        keywords={keywords}
                        aria-label={t('common.bottom')}
                    />
                    <IconNumberInput
                        glyph="L"
                        value={values.left}
                        onCommit={(v) => onCommit('left', v)}
                        units={units}
                        keywords={keywords}
                        aria-label={t('common.left')}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
