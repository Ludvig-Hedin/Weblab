'use client';

import * as React from 'react';

import { cn } from '../utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const DEFAULT_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw', 'ch', 'fr'] as const;
export type CssUnit = (typeof DEFAULT_UNITS)[number] | (string & {});

export interface NumberInputProps extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type'
> {
    /** Full string value, e.g. `"16px"`, `"1.5"`, `"auto"`, `""`. */
    value: string;
    /** Called with the new full string value when the user commits. */
    onCommit: (value: string) => void;
    /** Optional list of units to show in the unit popover. */
    units?: readonly CssUnit[];
    /** Default unit to apply when the user types a bare number. */
    defaultUnit?: CssUnit;
    /** When true, allows non-numeric values like `auto`, `none`. */
    allowKeywords?: boolean;
}

interface ParsedValue {
    num: number | null;
    unit: CssUnit | '';
    keyword: string | null;
}

function parse(input: string): ParsedValue {
    const trimmed = input.trim();
    if (trimmed === '') return { num: null, unit: '', keyword: null };
    const match = /^([-+]?[0-9]*\.?[0-9]+)([a-zA-Z%]*)$/.exec(trimmed);
    if (!match) return { num: null, unit: '', keyword: trimmed };
    return {
        num: Number.parseFloat(match[1] ?? '0'),
        unit: (match[2] ?? '') as CssUnit,
        keyword: null,
    };
}

function format({ num, unit, keyword }: ParsedValue, defaultUnit: CssUnit): string {
    if (keyword !== null) return keyword;
    if (num === null) return '';
    return `${num}${unit || defaultUnit}`;
}

/**
 * A numeric input that:
 * - Accepts bare numbers (assumes `defaultUnit`).
 * - Nudges with ↑/↓ (1) and Shift+↑/↓ (10).
 * - Exposes a tiny unit picker on the right (popover) for px/rem/em/%/etc.
 * - Commits on blur and on Enter.
 * - Optionally allows keyword values (`auto`, `none`).
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
    function NumberInput(
        {
            value,
            onCommit,
            units = DEFAULT_UNITS,
            defaultUnit = 'px',
            allowKeywords = true,
            className,
            onKeyDown,
            onBlur,
            ...rest
        },
        ref,
    ) {
        const [draft, setDraft] = React.useState(value);
        const inputRef = React.useRef<HTMLInputElement | null>(null);
        const setRefs = React.useCallback(
            (node: HTMLInputElement | null) => {
                inputRef.current = node;
                if (typeof ref === 'function') ref(node);
                else if (ref) ref.current = node;
            },
            [ref],
        );

        // Sync external value when it changes from outside (e.g. element selection change).
        // Must live in an effect — never call setState during render.
        React.useEffect(() => {
            // Only update draft when the input isn't focused to avoid stomping on typing.
            if (document.activeElement !== inputRef.current) {
                setDraft(value);
            }
        }, [value]);

        const commit = React.useCallback(
            (raw: string) => {
                const parsed = parse(raw);
                if (parsed.keyword !== null && !allowKeywords) {
                    // Reject — revert to last value.
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
                const next: ParsedValue = {
                    num: Number.parseFloat((parsed.num + delta).toFixed(4)),
                    unit: parsed.unit || defaultUnit,
                    keyword: null,
                };
                const formatted = format(next, defaultUnit);
                setDraft(formatted);
                onCommit(formatted);
            },
            [defaultUnit, draft, onCommit],
        );

        const handleKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
            (event) => {
                onKeyDown?.(event);
                if (event.defaultPrevented) return;
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit(event.currentTarget.value);
                    event.currentTarget.blur();
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraft(value);
                    event.currentTarget.blur();
                    return;
                }
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    nudge(event.shiftKey ? 10 : 1);
                    return;
                }
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    nudge(event.shiftKey ? -10 : -1);
                }
            },
            [commit, nudge, onKeyDown, value],
        );

        const handleBlur = React.useCallback<React.FocusEventHandler<HTMLInputElement>>(
            (event) => {
                commit(event.currentTarget.value);
                onBlur?.(event);
            },
            [commit, onBlur],
        );

        const setUnit = React.useCallback(
            (unit: CssUnit) => {
                const parsed = parse(draft);
                if (parsed.num === null) {
                    // Nothing to attach the unit to — focus the field instead.
                    inputRef.current?.focus();
                    return;
                }
                const next = format({ num: parsed.num, unit, keyword: null }, defaultUnit);
                setDraft(next);
                onCommit(next);
            },
            [defaultUnit, draft, onCommit],
        );

        // Horizontal scrub-drag on the unit pill: 1px = 1 unit, shift = 10x.
        // Calls `onCommit` on every move so the canvas updates live as the
        // user drags. If the user just clicks without dragging, the Popover
        // still opens (drag is only registered after a 3px threshold).
        const scrubbedRef = React.useRef(false);
        const handleScrubMouseDown = React.useCallback<React.MouseEventHandler<HTMLButtonElement>>(
            (event) => {
                if (event.button !== 0) return;
                const parsed = parse(draft);
                if (parsed.num === null) return;
                event.preventDefault();
                const startX = event.clientX;
                const startNum = parsed.num;
                const unit = parsed.unit || defaultUnit;
                scrubbedRef.current = false;

                const onMove = (moveEvent: MouseEvent) => {
                    const dx = moveEvent.clientX - startX;
                    if (!scrubbedRef.current && Math.abs(dx) < 3) return;
                    scrubbedRef.current = true;
                    // 1px = 1 unit by default, 10x with shift held.
                    const next: ParsedValue = {
                        num: Number.parseFloat(
                            (startNum + dx * (moveEvent.shiftKey ? 10 : 1)).toFixed(4),
                        ),
                        unit,
                        keyword: null,
                    };
                    const formatted = format(next, defaultUnit);
                    setDraft(formatted);
                    onCommit(formatted);
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    if (scrubbedRef.current) {
                        // Swallow the synthesized click so the popover does not
                        // open right after a successful scrub.
                        const swallow = (ev: MouseEvent) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            document.removeEventListener('click', swallow, true);
                        };
                        document.addEventListener('click', swallow, true);
                    }
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            },
            [defaultUnit, draft, onCommit],
        );

        const parsedValue = parse(draft);
        const currentUnit = parsedValue.keyword !== null ? '' : parsedValue.unit || defaultUnit;

        // Shared canonical geometry literals — see
        // apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v2/controls/constants.ts.
        // We can't import from there into a UI primitive, so we hand-inline the
        // same values: h-[30px] rounded-[8px] dark:bg-[rgb(43,43,43)] etc.
        const FIELD_BOX =
            'h-[30px] rounded-[8px] border border-input bg-foreground/5 dark:bg-[rgb(43,43,43)] text-mini text-foreground-primary placeholder:text-muted-foreground hover:bg-foreground/[0.08] dark:hover:bg-[rgb(50,50,50)] focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-[3px] transition-colors';

        return (
            // Value input and unit picker render as two adjacent boxes. The
            // value field grows to fill, the unit pill is fixed-width so the
            // column stays predictable. Both share FIELD_BOX so they read as
            // siblings and stay flush with every other field in the panel.
            <div className={cn('flex w-full min-w-0 items-center gap-1', className)}>
                <div className={cn(FIELD_BOX, 'flex min-w-0 flex-1 items-center px-[10px]')}>
                    <input
                        ref={setRefs}
                        type="text"
                        inputMode="decimal"
                        spellCheck={false}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        className="text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 bg-transparent outline-none"
                        {...rest}
                    />
                </div>
                {parsedValue.keyword === null && units.length > 0 && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                tabIndex={-1}
                                onMouseDown={handleScrubMouseDown}
                                className={cn(
                                    FIELD_BOX,
                                    'text-muted-foreground hover:text-foreground-primary flex w-[52px] shrink-0 cursor-ew-resize items-center justify-center px-1 text-[11px] tracking-wider uppercase select-none',
                                )}
                                aria-label="Drag to scrub value, click to change unit"
                                title="Drag to change value · Click to change unit"
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
                                            'hover:bg-accent rounded-sm px-2 py-1 text-left text-xs',
                                            unit === currentUnit &&
                                                'bg-accent text-accent-foreground',
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
    },
);
