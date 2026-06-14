'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES, UNIT_PILL_CLASSES } from './constants';

const DEFAULT_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw'] as const;

/** 1rem assumed to equal 16px (browser default; matches Weblab base). */
const REM_PX = 16;

export interface IconNumberInputProps {
    /** Leading icon slot — single letter (`'T'`), React node, or null. */
    glyph?: React.ReactNode;
    /** Full string value, e.g. `"16px"`, `"1.5rem"`, `"auto"`, `""`. */
    value: string;
    /** Commit handler. Fires on blur, Enter, or unit/keyword pick. */
    onCommit: (value: string) => void;
    /** Units offered in the right-side pill. Pass `[]` to hide the pill. */
    units?: readonly string[];
    /** Keyword options surfaced in the pill (e.g. `['auto']`). */
    keywords?: readonly string[];
    /** Unit applied when the user types a bare number. */
    defaultUnit?: string;
    /** Accept non-numeric values (auto, none, etc) when typed manually. */
    allowKeywords?: boolean;
    /** Placeholder shown when the value is empty. */
    placeholder?: string;
    /** When true, multiple selected elements have different values. Shows italic "Mixed" placeholder. */
    mixed?: boolean;
    /** Aria label for the underlying input. */
    'aria-label'?: string;
    /** Extra class on the outer wrapper. */
    className?: string;
    /** Hide the unit/keyword pill entirely. */
    hidePill?: boolean;
}

interface Parsed {
    num: number | null;
    unit: string;
    keyword: string | null;
}

/** Parse `"16px"`, `"1.5"`, `"auto"`, or `""` into structured parts. */
function parse(input: string): Parsed {
    const trimmed = input.trim();
    if (trimmed === '') return { num: null, unit: '', keyword: null };
    const match = /^([-+]?[0-9]*\.?[0-9]+)\s*([a-zA-Z%]*)$/.exec(trimmed);
    if (!match) return { num: null, unit: '', keyword: trimmed };
    const numStr = match[1] ?? '';
    if (numStr === '' || numStr === '.' || numStr === '+' || numStr === '-') {
        return { num: null, unit: '', keyword: null };
    }
    const n = Number.parseFloat(numStr);
    if (Number.isNaN(n)) return { num: null, unit: '', keyword: null };
    return { num: n, unit: match[2] ?? '', keyword: null };
}

/** Format a numeric value: trim trailing zeros from a fixed-precision string. */
function trim(num: number): string {
    if (!Number.isFinite(num)) return '0';
    if (Number.isInteger(num)) return String(num);
    return Number.parseFloat(num.toFixed(4)).toString();
}

/**
 * Convert a numeric value from one CSS unit to another.
 *
 * Only `px` ↔ `rem` is meaningful (both length, fixed ratio). All other
 * unit changes are treated as relabel-only — the number stays the same,
 * only the unit string changes. Designers expect this: switching `16px`
 * to `vw` shouldn't suddenly compute "16% of viewport"; it should reset
 * the user's intent to "16vw" so they can keep typing.
 */
function convertUnit(num: number, from: string, to: string): number {
    if (from === to) return num;
    if (from === 'px' && to === 'rem') return num / REM_PX;
    if (from === 'rem' && to === 'px') return num * REM_PX;
    return num;
}

export function IconNumberInput({
    glyph,
    value,
    onCommit,
    units = DEFAULT_UNITS,
    keywords = [],
    defaultUnit = 'px',
    allowKeywords = true,
    placeholder,
    mixed,
    'aria-label': ariaLabel,
    className,
    hidePill = false,
}: IconNumberInputProps) {
    const t = useTranslations('editor.stylePanel.controls.numberInput');
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // Parse the incoming value into structured parts that drive the
    // separate input + pill displays.
    const parsedValue = React.useMemo(() => parse(value), [value]);

    // Three pieces of state:
    //   - `numDraft`   — what the user sees in the input box (always
    //                    JUST the numeric portion as a string, no unit).
    //   - `unit`       — the current unit string (drives the pill).
    //   - `keyword`    — the current keyword (e.g. `'auto'`). When set,
    //                    the input is hidden and the pill shows the keyword.
    const [numDraft, setNumDraft] = React.useState<string>(() =>
        parsedValue.num === null ? '' : trim(parsedValue.num),
    );
    const [unit, setUnit] = React.useState<string>(() => parsedValue.unit || defaultUnit);
    const [keyword, setKeyword] = React.useState<string | null>(() => parsedValue.keyword);

    // Sync local state from the incoming value when it changes externally
    // (selection change, raw CSS edit, undo). Skip the sync while the
    // input has focus — never stomp on what the user is actively typing.
    React.useEffect(() => {
        if (document.activeElement === inputRef.current) return;
        setNumDraft(parsedValue.num === null ? '' : trim(parsedValue.num));
        setUnit(parsedValue.unit || defaultUnit);
        setKeyword(parsedValue.keyword);
    }, [parsedValue, defaultUnit]);

    /**
     * Commit the current state back to the parent.
     *
     * Source of truth is `keyword` when non-null; otherwise we re-format
     * from `numDraft` + `unit`. Empty input commits empty string.
     */
    const commit = React.useCallback(
        (overrides?: { num?: number; unit?: string; keyword?: string | null }) => {
            const effKeyword =
                overrides && Object.hasOwn(overrides, 'keyword')
                    ? (overrides.keyword ?? null)
                    : keyword;
            if (effKeyword !== null) {
                if (!allowKeywords) return;
                if (effKeyword !== value) onCommit(effKeyword);
                return;
            }
            let effNum: number | null = null;
            if (overrides && Object.hasOwn(overrides, 'num')) {
                effNum = overrides.num ?? null;
            } else if (numDraft.trim() !== '') {
                const p = parse(numDraft);
                effNum = p.num;
                // Also accept a unit typed inline ("14px") even though the
                // displayed input is unit-stripped. parse() returns the
                // typed unit; if present, prefer it over current state.
                if (p.unit) {
                    overrides = { ...(overrides ?? {}), unit: p.unit };
                }
            }
            const effUnit = overrides?.unit ?? unit ?? defaultUnit;
            const next = effNum === null ? '' : `${trim(effNum)}${effUnit}`;
            if (next !== value) onCommit(next);
        },
        [allowKeywords, defaultUnit, keyword, numDraft, onCommit, unit, value],
    );

    const handleInputChange = React.useCallback((raw: string) => {
        // If the user types a unit inline ("14px"), strip the unit
        // from the input and shift it onto the pill immediately.
        const p = parse(raw);
        if (p.keyword !== null) {
            setKeyword(p.keyword);
            setNumDraft('');
            return;
        }
        if (p.unit) {
            setKeyword(null);
            setUnit(p.unit);
            setNumDraft(p.num === null ? '' : trim(p.num));
            return;
        }
        setKeyword(null);
        setNumDraft(raw);
    }, []);

    const nudge = React.useCallback(
        (delta: number) => {
            if (keyword !== null) return;
            const p = parse(numDraft);
            if (p.num === null) return;
            const next = Number.parseFloat((p.num + delta).toFixed(4));
            setNumDraft(trim(next));
            commit({ num: next });
        },
        [commit, keyword, numDraft],
    );

    const handleKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
        (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commit();
                event.currentTarget.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                setNumDraft(parsedValue.num === null ? '' : trim(parsedValue.num));
                setUnit(parsedValue.unit || defaultUnit);
                setKeyword(parsedValue.keyword);
                event.currentTarget.blur();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                nudge(event.shiftKey ? 10 : 1);
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                nudge(event.shiftKey ? -10 : -1);
            }
        },
        [commit, defaultUnit, nudge, parsedValue],
    );

    /**
     * Handle a click on a unit/keyword in the pill popover.
     *
     * Keyword pick → commit keyword verbatim.
     * Unit pick    → convert the current numeric value into the new unit
     *                (px ↔ rem multiplies by 16; everything else relabels
     *                only) and commit. If there's no numeric value yet,
     *                just update the unit state and focus the input.
     */
    const handlePillPick = React.useCallback(
        (picked: string) => {
            if (keywords.includes(picked)) {
                setKeyword(picked);
                setNumDraft('');
                commit({ keyword: picked });
                return;
            }
            const fromUnit = unit;
            setKeyword(null);
            setUnit(picked);
            const p = parse(numDraft);
            if (p.num === null) {
                inputRef.current?.focus();
                return;
            }
            const converted = convertUnit(p.num, fromUnit, picked);
            const rounded = Number.parseFloat(converted.toFixed(4));
            setNumDraft(trim(rounded));
            commit({ num: rounded, unit: picked, keyword: null });
        },
        [commit, keywords, numDraft, unit],
    );

    const pillOptions = React.useMemo(() => [...units, ...keywords], [units, keywords]);
    const showPill = !hidePill && pillOptions.length > 0;
    const pillLabel = keyword ?? unit ?? '—';
    const activePillValue = keyword ?? unit;

    return (
        <div className={cn(FIELD_BASE_CLASSES, 'flex min-w-0 items-center gap-1.5', className)}>
            {glyph !== undefined && glyph !== null && (
                <span
                    className="text-foreground-tertiary inline-flex h-4 w-[13px] shrink-0 items-center justify-center text-[11px] leading-none font-medium [&_svg]:h-[13px] [&_svg]:w-[13px]"
                    aria-hidden
                >
                    {glyph}
                </span>
            )}
            {keyword !== null ? (
                // Keyword mode: render the keyword as a clickable text — clicking
                // clears the keyword and returns to numeric mode.
                <button
                    type="button"
                    onClick={() => {
                        setKeyword(null);
                        setNumDraft('');
                        // re-focus input for immediate typing
                        window.setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="text-foreground-primary text-mini min-w-0 flex-1 cursor-text bg-transparent text-left capitalize outline-none"
                >
                    {keyword}
                </button>
            ) : (
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    spellCheck={false}
                    value={numDraft}
                    placeholder={mixed ? t('mixed') : placeholder}
                    aria-label={ariaLabel}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => commit()}
                    className={cn(
                        'text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 cursor-text bg-transparent tabular-nums outline-none',
                        mixed && 'placeholder:text-foreground-tertiary/70 placeholder:italic',
                    )}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                />
            )}
            {showPill && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={cn(UNIT_PILL_CLASSES, 'shrink-0')}
                            aria-label={t('changeUnit')}
                            title={t('changeUnit')}
                        >
                            <span>{pillLabel}</span>
                            <ChevronDown className="size-2.5" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[112px] rounded-[10px] p-1">
                        <div className="flex flex-col">
                            {pillOptions.map((opt) => (
                                <button
                                    key={opt || '__unitless__'}
                                    type="button"
                                    onClick={() => handlePillPick(opt)}
                                    className={cn(
                                        'hover:bg-accent focus-visible:ring-foreground-brand/30 cursor-pointer rounded-[6px] px-2 py-1 text-left text-xs outline-none focus-visible:ring-[3px]',
                                        opt === activePillValue &&
                                            'bg-accent text-accent-foreground',
                                        keywords.includes(opt) && 'capitalize',
                                    )}
                                >
                                    {opt || '—'}
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
