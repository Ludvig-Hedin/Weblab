'use client';

import type { ReactNode } from 'react';

import { cn } from '@weblab/ui/utils';

import { GROUP_LABEL_CLASSES } from './constants';

export interface GroupShellProps {
    /** Optional label rendered above the children (sentence-case 11px). */
    label?: ReactNode;
    /** Optional right-side action(s) rendered next to the label (icon buttons). */
    actions?: ReactNode;
    /** Group content — typically the input(s) this label describes. */
    children: ReactNode;
    /** Optional extra class on the outer container. */
    className?: string;
    /** Optional gap between label row and children. Defaults to 6px. */
    gap?: number;
}

/**
 * Standard wrapper for a labeled control group inside the v4 Style panel.
 *
 * Renders:
 *   - A small label row (label left, right-action icons on the right) when
 *     `label` or `actions` is provided.
 *   - The control body below, separated by a 6px gap.
 *
 * Matches the v4 grammar locked in DESIGN-BRIEF.md: labels above inputs,
 * sentence-case, no uppercase, foreground-secondary tone.
 */
export function GroupShell({ label, actions, children, className, gap = 6 }: GroupShellProps) {
    const showHead = label !== undefined || actions !== undefined;
    return (
        <div className={cn('flex flex-col', className)} style={{ gap }}>
            {showHead && (
                <div className="flex items-center justify-between">
                    <span className={GROUP_LABEL_CLASSES}>{label}</span>
                    {actions && <div className="flex items-center gap-1">{actions}</div>}
                </div>
            )}
            {children}
        </div>
    );
}
