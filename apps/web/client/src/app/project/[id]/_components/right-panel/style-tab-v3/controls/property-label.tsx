'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import { useTranslations } from 'next-intl';

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
 * the fixed-width gutter and the "is set" visual language. Other surfaces
 * (box-model, corner-radius, element metadata) reuse this so the panel
 * reads as a single column.
 *
 * v3 tuning vs v2:
 *
 *   - The status dot is rendered ONLY when the property is set — a single
 *     `foreground-brand` blue mark. The old gray "unset" dot was visual
 *     noise; an unset row now carries no dot. A zero-opacity fixed-width
 *     spacer holds the gutter so set/unset rows stay column-aligned and
 *     the label text never shifts horizontally between states.
 *   - Unset labels lifted from `foreground-tertiary` (a whisper) to
 *     `foreground-primary/80` — roughly 85% of the set label's presence,
 *     so an unset row is easily readable, not a hint. The set label keeps
 *     a slight edge with full `foreground-primary` + `font-medium`.
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
    const t = useTranslations('editor.stylePanel.controls.propertyLabel');
    return (
        <button
            type="button"
            onClick={onClick}
            title={title ?? t('altClickToReset', { label })}
            aria-label={ariaLabel}
            className={cn(
                // Set rows get a touch more weight so a section scan still
                // reveals which props are authored — but the gap to unset is
                // intentionally small (~85% visibility) so every row reads.
                // `cursor-pointer`: the label is clickable (⌥-click resets the
                // property), so it should not read as inert text.
                'text-mini flex w-[72px] shrink-0 cursor-pointer items-center gap-1.5 text-left transition-colors',
                isSet
                    ? 'text-foreground-secondary font-medium'
                    : 'text-foreground-tertiary font-normal',
                className,
            )}
        >
            {icon ??
                (isSet ? (
                    <span
                        aria-hidden
                        className="bg-foreground-brand h-1.5 w-1.5 shrink-0 rounded-full"
                    />
                ) : (
                    // Invisible spacer: keeps the label text aligned with set
                    // rows without rendering a visible "unset" dot.
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0" />
                ))}
            <span className="truncate">{label}</span>
        </button>
    );
}
