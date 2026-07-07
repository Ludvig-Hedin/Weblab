'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES, UNIT_PILL_CLASSES } from './constants';

const NUMERIC_UNITS = ['px', '%', 'rem', 'em', 'vh', 'vw'] as const;

export interface ModeNumberCellProps {
    /** Leading axis glyph (W / H or icon node). */
    glyph: React.ReactNode;
    /** Current full value, e.g. `"132px"`, `"hug"`, `"auto"`. */
    value: string;
    /** Commit handler. */
    onCommit: (value: string) => void;
    /** Mode keywords offered (e.g. ['auto', 'hug', 'fit', 'fill']). */
    keywords?: readonly string[];
    /** Numeric units offered. Defaults to px/%/rem/em/vh/vw. */
    units?: readonly string[];
    /** Default unit when the user types a bare number. */
    defaultUnit?: string;
    /** Aria label for the input. */
    ariaLabel?: string;
    /** When true, multiple selected elements have different values. Shows italic "Mixed" placeholder. */
    mixed?: boolean;
    className?: string;
}

interface Parsed {
    num: number | null;
    unit: string;
    keyword: string | null;
}

function parse(input: string): Parsed {
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

function format(p: Parsed, defaultUnit: string): string {
    if (p.keyword !== null) return p.keyword;
    if (p.num === null) return '';
    return `${p.num}${p.unit || defaultUnit}`;
}

const KEYWORD_TO_CSS: Record<string, string> = {
    hug: 'fit-content',
    fit: 'fit-content',
    fill: '100%',
};

const CSS_TO_KEYWORD: Record<string, string> = {
    'fit-content': 'hug',
    '100%': 'fill',
};

/**
 * v4 Size cell — axis-glyph + value + mode pill on the right.
 *
 * The mode pill lists numeric units (px / % / rem / em / vh / vw) AND
 * keyword modes (auto / hug / fit / fill) in a single popover.
 *
 * Keyword → CSS write mapping:
 *   - `hug` / `fit` → `fit-content`
 *   - `fill`        → `100%`
 *   - `auto`        → `auto`
 *
 * When the *value* arrives as a CSS keyword (`fit-content`, `100%`,
 * `auto`), the cell renders the friendly keyword in the value area.
 */
export function ModeNumberCell({
    glyph,
    value,
    onCommit,
    keywords = ['auto'],
    units = NUMERIC_UNITS,
    defaultUnit = 'px',
    ariaLabel,
    mixed,
    className,
}: ModeNumberCellProps) {
    const t = useTranslations('editor.stylePanel.controls.numberInput');
    const [draft, setDraft] = React.useState(value);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // The sync effect below skips updating the draft while focused, so a
    // blur/Enter after an external value change (undo, selection change) must
    // NOT commit the now-stale draft and clobber it. Track real user edits.
    const userTouchedRef = React.useRef(false);

    React.useEffect(() => {
        if (document.activeElement !== inputRef.current) setDraft(value);
    }, [value]);

    const friendly = CSS_TO_KEYWORD[draft.trim()] ?? draft;
    const parsed = parse(friendly);

    const commit = React.useCallback(
        (raw: string) => {
            const parsedRaw = parse(raw);
            let next = format(parsedRaw, defaultUnit);
            const mapped = KEYWORD_TO_CSS[next];
            if (mapped) next = mapped;
            setDraft(next);
            if (next !== value) onCommit(next);
        },
        [defaultUnit, onCommit, value],
    );

    const setMode = React.useCallback(
        (mode: string) => {
            if (keywords.includes(mode)) {
                const mapped = KEYWORD_TO_CSS[mode] ?? mode;
                setDraft(mapped);
                if (mapped !== value) onCommit(mapped);
                return;
            }
            const p = parse(friendly);
            if (p.num === null) {
                inputRef.current?.focus();
                return;
            }
            // Convert numeric value when swapping between px ↔ rem; all
            // other unit changes are relabel-only.
            const REM_PX = 16;
            let nextNum = p.num;
            const fromUnit = p.unit || defaultUnit;
            if (fromUnit === 'px' && mode === 'rem') nextNum = p.num / REM_PX;
            else if (fromUnit === 'rem' && mode === 'px') nextNum = p.num * REM_PX;
            nextNum = Number.parseFloat(nextNum.toFixed(4));
            const next = format({ num: nextNum, unit: mode, keyword: null }, defaultUnit);
            setDraft(next);
            if (next !== value) onCommit(next);
        },
        [defaultUnit, friendly, keywords, onCommit, value],
    );

    const handleKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
        (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (userTouchedRef.current) {
                    commit(event.currentTarget.value);
                    userTouchedRef.current = false;
                }
                event.currentTarget.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                userTouchedRef.current = false;
                setDraft(value);
                event.currentTarget.blur();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                const p = parse(friendly);
                if (p.num === null) return;
                event.preventDefault();
                const delta = (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1);
                const next = format(
                    {
                        num: Number.parseFloat((p.num + delta).toFixed(4)),
                        unit: p.unit || defaultUnit,
                        keyword: null,
                    },
                    defaultUnit,
                );
                userTouchedRef.current = true;
                setDraft(next);
                onCommit(next);
            }
        },
        [commit, defaultUnit, friendly, onCommit, value],
    );

    const isKeyword = parsed.keyword !== null;
    const modePillLabel = isKeyword ? parsed.keyword! : parsed.unit || defaultUnit;
    // Controlled so a unit/keyword pick closes the popover (uncontrolled
    // Radix popovers stay open on option click).
    const [pillOpen, setPillOpen] = React.useState(false);

    return (
        <div
            className={cn(FIELD_BASE_CLASSES, 'grid min-w-0 items-center gap-0 px-0', className)}
            style={{ gridTemplateColumns: '30px 1fr auto' }}
        >
            <span
                className="text-foreground-tertiary border-foreground/[0.04] inline-flex h-full items-center justify-center border-r text-[12px] font-medium [&_svg]:h-[14px] [&_svg]:w-[14px]"
                aria-hidden
            >
                {glyph}
            </span>
            {isKeyword ? (
                <button
                    type="button"
                    onClick={() => {
                        // Tap the keyword display to fall back to numeric mode.
                        setDraft('');
                        inputRef.current?.focus();
                    }}
                    className="text-foreground-primary text-mini flex h-full min-w-0 cursor-text items-center bg-transparent px-[10px] capitalize outline-none"
                >
                    {parsed.keyword}
                </button>
            ) : (
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    spellCheck={false}
                    value={isKeyword ? '' : draft}
                    placeholder={mixed ? t('mixed') : undefined}
                    aria-label={ariaLabel}
                    onChange={(e) => {
                        userTouchedRef.current = true;
                        setDraft(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        userTouchedRef.current = false;
                    }}
                    onBlur={(e) => {
                        // Skip the commit when focus is lost without a user edit —
                        // the draft may be stale vs. an external value change the
                        // focus-guarded sync effect intentionally skipped.
                        if (!userTouchedRef.current) return;
                        userTouchedRef.current = false;
                        commit(e.currentTarget.value);
                    }}
                    className={cn(
                        'text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 cursor-text bg-transparent px-[10px] tabular-nums outline-none',
                        mixed && 'placeholder:text-foreground-tertiary/70 placeholder:italic',
                    )}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                />
            )}
            <Popover open={pillOpen} onOpenChange={setPillOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={cn(UNIT_PILL_CLASSES, 'mr-1 shrink-0')}
                        aria-label={t('changeMode')}
                        title={t('changeMode')}
                    >
                        {modePillLabel}
                        <ChevronDown className="size-2.5" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[128px] rounded-[10px] p-1">
                    <div className="flex flex-col">
                        {units.map((u) => (
                            <button
                                key={u}
                                type="button"
                                onClick={() => {
                                    setMode(u);
                                    setPillOpen(false);
                                }}
                                className={cn(
                                    'hover:bg-accent focus-visible:ring-foreground-brand/30 cursor-pointer rounded-[6px] px-2 py-1 text-left text-xs outline-none focus-visible:ring-[3px]',
                                    !isKeyword &&
                                        parsed.unit === u &&
                                        'bg-accent text-accent-foreground',
                                )}
                            >
                                {u}
                            </button>
                        ))}
                        {keywords.length > 0 && (
                            <div className="bg-foreground/[0.06] my-1 h-[1px]" />
                        )}
                        {keywords.map((k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => {
                                    setMode(k);
                                    setPillOpen(false);
                                }}
                                className={cn(
                                    'hover:bg-accent focus-visible:ring-foreground-brand/30 cursor-pointer rounded-[6px] px-2 py-1 text-left text-xs capitalize outline-none focus-visible:ring-[3px]',
                                    isKeyword &&
                                        parsed.keyword === k &&
                                        'bg-accent text-accent-foreground',
                                )}
                            >
                                {k}
                            </button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
