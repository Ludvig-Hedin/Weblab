'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

export interface FontHeroRowProps {
    /** Current font family name (display label). */
    family: string;
    /** Triggered when the user clicks the row. */
    onClick?: () => void;
    /** Visual font weight applied to the "Aa" preview chip. */
    sampleWeight?: number;
    className?: string;
}

/**
 * 36px-tall hero row showing the current font family with a small
 * sample tile rendered IN THE FONT itself. Clicking opens the
 * caller-owned font picker popover (Text section wires this up).
 */
export function FontHeroRow({ family, onClick, sampleWeight = 500, className }: FontHeroRowProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                FIELD_BASE_CLASSES,
                'grid h-[36px] min-w-0 items-center gap-2.5 pr-[10px] pl-[5px] text-left',
                'grid-cols-[26px_1fr_auto]',
                className,
            )}
            aria-label="Change font"
            title="Change font"
        >
            <span
                aria-hidden
                className="bg-foreground/[0.04] inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-sm leading-none"
                style={{ fontFamily: family || 'inherit', fontWeight: sampleWeight }}
            >
                Aa
            </span>
            <span className="text-foreground-primary text-mini truncate">
                {family || 'Default'}
            </span>
            <ChevronDown className="text-foreground-tertiary size-3 shrink-0" />
        </button>
    );
}
