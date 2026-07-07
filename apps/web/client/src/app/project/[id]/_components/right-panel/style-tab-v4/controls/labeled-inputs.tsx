'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { cn } from '@weblab/ui/utils';

import {
    FIELD_BASE_CLASSES,
    INLINE_LABEL_CLASSES,
    SELECT_TRIGGER_FIELD_OVERRIDES,
    UNIT_PILL_CLASSES,
} from './constants';

interface LabelInlineProps {
    children: React.ReactNode;
}
/**
 * Inline label with a fixed minimum width — keeps the value column aligned
 * across paired rows (e.g. `Min W` + `Min H`, `Max W` + `Max H`) so each
 * column's values left-align under each other regardless of label length.
 */
function LabelInline({ children }: LabelInlineProps) {
    return (
        <span className={`${INLINE_LABEL_CLASSES} inline-block min-w-[38px] shrink-0`}>
            {children}
        </span>
    );
}

export interface LabeledNumberInputProps {
    label: string;
    value: string;
    onCommit: (value: string) => void;
    placeholder?: string;
    /** When true, multiple selected elements have different values. Shows italic "Mixed" placeholder. */
    mixed?: boolean;
    unit?: string;
    /** Optional units the unit-pill cycles between (when more than one). */
    units?: readonly string[];
    /** Optional keywords like `auto`, `infinity`. */
    keywords?: readonly string[];
    defaultUnit?: string;
    className?: string;
    'aria-label'?: string;
}

interface ParsedValue {
    num: number | null;
    unit: string;
    keyword: string | null;
}

function parse(input: string): ParsedValue {
    const trimmed = input.trim();
    if (trimmed === '') return { num: null, unit: '', keyword: null };
    const match = /^([-+]?[0-9]*\.?[0-9]+)([a-zA-Z%]*)$/.exec(trimmed);
    if (!match) return { num: null, unit: '', keyword: trimmed };
    return {
        num: Number.parseFloat(match[1] ?? '0'),
        unit: match[2] ?? '',
        keyword: null,
    };
}

/** Trim trailing zeros from a numeric value for display. */
function trim(num: number): string {
    if (!Number.isFinite(num)) return '0';
    if (Number.isInteger(num)) return String(num);
    return Number.parseFloat(num.toFixed(4)).toString();
}

function format({ num, unit, keyword }: ParsedValue, defaultUnit: string): string {
    if (keyword !== null) return keyword;
    if (num === null) return '';
    return `${num}${unit || defaultUnit}`;
}

/**
 * Variant of IconNumberInput where the leading slot is a text label
 * instead of an icon (e.g. `Min W`, `Grow`, `Weight`). Used by Size /
 * Behavior / inline labeled pairs.
 */
export function LabeledNumberInput({
    label,
    value,
    onCommit,
    placeholder,
    mixed,
    unit: _unit,
    units: _units,
    keywords: _keywords = [],
    defaultUnit = '',
    className,
    'aria-label': ariaLabel,
}: LabeledNumberInputProps) {
    const t = useTranslations('editor.stylePanel.controls.numberInput');
    const [draft, setDraft] = React.useState(value);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // Mirrors NumberField: skip the blur commit when Escape/Enter already
    // handled the keystroke, so Escape cancels without the synchronous blur
    // re-committing the stale draft (and Enter doesn't double-commit).
    const skipBlurCommitRef = React.useRef(false);
    // True once the user has typed/nudged in this focus session — a blur
    // without a real edit must not commit a draft made stale by an external
    // value change (undo, selection change).
    const userTouchedRef = React.useRef(false);

    React.useEffect(() => {
        if (document.activeElement !== inputRef.current) setDraft(value);
    }, [value]);

    const commit = React.useCallback(
        (raw: string) => {
            const parsed = parse(raw);
            const next = format(parsed, defaultUnit);
            setDraft(next);
            if (next !== value) onCommit(next);
        },
        [defaultUnit, onCommit, value],
    );

    const nudge = React.useCallback(
        (delta: number) => {
            const parsed = parse(draft);
            if (parsed.num === null) return;
            userTouchedRef.current = true;
            const next = format(
                {
                    num: Number.parseFloat((parsed.num + delta).toFixed(4)),
                    unit: parsed.unit || defaultUnit,
                    keyword: null,
                },
                defaultUnit,
            );
            setDraft(next);
            onCommit(next);
        },
        [defaultUnit, draft, onCommit],
    );

    const handleKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
        (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commit(event.currentTarget.value);
                skipBlurCommitRef.current = true;
                userTouchedRef.current = false;
                event.currentTarget.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(value);
                skipBlurCommitRef.current = true;
                userTouchedRef.current = false;
                event.currentTarget.blur();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                nudge(event.shiftKey ? 10 : 1);
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                nudge(event.shiftKey ? -10 : -1);
            }
        },
        [commit, nudge, value],
    );

    const parsed = parse(draft);
    const isKeyword = parsed.keyword !== null;
    // Show the unit only when there's a numeric value. For pure keyword
    // values (e.g. `none`, `auto`) the unit slot is empty so the row
    // doesn't render "none none".
    const unitLabel = isKeyword ? '' : parsed.unit || defaultUnit || '';
    // Strip the unit from the displayed input when value is numeric — the
    // numeric portion lives in the input, the unit lives in the suffix.
    const displayValue = isKeyword
        ? parsed.keyword!
        : parsed.num === null
          ? draft
          : trim(parsed.num);

    return (
        <div className={cn(FIELD_BASE_CLASSES, 'flex min-w-0 items-center gap-2', className)}>
            <LabelInline>{label}</LabelInline>
            <input
                ref={inputRef}
                type="text"
                inputMode={isKeyword ? 'text' : 'decimal'}
                spellCheck={false}
                value={displayValue}
                placeholder={mixed ? t('mixed') : placeholder}
                aria-label={ariaLabel ?? label}
                onFocus={() => {
                    userTouchedRef.current = false;
                }}
                onChange={(e) => {
                    userTouchedRef.current = true;
                    setDraft(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                onBlur={(e) => {
                    if (skipBlurCommitRef.current) {
                        skipBlurCommitRef.current = false;
                        userTouchedRef.current = false;
                        return;
                    }
                    // No user input/nudge during this focus session — don't
                    // commit a stale draft over an external value change.
                    if (!userTouchedRef.current) {
                        if (draft !== value) setDraft(value);
                        return;
                    }
                    userTouchedRef.current = false;
                    commit(e.currentTarget.value);
                }}
                className={cn(
                    'text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 cursor-text bg-transparent text-left tabular-nums outline-none',
                    mixed && 'placeholder:text-foreground-tertiary/70 placeholder:italic',
                )}
                style={{ fontVariantNumeric: 'tabular-nums' }}
            />
            {unitLabel && (
                <span
                    className="text-muted-foreground text-[11px] tabular-nums select-none"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                    {unitLabel}
                </span>
            )}
        </div>
    );
}

export interface LabeledSelectInputProps {
    label: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onCommit: (value: string) => void;
    /** When true, multiple selected elements have different values. Shows italic "Mixed" text. */
    mixed?: boolean;
    className?: string;
}

/**
 * Variant of select trigger with an inline left label (e.g. `Weight`,
 * `Case`, `Overflow`). Renders the value right-aligned, chevron last.
 */
export function LabeledSelectInput({
    label,
    value,
    options,
    onCommit,
    mixed,
    className,
}: LabeledSelectInputProps) {
    const t = useTranslations('editor.stylePanel.controls.numberInput');
    return (
        <Select value={mixed ? undefined : value || undefined} onValueChange={onCommit}>
            <SelectTrigger
                className={cn(
                    FIELD_BASE_CLASSES,
                    SELECT_TRIGGER_FIELD_OVERRIDES,
                    'flex min-w-0 items-center justify-between gap-2 [&>span]:line-clamp-1',
                    className,
                )}
            >
                <LabelInline>{label}</LabelInline>
                <span
                    className={cn(
                        'text-mini ml-auto truncate',
                        mixed ? 'text-foreground-tertiary italic' : 'text-foreground-primary',
                    )}
                >
                    {mixed ? t('mixed') : <SelectValue placeholder="—" />}
                </span>
            </SelectTrigger>
            <SelectContent className="max-w-[280px]">
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-mini">
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export interface LabeledTextInputProps {
    label?: string;
    glyph?: React.ReactNode;
    value: string;
    onCommit: (value: string) => void;
    placeholder?: string;
    /** When true, multiple selected elements have different values. Shows italic "Mixed" placeholder. */
    mixed?: boolean;
    mono?: boolean;
    className?: string;
    'aria-label'?: string;
}

/**
 * Variant of text input. Use `label` for an inline left label
 * (`Min W`-style) or `glyph` for an icon prefix (`#` for ID, `</>` for
 * tag). `mono` switches the value to monospace (good for tags / IDs).
 */
export function LabeledTextInput({
    label,
    glyph,
    value,
    onCommit,
    placeholder,
    mixed,
    mono,
    className,
    'aria-label': ariaLabel,
}: LabeledTextInputProps) {
    const t = useTranslations('editor.stylePanel.controls.numberInput');
    const [draft, setDraft] = React.useState(value);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // Mirrors NumberField: Enter/Escape already handled the commit/revert, so
    // the synchronous blur that follows must not re-commit the stale draft.
    const skipBlurCommitRef = React.useRef(false);
    // Only commit on blur when the user actually typed in this focus session.
    const userTouchedRef = React.useRef(false);

    React.useEffect(() => {
        if (document.activeElement !== inputRef.current) setDraft(value);
    }, [value]);

    return (
        <div className={cn(FIELD_BASE_CLASSES, 'flex min-w-0 items-center gap-2', className)}>
            {glyph !== undefined && glyph !== null && (
                <span
                    className="text-foreground-tertiary inline-flex h-4 w-[14px] shrink-0 items-center justify-center text-[12px] leading-none font-medium [&_svg]:h-[14px] [&_svg]:w-[14px]"
                    aria-hidden
                >
                    {glyph}
                </span>
            )}
            {label && <LabelInline>{label}</LabelInline>}
            <input
                ref={inputRef}
                type="text"
                spellCheck={false}
                value={draft}
                placeholder={mixed ? t('mixed') : placeholder}
                aria-label={ariaLabel ?? label}
                onFocus={() => {
                    userTouchedRef.current = false;
                }}
                onChange={(e) => {
                    userTouchedRef.current = true;
                    setDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (draft !== value) onCommit(draft);
                        skipBlurCommitRef.current = true;
                        userTouchedRef.current = false;
                        e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setDraft(value);
                        skipBlurCommitRef.current = true;
                        userTouchedRef.current = false;
                        e.currentTarget.blur();
                    }
                }}
                onBlur={() => {
                    if (skipBlurCommitRef.current) {
                        skipBlurCommitRef.current = false;
                        userTouchedRef.current = false;
                        return;
                    }
                    if (!userTouchedRef.current) {
                        if (draft !== value) setDraft(value);
                        return;
                    }
                    userTouchedRef.current = false;
                    if (draft !== value) onCommit(draft);
                }}
                className={cn(
                    'text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 cursor-text bg-transparent outline-none',
                    mono && 'font-mono text-[12px]',
                    mixed && 'placeholder:text-foreground-tertiary/70 placeholder:italic',
                )}
            />
        </div>
    );
}

/** Standalone chevron-down for use inside custom trigger rows. */
export function ChevronDownSm() {
    return <ChevronDown className="text-foreground-tertiary size-3 shrink-0" />;
}

/** Inline unit-display only — used by ModeNumberCell-like fields. */
export function UnitText({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="text-muted-foreground shrink-0 text-[11px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
        >
            {children}
        </span>
    );
}

/** A small clickable unit pill (used standalone outside IconNumberInput). */
export function UnitPill({
    children,
    onClick,
}: {
    children: React.ReactNode;
    onClick?: () => void;
}) {
    return (
        <button type="button" onClick={onClick} className={cn(UNIT_PILL_CLASSES, 'shrink-0')}>
            {children}
        </button>
    );
}
