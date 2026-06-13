'use client';

import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

import type { LayoutGuideAlignment, LayoutGuideConfig, LayoutGuideType } from '@weblab/models';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

// Popover fields share the panel-wide field grammar (height, radius, fill,
// hover, focus border) — only the select needs `appearance-none` on top.
const NUMBER_FIELD = FIELD_BASE_CLASSES;

const SELECT_FIELD = cn(FIELD_BASE_CLASSES, 'appearance-none');

interface LayoutGuidePopoverProps {
    guide: LayoutGuideConfig;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (patch: Partial<LayoutGuideConfig>) => void;
    trigger: ReactElement;
}

/**
 * Figma-shaped config popover for a single LayoutGuideConfig entry. Fields
 * mirror Figma's UI exactly:
 *   - Columns / Rows: Type, Count, Color (hex), Type/alignment, Width,
 *     Margin, Gutter.
 *   - Grid: Type, Size, Color.
 *
 * Reasoning for raw `<input>` / `<select>` instead of LabeledNumberInput:
 * the popover is a tightly-packed form with 6 fields, and the v4 labeled
 * inputs are tuned for the column-layout rows in the main panel — their
 * minimum widths would make the popover too wide. The styling tokens
 * come from `controls/constants.ts` so visual consistency is preserved.
 */
export function LayoutGuidePopover({
    guide,
    open,
    onOpenChange,
    onChange,
    trigger,
}: LayoutGuidePopoverProps) {
    const t = useTranslations('editor.stylePanel');
    const isGrid = guide.type === 'grid';

    const handleTypeChange = useCallback(
        (type: LayoutGuideType) => {
            // Switching type carries the color over but resets fields the new
            // type doesn't use, so the form never shows ghost values.
            if (type === 'grid') {
                onChange({ type, size: guide.size ?? 10 });
                return;
            }
            onChange({
                type,
                count: guide.count ?? 12,
                alignment: guide.alignment ?? 'stretch',
                width: guide.width ?? null,
                margin: guide.margin ?? 0,
                gutter: guide.gutter ?? 16,
            });
        },
        [guide, onChange],
    );

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="border-border/40 bg-background-popover w-[260px] rounded-[10px] p-3 shadow-lg"
            >
                <div className="mb-2 flex items-center justify-between">
                    <select
                        aria-label={t('layoutGuide.layoutGuideTypeAriaLabel')}
                        value={guide.type}
                        onChange={(e) => handleTypeChange(e.target.value as LayoutGuideType)}
                        className={cn(SELECT_FIELD, 'w-[110px]')}
                    >
                        <option value="grid">{t('layoutGuide.grid')}</option>
                        <option value="columns">{t('layoutGuide.columns')}</option>
                        <option value="rows">{t('layoutGuide.rows')}</option>
                    </select>
                </div>

                <div className="grid grid-cols-[80px_1fr] items-center gap-x-2 gap-y-2">
                    {isGrid ? (
                        <Field label={t('layoutGuide.size')}>
                            <NumberInput
                                value={guide.size ?? 10}
                                onCommit={(n) => onChange({ size: n })}
                            />
                        </Field>
                    ) : (
                        <Field label={t('layoutGuide.count')}>
                            <NumberInput
                                value={guide.count ?? 12}
                                min={1}
                                onCommit={(n) => onChange({ count: Math.max(1, Math.round(n)) })}
                            />
                        </Field>
                    )}

                    <Field label={t('layoutGuide.color')}>
                        <ColorInput
                            value={guide.color}
                            onChange={(color) => onChange({ color })}
                            colorAriaLabel={t('layoutGuide.colorAriaLabel')}
                            colorHexAriaLabel={t('layoutGuide.colorHexAriaLabel')}
                        />
                    </Field>

                    {!isGrid && (
                        <>
                            <Field label={t('layoutGuide.alignmentType')}>
                                <select
                                    aria-label={t('layoutGuide.alignmentAriaLabel')}
                                    value={guide.alignment ?? 'stretch'}
                                    onChange={(e) =>
                                        onChange({
                                            alignment: e.target.value as LayoutGuideAlignment,
                                        })
                                    }
                                    className={SELECT_FIELD}
                                >
                                    <option value="stretch">{t('layoutGuide.stretch')}</option>
                                    {guide.type === 'columns' ? (
                                        <>
                                            <option value="left">{t('layoutGuide.left')}</option>
                                            <option value="center">{t('layoutGuide.center')}</option>
                                            <option value="right">{t('layoutGuide.right')}</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="top">{t('layoutGuide.top')}</option>
                                            <option value="center">{t('layoutGuide.center')}</option>
                                            <option value="bottom">{t('layoutGuide.bottom')}</option>
                                        </>
                                    )}
                                </select>
                            </Field>

                            <Field label={t('layoutGuide.width')}>
                                <NullableNumberInput
                                    value={guide.width ?? null}
                                    placeholder={t('layoutGuide.auto')}
                                    onCommit={(n) => onChange({ width: n })}
                                />
                            </Field>

                            <Field label={t('layoutGuide.margin')}>
                                <NumberInput
                                    value={guide.margin ?? 0}
                                    onCommit={(n) => onChange({ margin: n })}
                                />
                            </Field>

                            <Field label={t('layoutGuide.gutter')}>
                                <NumberInput
                                    value={guide.gutter ?? 0}
                                    onCommit={(n) => onChange({ gutter: n })}
                                />
                            </Field>
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactElement }) {
    return (
        <>
            <span className="text-foreground-tertiary text-[11px]">{label}</span>
            <div className="min-w-0">{children}</div>
        </>
    );
}

function NumberInput({
    value,
    onCommit,
    min,
}: {
    value: number;
    onCommit: (n: number) => void;
    min?: number;
}) {
    return (
        <input
            type="number"
            value={Number.isFinite(value) ? value : 0}
            min={min}
            onChange={(e) => {
                const next = Number.parseFloat(e.target.value);
                if (Number.isFinite(next)) onCommit(next);
            }}
            className={NUMBER_FIELD}
        />
    );
}

/** Width-style input — empty string represents "Auto" (null on the model). */
function NullableNumberInput({
    value,
    placeholder,
    onCommit,
}: {
    value: number | null;
    placeholder?: string;
    onCommit: (n: number | null) => void;
}) {
    return (
        <input
            type="text"
            inputMode="decimal"
            value={value === null ? '' : String(value)}
            placeholder={placeholder}
            onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === '' || raw.toLowerCase() === 'auto') {
                    onCommit(null);
                    return;
                }
                const next = Number.parseFloat(raw);
                if (Number.isFinite(next)) onCommit(next);
            }}
            className={NUMBER_FIELD}
        />
    );
}

function ColorInput({
    value,
    onChange,
    colorAriaLabel,
    colorHexAriaLabel,
}: {
    value: string;
    onChange: (v: string) => void;
    colorAriaLabel: string;
    colorHexAriaLabel: string;
}) {
    // Two inputs side-by-side: a native color picker (no alpha) and a free-form
    // text field that DOES support alpha (#RRGGBBAA). Editing either commits
    // immediately so the overlay updates as the user types.
    const baseColor = value.slice(0, 7); // strip alpha for the native picker
    return (
        <div className="flex items-center gap-1">
            <input
                type="color"
                aria-label={colorAriaLabel}
                value={baseColor.length === 7 ? baseColor : '#FF0000'}
                onChange={(e) => {
                    // Preserve any alpha suffix the user already typed.
                    const alpha = value.length > 7 ? value.slice(7) : '';
                    onChange(`${e.target.value}${alpha}`);
                }}
                className="h-[28px] w-[28px] shrink-0 cursor-pointer rounded-[6px] border-0 bg-transparent p-0"
            />
            <input
                type="text"
                aria-label={colorHexAriaLabel}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={NUMBER_FIELD}
            />
        </div>
    );
}
