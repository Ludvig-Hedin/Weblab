'use client';

import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@weblab/ui/utils';

export type InlineButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Tertiary inline action used inside a section body — "+ More options",
 * "Hide", "+ Per-side widths", etc. Keeps tone consistent across sections
 * and avoids ad-hoc `text-[11px]` overrides.
 *
 * Rest tone is `tertiary`, hover lifts to `secondary`. Hover stays soft so
 * the affordance reads as "additional", not as a primary CTA.
 */
export function InlineButton({ className, type, ...props }: InlineButtonProps) {
    return (
        <button
            type={type ?? 'button'}
            className={cn(
                'text-mini text-foreground-tertiary hover:text-foreground-secondary mx-3 mb-1 self-start transition-colors',
                className,
            )}
            {...props}
        />
    );
}
