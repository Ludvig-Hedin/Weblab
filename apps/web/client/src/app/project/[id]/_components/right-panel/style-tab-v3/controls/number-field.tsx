'use client';

import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

const DEFAULT_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw'] as const;

export interface NumberFieldProps {
    /** Full string value, e.g. `"16px"`, `"1.5"`, `"auto"`, `""`. */
    value: string;
    /** Called with the new full string value when the user commits. */
    onCommit: (value: string) => void;
    /** Units offered in the unit picker. Pass `[]` to render value-box only. */
    units?: readonly string[];
    /** Unit applied when the user types a bare number. */
    defaultUnit?: string;
    /** When true, accepts non-numeric values like `auto`, `none`. */
    allowKeywords?: boolean;
    placeholder?: string;
    className?: string;
    'aria-label'?: string;
}

interface ParsedValue {
    num: number | null;
    unit: string;
    keyword: string | null;
}

/** Bare-number-or-keyword parser. Lifted from `@weblab/ui/number-input`. */
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

function format({ num, unit, keyword }: ParsedValue, defaultUnit: string): string {
    if (keyword !== null) return keyword;
    if (num === null) return '';
    return `${num}${unit || defaultUnit}`;
}

/**
 * v3 numeric field — a clean numeric input with a static unit pill.
 *
 * Deliberately drops the horizontal scrub-drag affordance the shared
 * `@weblab/ui/number-input` puts on its unit pill (`cursor-ew-resize` + a
 * mousedown scrub handler). The user disliked the scrub: here the pill is a
 * plain `cursor-pointer` button that opens a unit popover, nothing more.
 *
 * Behaviour mirrors the shared input otherwise — bare numbers assume
 * `defaultUnit`, ↑/↓ nudge by 1 (Shift = 10), commit on blur + Enter, revert
 * on Escape. Parse/format/nudge logic is reimplemented locally so v3 owns it.
 */
export function NumberField({
    value,
    onCommit,
    units = DEFAULT_UNITS,
    defaultUnit = 'px',
    allowKeywords = true,
    placeholder,
    className,
    'aria-label': ariaLabel,
}: NumberFieldProps) {
    const [draft, setDraft] = React.useState(value);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // Sync external value when it changes from outside (e.g. selection change).
    // Skip while focused so we never stomp on what the user is typing.
    React.useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setDraft(value);
        }
    }, [value]);

    const commit = React.useCallback(
        (raw: string) => {
            const parsed = parse(raw);
            if (parsed.keyword !== null && !allowKeywords) {
                setDraft(value);
                return;
            }
            const next = format(parsed, defaultUnit);
            setDraft(next);
            if (next !== value) onCommit(next);
        },
        [allowKeywords, defaultUnit, onCommit, value],
    );

    const nudge = React.useCallback(
        (delta: number) => {
            const parsed = parse(draft);
            if (parsed.num === null) return;
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
                event.currentTarget.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(value);
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

    const setUnit = React.useCallback(
        (unit: string) => {
            const parsed = parse(draft);
            if (parsed.num === null) {
                inputRef.current?.focus();
                return;
            }
            const next = format({ num: parsed.num, unit, keyword: null }, defaultUnit);
            setDraft(next);
            onCommit(next);
        },
        [defaultUnit, draft, onCommit],
    );

    const parsed = parse(draft);
    const currentUnit = parsed.keyword !== null ? '' : parsed.unit || defaultUnit;
    // Hide the pill for keyword values (auto/none) and when no units are offered.
    const showPill = parsed.keyword === null && units.length > 0;

    return (
        // Value box + unit pill render as two adjacent boxes sharing the panel's
        // canonical geometry, so they read as siblings flush with every other
        // field. The value field grows; the pill is fixed-width.
        <div className={cn('flex w-full min-w-0 items-center gap-1', className)}>
            <div className={cn(FIELD_BASE_CLASSES, 'flex min-w-0 flex-1 items-center px-[10px]')}>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    spellCheck={false}
                    value={draft}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={(e) => commit(e.currentTarget.value)}
                    // Normal text cursor — never a resize cursor on the value input.
                    className="text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 cursor-text bg-transparent outline-none"
                />
            </div>
            {showPill && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            // Keyboard-reachable: the pill is a real unit picker,
                            // so keyboard users must be able to Tab to it. Plain
                            // pointer cursor — not a scrub handle, no mousemove.
                            className={cn(
                                FIELD_BASE_CLASSES,
                                'text-muted-foreground hover:text-foreground-primary flex w-[52px] shrink-0 cursor-pointer items-center justify-center px-1 text-[11px] select-none',
                            )}
                            aria-label="Change unit"
                            title="Change unit"
                        >
                            {currentUnit || '—'}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-28 p-1">
                        <div className="flex flex-col">
                            {units.map((unit) => (
                                <button
                                    key={unit || '__unitless__'}
                                    type="button"
                                    onClick={() => setUnit(unit)}
                                    className={cn(
                                        'hover:bg-accent focus-visible:ring-foreground-brand/30 cursor-pointer rounded-sm px-2 py-1 text-left text-xs outline-none focus-visible:ring-[3px]',
                                        unit === currentUnit && 'bg-accent text-accent-foreground',
                                    )}
                                >
                                    {unit || '—'}
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
