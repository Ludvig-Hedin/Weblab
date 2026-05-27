'use client';

import type { ReactElement } from 'react';
import { useCallback } from 'react';

import type { LayoutGuideAlignment, LayoutGuideConfig, LayoutGuideType } from '@weblab/models';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';

// Tailwind class string for popover number inputs. Mirrors FIELD_BASE_CLASSES_SM
// from ../controls/constants.ts but kept inline because the popover doesn't
// need every variant the segmented controls do.
const NUMBER_FIELD =
    'h-[24px] w-full rounded-[6px] border border-transparent bg-background-secondary text-mini text-foreground-primary placeholder:text-muted-foreground hover:bg-background-tertiary focus-visible:border-foreground-brand outline-none px-2 text-[12px]';

const SELECT_FIELD =
    'h-[24px] w-full rounded-[6px] border border-transparent bg-background-secondary text-mini text-foreground-primary hover:bg-background-tertiary focus-visible:border-foreground-brand outline-none px-2 text-[12px] appearance-none';

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
                        aria-label="Layout guide type"
                        value={guide.type}
                        onChange={(e) => handleTypeChange(e.target.value as LayoutGuideType)}
                        className={`${SELECT_FIELD} w-[110px]`}
                    >
                        <option value="grid">Grid</option>
                        <option value="columns">Columns</option>
                        <option value="rows">Rows</option>
                    </select>
                </div>

                <div className="grid grid-cols-[80px_1fr] items-center gap-x-2 gap-y-2">
                    {isGrid ? (
                        <Field label="Size">
                            <NumberInput
                                value={guide.size ?? 10}
                                onCommit={(n) => onChange({ size: n })}
                            />
                        </Field>
                    ) : (
                        <Field label="Count">
                            <NumberInput
                                value={guide.count ?? 12}
                                min={1}
                                onCommit={(n) => onChange({ count: Math.max(1, Math.round(n)) })}
                            />
                        </Field>
                    )}

                    <Field label="Color">
                        <ColorInput value={guide.color} onChange={(color) => onChange({ color })} />
                    </Field>

                    {!isGrid && (
                        <>
                            <Field label="Type">
                                <select
                                    aria-label="Alignment"
                                    value={guide.alignment ?? 'stretch'}
                                    onChange={(e) =>
                                        onChange({
                                            alignment: e.target.value as LayoutGuideAlignment,
                                        })
                                    }
                                    className={SELECT_FIELD}
                                >
                                    <option value="stretch">Stretch</option>
                                    {guide.type === 'columns' ? (
                                        <>
                                            <option value="left">Left</option>
                                            <option value="center">Center</option>
                                            <option value="right">Right</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="top">Top</option>
                                            <option value="center">Center</option>
                                            <option value="bottom">Bottom</option>
                                        </>
                                    )}
                                </select>
                            </Field>

                            <Field label="Width">
                                <NullableNumberInput
                                    value={guide.width ?? null}
                                    placeholder="Auto"
                                    onCommit={(n) => onChange({ width: n })}
                                />
                            </Field>

                            <Field label="Margin">
                                <NumberInput
                                    value={guide.margin ?? 0}
                                    onCommit={(n) => onChange({ margin: n })}
                                />
                            </Field>

                            <Field label="Gutter">
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

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    // Two inputs side-by-side: a native color picker (no alpha) and a free-form
    // text field that DOES support alpha (#RRGGBBAA). Editing either commits
    // immediately so the overlay updates as the user types.
    const baseColor = value.slice(0, 7); // strip alpha for the native picker
    return (
        <div className="flex items-center gap-1">
            <input
                type="color"
                aria-label="Color"
                value={baseColor.length === 7 ? baseColor : '#FF0000'}
                onChange={(e) => {
                    // Preserve any alpha suffix the user already typed.
                    const alpha = value.length > 7 ? value.slice(7) : '';
                    onChange(`${e.target.value}${alpha}`);
                }}
                className="size-6 cursor-pointer rounded-[4px] border-0 bg-transparent p-0"
            />
            <input
                type="text"
                aria-label="Color hex"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={NUMBER_FIELD}
            />
        </div>
    );
}
