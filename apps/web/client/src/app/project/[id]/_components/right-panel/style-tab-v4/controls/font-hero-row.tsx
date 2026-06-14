'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

export interface FontHeroRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Current font family name (display label). */
    family: string;
    /** Visual font weight applied to the "Aa" preview chip. */
    sampleWeight?: number;
    className?: string;
}

/**
 * 36px-tall hero row showing the current font family with a small
 * sample tile rendered IN THE FONT itself. Forwards ref + props so it
 * can be used directly as a Radix `asChild` popover trigger (the Text
 * section passes it to FontField's `trigger` slot — one click opens
 * the picker).
 */
export const FontHeroRow = React.forwardRef<HTMLButtonElement, FontHeroRowProps>(
    function FontHeroRow({ family, sampleWeight = 500, className, ...rest }, ref) {
        const t = useTranslations('editor.stylePanel.controls.fontHeroRow');
        return (
            <button
                ref={ref}
                type="button"
                className={cn(
                    FIELD_BASE_CLASSES,
                    'grid h-[36px] min-w-0 items-center gap-2.5 pr-[10px] pl-[5px] text-left',
                    'grid-cols-[26px_1fr_auto]',
                    className,
                )}
                aria-label={t('changeFont')}
                title={t('changeFont')}
                {...rest}
            >
                <span
                    aria-hidden
                    className="bg-foreground/[0.04] inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-sm leading-none"
                    style={{ fontFamily: family || 'inherit', fontWeight: sampleWeight }}
                >
                    Aa
                </span>
                <span className="text-foreground-primary text-mini min-w-0 truncate">
                    {family || t('defaultFamily')}
                </span>
                <ChevronDown className="text-foreground-tertiary size-3 shrink-0" />
            </button>
        );
    },
);
