'use client';

import type { MouseEventHandler, ReactNode } from 'react';

import { cn } from '@weblab/ui/utils';

export interface PropertyLabelProps {
    /** Visible label text. */
    label: string;
    /** Whether the property is explicitly set — drives the dot + label tint. */
    isSet: boolean;
    /** Optional icon rendered in place of the default status dot (e.g. chevron). */
    icon?: ReactNode;
    /** Optional click handler (e.g. alt-click reset, expand toggle). */
    onClick?: MouseEventHandler<HTMLButtonElement>;
    /** Tooltip title attribute. Defaults to `${label} — alt-click to reset`. */
    title?: string;
    /** Optional aria-label override. */
    ariaLabel?: string;
    /** Override the dot color when no custom icon is provided. */
    className?: string;
}

/**
 * Shared label primitive for every property row in the Style panel. Owns
 * the fixed-width gutter and the "is set" visual language (dot + tinted
 * label). Other surfaces (box-model, corner-radius, element metadata)
 * reuse this so the panel reads as a single column.
 */
export function PropertyLabel({
    label,
    isSet,
    icon,
    onClick,
    title,
    ariaLabel,
    className,
}: PropertyLabelProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title ?? `${label} — alt-click to reset`}
            aria-label={ariaLabel}
            className={cn(
                // Set rows get a heavier label + brighter dot so the user can
                // scan a section and read at a glance which props are authored.
                // Unset rows stay tertiary; on row hover they lift to secondary
                // as a subtle "this is editable" cue.
                'text-mini flex w-[72px] shrink-0 items-center gap-1.5 text-left transition-colors',
                isSet
                    ? 'text-foreground-primary font-semibold'
                    : 'text-foreground-tertiary group-hover/control:text-foreground-secondary font-normal',
                className,
            )}
        >
            {icon ?? (
                <span
                    aria-hidden
                    className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
                        isSet
                            ? 'bg-foreground-brand'
                            : 'bg-foreground-secondary/30 group-hover/control:bg-foreground-secondary/60',
                    )}
                />
            )}
            <span className="truncate">{label}</span>
        </button>
    );
}
