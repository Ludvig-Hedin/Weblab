'use client';

import * as React from 'react';

import { cn } from '@weblab/ui/utils';

import { ICON_BTN_SM_CLASSES } from './constants';

export interface IconButtonSmProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    children: React.ReactNode;
    pressed?: boolean;
}

/**
 * 22×22 transparent icon button used for group-head right-side actions
 * (raw-edit, per-side, per-corner, add, etc.). Fixed geometry from
 * `ICON_BTN_SM_CLASSES` so every group head reads as a consistent row.
 *
 * Renders `aria-label={label}` AND `title={label}` so the icon-only
 * trigger has both screen-reader text and a native hover tooltip — no
 * need for Tooltip wrappers on every callsite for affordances that are
 * already discoverable through context.
 */
export const IconButtonSm = React.forwardRef<HTMLButtonElement, IconButtonSmProps>(
    function IconButtonSm({ label, children, pressed, className, ...rest }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={pressed}
                className={cn(ICON_BTN_SM_CLASSES, className)}
                {...rest}
            >
                {children}
            </button>
        );
    },
);
