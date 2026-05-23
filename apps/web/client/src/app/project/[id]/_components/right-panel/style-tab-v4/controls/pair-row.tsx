'use client';

import type { ReactNode } from 'react';

import { cn } from '@weblab/ui/utils';

export interface PairRowProps {
    /** Optional element rendered in a fixed-width slot at the END of the row. */
    end?: ReactNode;
    /** Optional center slot rendered BETWEEN the two children. */
    center?: ReactNode;
    children: ReactNode;
    className?: string;
    /** Column gap in px. Defaults to 6. */
    gap?: number;
}

/**
 * 2-column row with even widths. Used for paired controls (Weight + Size,
 * Min W + Min H, H pad + V pad, etc.). Pass two children — they will land
 * in two equal-width 1fr columns.
 *
 * `center` lets you slip a fixed-width control between the two columns
 * (e.g. the LinkAspectButton between W and H).
 *
 * `end` lets you slip a fixed-width control AFTER the two columns
 * (e.g. the per-side expand button after H/V padding pair).
 */
export function PairRow({ end, center, children, className, gap = 6 }: PairRowProps) {
    const cols = center ? '1fr auto 1fr' : '1fr 1fr';
    const grid = end ? `${cols} 28px` : cols;
    return (
        <div
            className={cn('grid min-w-0 items-center', className)}
            style={{ gridTemplateColumns: grid, gap }}
        >
            {center ? (
                <>
                    {Array.isArray(children) ? children[0] : children}
                    {center}
                    {Array.isArray(children) ? children[1] : null}
                </>
            ) : (
                children
            )}
            {end}
        </div>
    );
}
