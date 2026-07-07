'use client';

import type { MouseEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
    /**
     * Optional reset callback. When set, the label becomes a button that
     * resets the underlying property/properties on ⌥-click (or ⌥-Enter
     * keyboard). Sections wire this for groups that own a clearly-defined
     * "clear" semantic (e.g. clear all padding sides, reset W to auto).
     */
    onReset?: () => void;
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
 *
 * Reset affordance:
 *   - When `onReset` is provided, ⌥-click on the label calls the
 *     callback. The label gets a `title` hint ("⌥-click to reset")
 *     so designers can discover the gesture; visually it's the same
 *     muted text — no separate button clutter.
 */
export function GroupShell({
    label,
    actions,
    children,
    className,
    gap = 6,
    onReset,
}: GroupShellProps) {
    const t = useTranslations('editor.stylePanel');
    const showHead = label !== undefined || actions !== undefined;
    const handleLabelClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (event.altKey && onReset) {
            event.preventDefault();
            event.stopPropagation();
            onReset();
        }
    };
    return (
        <div className={cn('flex flex-col', className)} style={{ gap }}>
            {showHead && (
                <div className="group flex items-center justify-between">
                    {onReset ? (
                        <button
                            type="button"
                            onClick={handleLabelClick}
                            title={t('common.altClickToReset')}
                            className={cn(
                                GROUP_LABEL_CLASSES,
                                'hover:text-foreground-primary cursor-pointer text-left transition-colors',
                            )}
                        >
                            {label}
                        </button>
                    ) : (
                        <span className={GROUP_LABEL_CLASSES}>{label}</span>
                    )}
                    <div className="flex items-center gap-0.5">
                        {onReset && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onReset();
                                }}
                                aria-label={t('common.reset')}
                                title={t('common.reset')}
                                className="text-foreground-tertiary hover:text-foreground-primary flex size-4 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            >
                                <X className="size-2.5" />
                            </button>
                        )}
                        {actions && <div className="flex items-center gap-1">{actions}</div>}
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}
