'use client';

import { useTranslations } from 'next-intl';

import type { BreakpointFlags } from '@weblab/models';
import { Checkbox } from '@weblab/ui/checkbox';
import { Label } from '@weblab/ui/label';

import { transKeys } from '@/i18n/keys';

interface BreakpointCheckboxesProps {
    flags: BreakpointFlags;
    onChange: (flags: BreakpointFlags) => void;
}

const BPS = ['desktop', 'tablet', 'phone'] as const;

export function BreakpointCheckboxes({ flags, onChange }: BreakpointCheckboxesProps) {
    const t = useTranslations();

    const labels = {
        desktop: t(
            transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.breakpoints
                .desktop,
        ),
        tablet: t(
            transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.breakpoints
                .tablet,
        ),
        phone: t(
            transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.breakpoints.phone,
        ),
    };

    const setFlag = (bp: (typeof BPS)[number], value: boolean) => {
        const next: BreakpointFlags = { ...flags };
        if (value) {
            delete next[bp];
        } else {
            next[bp] = false;
        }
        onChange(next);
    };

    return (
        <div className="flex flex-col gap-1.5 px-3 pb-2">
            <span className="text-foreground-tertiary text-mini">
                {t(transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.activeOn)}
            </span>
            <div className="flex flex-wrap items-center gap-3">
                {BPS.map((bp) => {
                    const checked = flags[bp] !== false;
                    return (
                        <Label
                            key={bp}
                            className="text-foreground-secondary text-mini flex cursor-pointer items-center gap-1.5"
                        >
                            <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => setFlag(bp, Boolean(v))}
                            />
                            {labels[bp]}
                        </Label>
                    );
                })}
            </div>
        </div>
    );
}
