'use client';

import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';

import { IconButtonSm } from './icon-button-sm';
import { IconNumberInput } from './icon-number-input';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface PerCornerPopoverProps {
    triggerIcon: React.ReactNode;
    triggerLabel: string;
    values: Record<Corner, string>;
    onCommit: (corner: Corner, value: string) => void;
    units?: readonly string[];
    triggerPressed?: boolean;
}

/**
 * Group-head action that opens a Popover with 4 per-corner number
 * inputs arranged in a small grid (top-left, top-right, bottom-left,
 * bottom-right). Used by Border for per-corner border-radius.
 */
export function PerCornerPopover({
    triggerIcon,
    triggerLabel,
    values,
    onCommit,
    units,
    triggerPressed,
}: PerCornerPopoverProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <IconButtonSm label={triggerLabel} pressed={triggerPressed}>
                    {triggerIcon}
                </IconButtonSm>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[240px] rounded-[10px] p-2">
                <div className="text-foreground-secondary mb-2 text-[11px]">Per corner</div>
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
                        glyph="↖"
                        value={values.tl}
                        onCommit={(v) => onCommit('tl', v)}
                        units={units}
                        aria-label="Top left"
                    />
                    <IconNumberInput
                        glyph="↗"
                        value={values.tr}
                        onCommit={(v) => onCommit('tr', v)}
                        units={units}
                        aria-label="Top right"
                    />
                    <IconNumberInput
                        glyph="↙"
                        value={values.bl}
                        onCommit={(v) => onCommit('bl', v)}
                        units={units}
                        aria-label="Bottom left"
                    />
                    <IconNumberInput
                        glyph="↘"
                        value={values.br}
                        onCommit={(v) => onCommit('br', v)}
                        units={units}
                        aria-label="Bottom right"
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
