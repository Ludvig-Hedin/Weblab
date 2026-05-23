'use client';

import * as React from 'react';

import { cn } from '@weblab/ui/utils';

export type AlignAxisValue = 'flex-start' | 'center' | 'flex-end';

export interface AlignPadProps {
    /** Current justify-content value. */
    justify: string;
    /** Current align-items value. */
    align: string;
    /** Called when the user clicks a cell. Emits both axes. */
    onCommit: (justify: AlignAxisValue, align: AlignAxisValue) => void;
    /** Visual height for the pad. Defaults to 78px (matches locked spec). */
    height?: number;
    className?: string;
}

const ALIGN_VALUES: AlignAxisValue[] = ['flex-start', 'center', 'flex-end'];

/**
 * 3×3 dot grid that controls `justify-content` + `align-items` together.
 *
 * Columns map to `justify-content` (start / center / end).
 * Rows map to `align-items` (start / center / end).
 *
 * Clicking the cell at (col, row) writes both axes via `onCommit`.
 *
 * Visual model (locked spec):
 *   - Container `bg-input` rounded-8 with 10px padding.
 *   - 3×3 grid, 4px gaps.
 *   - Each cell hover lifts to `bg-foreground/5`.
 *   - The active cell shows a 14×3 horizontal bar in `--text` colour
 *     (matches the Figma alignment-pad pattern).
 */
export const AlignPad = React.memo(function AlignPad({
    justify,
    align,
    onCommit,
    height = 78,
    className,
}: AlignPadProps) {
    const activeCol = ALIGN_VALUES.indexOf(normalize(justify));
    const activeRow = ALIGN_VALUES.indexOf(normalize(align));

    return (
        <div
            role="grid"
            aria-label="Alignment"
            className={cn(
                'bg-background-secondary grid w-full grid-cols-3 grid-rows-3 gap-1 rounded-[10px] p-[10px] dark:bg-[#262626]',
                className,
            )}
            style={{ height }}
        >
            {ALIGN_VALUES.map((rowValue, rowIdx) =>
                ALIGN_VALUES.map((colValue, colIdx) => {
                    const isActive = colIdx === activeCol && rowIdx === activeRow;
                    return (
                        <button
                            key={`${rowIdx}-${colIdx}`}
                            type="button"
                            role="gridcell"
                            aria-selected={isActive}
                            aria-label={`Justify ${colValue}, Align ${rowValue}`}
                            onClick={() => onCommit(colValue, rowValue)}
                            className={cn(
                                'group relative flex cursor-pointer items-center justify-center rounded-[4px] transition-colors',
                                'hover:bg-foreground/5',
                                isActive && 'bg-foreground/10',
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    'transition-all',
                                    isActive
                                        ? 'bg-foreground-primary h-[3px] w-[14px] rounded-[1.5px]'
                                        : 'bg-foreground-tertiary group-hover:bg-foreground-primary h-1 w-1 rounded-full',
                                )}
                            />
                        </button>
                    );
                }),
            )}
        </div>
    );
});

function normalize(v: string): AlignAxisValue {
    if (v === 'start' || v === 'left' || v === 'top') return 'flex-start';
    if (v === 'end' || v === 'right' || v === 'bottom') return 'flex-end';
    if (v === 'center') return 'center';
    if (v === 'flex-start' || v === 'flex-end') return v;
    return 'flex-start';
}
