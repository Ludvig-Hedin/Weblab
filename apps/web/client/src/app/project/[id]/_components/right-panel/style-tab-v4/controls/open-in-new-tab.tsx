'use client';

import { Check } from 'lucide-react';

import { cn } from '@weblab/ui/utils';

export interface OpenInNewTabCheckboxProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    className?: string;
    label?: string;
}

/**
 * Tiny inline checkbox used in the Element section's Link group head
 * when an `href` is set. Toggles writing `target="_blank"
 * rel="noreferrer"` on the anchor.
 */
export function OpenInNewTabCheckbox({
    checked,
    onChange,
    className,
    label = 'Open in new tab',
}: OpenInNewTabCheckboxProps) {
    return (
        <label
            className={cn(
                'text-foreground-secondary flex cursor-pointer items-center gap-1.5 text-[11px] select-none',
                className,
            )}
        >
            <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span
                aria-hidden
                className={cn(
                    'flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-xs border transition-colors',
                    checked
                        ? 'bg-foreground-brand border-foreground-brand text-white'
                        : 'bg-background-secondary border-foreground/10',
                )}
            >
                {checked && <Check className="h-[10px] w-[10px]" strokeWidth={3} />}
            </span>
            <span>{label}</span>
        </label>
    );
}
