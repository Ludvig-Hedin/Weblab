'use client';

import * as React from 'react';

import type { TailwindColor } from '@weblab/models/style';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';
import { Color } from '@weblab/utility';

import { ColorPickerContent } from '../../../editor-bar/inputs/color-picker';
import { FIELD_BASE_CLASSES } from './constants';

export interface ShadowFieldProps {
    /** Raw CSS `box-shadow` string, e.g. `"0 1px 2px rgba(0,0,0,0.25)"`. */
    value: string;
    /** Called with a serialized `box-shadow` string on every change. */
    onCommit: (value: string) => void;
    className?: string;
}

interface ShadowParts {
    x: number;
    y: number;
    blur: number;
    spread: number;
    /** Always a hex string, with or without alpha. */
    color: string;
}

const ZERO_SHADOW: ShadowParts = {
    x: 0,
    y: 0,
    blur: 0,
    spread: 0,
    color: '#00000040',
};

/**
 * Parse a single `box-shadow` declaration into editable parts. Defensive: any
 * unparseable input falls back to a zeroed shadow rather than throwing. Only
 * the first shadow layer is edited (the common case for the panel).
 */
function parseShadow(input: string): ShadowParts {
    const trimmed = input.trim();
    if (!trimmed || trimmed === 'none') return { ...ZERO_SHADOW };

    // Split off a leading/trailing color token, leaving the numeric offsets.
    // Colors can be hex, rgb(a), hsl(a), or a named color — pull the first
    // function-or-hex token out, then read up to four lengths from the rest.
    const colorMatch = /#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\([^)]*\)/.exec(trimmed);
    let color = ZERO_SHADOW.color;
    if (colorMatch) {
        try {
            color = Color.from(colorMatch[0]).toHex();
        } catch {
            color = ZERO_SHADOW.color;
        }
    }

    const numeric = colorMatch ? trimmed.replace(colorMatch[0], ' ') : trimmed;
    const lengths = (numeric.match(/-?\d*\.?\d+/g) ?? []).map(Number);

    return {
        x: lengths[0] ?? 0,
        y: lengths[1] ?? 0,
        blur: lengths[2] ?? 0,
        spread: lengths[3] ?? 0,
        color,
    };
}

/** Serialize parts back into a valid `box-shadow` string. */
function serializeShadow({ x, y, blur, spread, color }: ShadowParts): string {
    return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

/** Short human summary for the collapsed trigger. */
function summarize({ x, y, blur }: ShadowParts): string {
    return `${x}px ${y}px ${blur}px`;
}

/** Stepper button pair: `−  |  +`. Shift-click steps by 10. */
function Stepper({ onStep }: { onStep: (delta: number) => void }) {
    return (
        <div
            className={cn(
                'bg-background-secondary flex h-[30px] shrink-0 items-center overflow-hidden rounded-[10px] border border-transparent dark:bg-[#101010]',
            )}
        >
            <button
                type="button"
                aria-label="Decrease"
                onClick={(e) => onStep(e.shiftKey ? -10 : -1)}
                className="text-muted-foreground hover:text-foreground-primary hover:bg-foreground/[0.06] focus-visible:ring-foreground-brand/30 flex h-full w-7 cursor-pointer items-center justify-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
            >
                <Icons.Minus className="h-3 w-3" />
            </button>
            <span aria-hidden className="bg-input h-3.5 w-px dark:bg-white/[0.08]" />
            <button
                type="button"
                aria-label="Increase"
                onClick={(e) => onStep(e.shiftKey ? 10 : 1)}
                className="text-muted-foreground hover:text-foreground-primary hover:bg-foreground/[0.06] focus-visible:ring-foreground-brand/30 flex h-full w-7 cursor-pointer items-center justify-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
            >
                <Icons.Plus className="h-3 w-3" />
            </button>
        </div>
    );
}

/** One labelled `value box + stepper` row (X / Y / Blur / Spread). */
function OffsetRow({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (next: number) => void;
}) {
    const [draft, setDraft] = React.useState(String(value));

    React.useEffect(() => {
        setDraft(String(value));
    }, [value]);

    const commit = (raw: string) => {
        const parsed = Number.parseFloat(raw);
        const next = Number.isFinite(parsed) ? parsed : 0;
        setDraft(String(next));
        if (next !== value) onChange(next);
    };

    // Step from the in-progress `draft` (parsed with the same coercion
    // `commit` uses), not the stale committed `value` — so typing a number
    // and then clicking +/− without blurring steps from what the user typed.
    const step = (delta: number) => {
        const parsed = Number.parseFloat(draft);
        const base = Number.isFinite(parsed) ? parsed : 0;
        const next = base + delta;
        setDraft(String(next));
        if (next !== value) onChange(next);
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-9 shrink-0 text-[11px]">{label}</span>
            <div className={cn(FIELD_BASE_CLASSES, 'flex min-w-0 flex-1 items-center px-[10px]')}>
                <input
                    type="text"
                    inputMode="numeric"
                    spellCheck={false}
                    value={draft}
                    aria-label={label}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={(e) => commit(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commit(e.currentTarget.value);
                            e.currentTarget.blur();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setDraft(String(value));
                            e.currentTarget.blur();
                        }
                    }}
                    className="text-foreground-primary text-mini min-w-0 flex-1 cursor-text bg-transparent outline-none"
                />
            </div>
            <Stepper onStep={step} />
        </div>
    );
}

/**
 * Figma-style `box-shadow` editor.
 *
 * Collapsed: a trigger row with a tiny shadow-preview swatch and a short
 * summary ("0 1px 2px" or "Add shadow"). Expanded: a popover with a `Color`
 * row (swatch + hex + opacity) and `X` / `Y` / `Blur` rows, each a value box
 * paired with a `−  |  +` stepper. The incoming string is parsed on open and
 * a valid `box-shadow` is serialized back on every change.
 */
export function ShadowField({ value, onCommit, className }: ShadowFieldProps) {
    const isEmpty = !value || value.trim() === '' || value.trim() === 'none';
    const parts = React.useMemo(() => parseShadow(value), [value]);

    // Hex without alpha + an opacity percentage, mirroring the Figma color row.
    const color = React.useMemo(() => {
        try {
            return Color.from(parts.color);
        } catch {
            return Color.from(ZERO_SHADOW.color);
        }
    }, [parts.color]);
    const hex6 = color.toHex().slice(0, 7).toUpperCase();
    const opacityPct = Math.round((color.a ?? 1) * 100);

    // Local draft for the hex input so typing mid-entry (e.g. 4 chars) isn't
    // blocked; validation/revert happens on blur, not on every keystroke.
    const lastValidHex = hex6.replace('#', '');
    const [hexDraft, setHexDraft] = React.useState(lastValidHex);
    React.useEffect(() => {
        setHexDraft(lastValidHex);
    }, [lastValidHex]);

    const isValidHex = (raw: string) =>
        /^[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(raw);

    const commitHex = () => {
        const raw = hexDraft.replace(/^#/, '');
        if (isValidHex(raw)) {
            setColorHex(`#${raw}`);
        } else {
            // Revert to the last valid hex value.
            setHexDraft(lastValidHex);
        }
    };

    const update = (next: Partial<ShadowParts>) => {
        onCommit(serializeShadow({ ...parts, ...next }));
    };

    const setColorHex = (hex: string) => {
        try {
            // Preserve the current opacity when only the hue changes.
            const base = Color.from(hex);
            update({ color: base.withAlpha(color.a ?? 1).toHex() });
        } catch {
            // Ignore invalid hex input — keep the previous color.
        }
    };

    const setOpacity = (pct: number) => {
        const clamped = Math.min(100, Math.max(0, pct));
        update({ color: color.withAlpha(clamped / 100).toHex() });
    };

    return (
        <div className={cn('w-full', className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn(FIELD_BASE_CLASSES, 'justify-start gap-2 shadow-none')}
                        aria-label="Edit shadow"
                    >
                        <span
                            aria-hidden
                            className="border-foreground/10 h-4 w-4 shrink-0 rounded-sm border bg-white"
                            style={{
                                boxShadow: isEmpty
                                    ? undefined
                                    : `${Math.max(-2, Math.min(2, parts.x))}px ${Math.max(-2, Math.min(2, parts.y))}px ${Math.min(4, parts.blur)}px ${parts.color}`,
                            }}
                        />
                        <span className="truncate">
                            {isEmpty ? 'Add shadow' : summarize(parts)}
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    side="left"
                    alignOffset={-4}
                    className="w-[248px] p-0"
                >
                    <div className="border-foreground/8 flex items-center justify-between border-b px-3 py-2">
                        <span className="text-foreground-primary text-mini font-medium">
                            Shadow
                        </span>
                        {!isEmpty && (
                            <button
                                type="button"
                                onClick={() => onCommit('')}
                                className="text-muted-foreground hover:text-foreground-primary focus-visible:ring-foreground-brand/30 cursor-pointer rounded-sm transition-colors outline-none focus-visible:ring-[3px]"
                                aria-label="Remove shadow"
                                title="Remove shadow"
                            >
                                <Icons.Trash className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 p-3">
                        {/* Color row — swatch (nested picker) + hex + opacity. */}
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-9 shrink-0 text-[11px]">
                                Color
                            </span>
                            <div
                                className={cn(
                                    FIELD_BASE_CLASSES,
                                    'flex min-w-0 flex-1 items-center gap-2 px-[10px]',
                                )}
                            >
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label="Pick shadow color"
                                            // `border` is the swatch's decorative
                                            // edge; the keyboard focus ring is a
                                            // separate `focus-visible:ring-*` so
                                            // the two never collide.
                                            className="border-foreground/15 focus-visible:ring-foreground-brand/40 h-4 w-4 shrink-0 cursor-pointer rounded-sm border outline-none focus-visible:ring-[3px]"
                                            style={{ backgroundColor: color.toHex() }}
                                        />
                                    </PopoverTrigger>
                                    <PopoverContent
                                        side="left"
                                        align="start"
                                        alignOffset={-8}
                                        className="w-[224px] overflow-hidden rounded-lg p-0 shadow-xl"
                                    >
                                        <ColorPickerContent
                                            color={color}
                                            hideGradient
                                            onChange={(c) =>
                                                update({
                                                    color: toHex(c, color.a ?? 1),
                                                })
                                            }
                                            onChangeEnd={(c) =>
                                                update({
                                                    color: toHex(c, color.a ?? 1),
                                                })
                                            }
                                        />
                                    </PopoverContent>
                                </Popover>
                                <input
                                    type="text"
                                    spellCheck={false}
                                    value={hexDraft}
                                    aria-label="Shadow hex"
                                    onChange={(e) =>
                                        setHexDraft(e.target.value.replace(/[^0-9a-fA-F]/g, ''))
                                    }
                                    onBlur={commitHex}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            e.currentTarget.blur();
                                        } else if (e.key === 'Escape') {
                                            e.preventDefault();
                                            setHexDraft(lastValidHex);
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    className="text-foreground-primary text-mini min-w-0 flex-1 cursor-text bg-transparent uppercase outline-none"
                                />
                            </div>
                            <div
                                className={cn(
                                    FIELD_BASE_CLASSES,
                                    'flex w-[56px] shrink-0 items-center px-[10px]',
                                )}
                            >
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    spellCheck={false}
                                    value={String(opacityPct)}
                                    aria-label="Shadow opacity"
                                    onChange={(e) => {
                                        const n = Number.parseInt(
                                            e.target.value.replace(/[^0-9]/g, ''),
                                            10,
                                        );
                                        if (Number.isFinite(n)) setOpacity(n);
                                    }}
                                    className="text-foreground-primary text-mini min-w-0 flex-1 cursor-text bg-transparent outline-none"
                                />
                                <span className="text-muted-foreground text-[11px]">%</span>
                            </div>
                        </div>

                        <OffsetRow label="X" value={parts.x} onChange={(x) => update({ x })} />
                        <OffsetRow label="Y" value={parts.y} onChange={(y) => update({ y })} />
                        <OffsetRow
                            label="Blur"
                            value={parts.blur}
                            onChange={(blur) => update({ blur })}
                        />
                        <OffsetRow
                            label="Spread"
                            value={parts.spread}
                            onChange={(spread) => update({ spread })}
                        />
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

/** Coerce a picker result (Color or TailwindColor) to a hex string + alpha. */
function toHex(c: Color | TailwindColor, alpha: number): string {
    try {
        const base = c instanceof Color ? c : Color.from(c.lightColor || '#000000');
        return base.withAlpha(alpha).toHex();
    } catch {
        return ZERO_SHADOW.color;
    }
}
