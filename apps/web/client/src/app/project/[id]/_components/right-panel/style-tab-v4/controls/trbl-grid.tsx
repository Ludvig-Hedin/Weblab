'use client';

import { useEffect, useRef, useState } from 'react';
import { Square, SquareDashed } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { cn } from '@weblab/ui/utils';

import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { FIELD_BASE_CLASSES } from './constants';
import { NumberField } from './number-field';

/**
 * One per-side input box — each carries its own `FIELD_BASE_CLASSES` border +
 * background so it reads as a discrete field (the old single connected pill
 * read as "one big rectangle"). Holds a local draft so typing isn't stomped
 * by external value syncs; commits on blur and Enter, reverts on Escape.
 *
 * `min-w-0 flex-1` lets the four boxes shrink equally so the row never
 * overflows the panel even at the ~280px minimum width.
 */
/**
 * Coerce a per-side value on commit. A bare number gets `px` appended (a
 * unitless `16` is invalid CSS for padding/margin/offsets); keywords like
 * `auto` and already-united values (`16px`, `1rem`, `50%`) pass through
 * untouched. Empty stays empty (a reset).
 */
function coerceSideValue(raw: string): string {
    const next = raw.trim();
    if (next === '') return '';
    return /^[-+]?[0-9]*\.?[0-9]+$/.test(next) ? `${next}px` : next;
}

function SideField({
    value,
    onCommit,
    ariaLabel,
}: {
    value: string;
    onCommit: (value: string) => void;
    ariaLabel: string;
}) {
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement | null>(null);
    // Mirrors TextField/NumberField: Escape/Enter skip the synchronous blur
    // commit; blur only commits when the user actually typed this focus
    // session — so Escape cancels cleanly and an untouched field never stomps
    // an external value change.
    const skipBlurCommitRef = useRef(false);
    const userTouchedRef = useRef(false);

    useEffect(() => {
        if (document.activeElement !== inputRef.current) setDraft(value);
    }, [value]);

    const commit = (raw: string) => {
        const next = coerceSideValue(raw);
        setDraft(next);
        if (next !== value) onCommit(next);
    };

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            spellCheck={false}
            value={draft}
            aria-label={ariaLabel}
            onFocus={() => {
                userTouchedRef.current = false;
            }}
            onChange={(event) => {
                userTouchedRef.current = true;
                setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
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
                }
            }}
            onBlur={(event) => {
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
                commit(event.currentTarget.value);
            }}
            className={cn(
                FIELD_BASE_CLASSES,
                // Override the shared field's px-[10px] — at four-up the boxes
                // are narrow, so tight horizontal padding keeps 2–3 digits
                // readable. `min-w-0 flex-1` makes the row shrink-safe.
                'min-w-0 flex-1 cursor-text px-1 text-center',
            )}
        />
    );
}

export interface TrblGridProps {
    /** Property prefix — e.g. `padding` for `padding-top/right/bottom/left`. */
    prefix: string;
    /**
     * For shorthand-only CSS like Position offsets the prefix is empty and the
     * 4 inputs map directly to `top`/`right`/`bottom`/`left`. Pass true here
     * and the grid composes property names without a hyphen.
     */
    shorthand?: boolean;
    /** Allow keywords (auto, none) inside the per-side inputs. */
    allowKeywords?: boolean;
    /** Hide the unit pill on per-side inputs (default true — saves panel width). */
    suppressUnitPill?: boolean;
    className?: string;
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SIDE_LABEL = { top: 'T', right: 'R', bottom: 'B', left: 'L' } as const;

/**
 * TRBL editor — used for Position offsets, Padding and Margin. Matches the
 * Figma padding control: a wide value box plus a 2-button mode switcher
 * (all-sides vs per-side). In per-side mode four discrete input boxes drop
 * below, each its own bordered field, with T/R/B/L labels centered beneath.
 *
 * Auto-unlinks the first time any side diverges, then sticks with the user's
 * intent. Composes `useStyleValue` + `useStyleSetter` directly rather than
 * going through `PropertyControl` because the row spans four properties —
 * having one shared row label + linked-mode behavior is cleaner outside the
 * per-prop wrapper.
 */
export const TrblGrid = observer(function TrblGrid({
    prefix,
    shorthand,
    allowKeywords,
    suppressUnitPill = true,
    className,
}: TrblGridProps) {
    const propertyFor = (side: (typeof SIDES)[number]) =>
        prefix === '' || shorthand ? side : `${prefix}-${side}`;

    const top = useStyleValue(propertyFor('top'));
    const right = useStyleValue(propertyFor('right'));
    const bottom = useStyleValue(propertyFor('bottom'));
    const left = useStyleValue(propertyFor('left'));

    const topSetter = useStyleSetter(propertyFor('top'));
    const rightSetter = useStyleSetter(propertyFor('right'));
    const bottomSetter = useStyleSetter(propertyFor('bottom'));
    const leftSetter = useStyleSetter(propertyFor('left'));
    const { setMultiple } = useStyleBatchSetter();

    const allEqual =
        top.value === right.value && right.value === bottom.value && bottom.value === left.value;

    const anySet = top.isSet || right.isSet || bottom.isSet || left.isSet;
    const linkedValue = allEqual ? top.value : '';

    // Once values diverge, auto-unlink. After the user explicitly relinks,
    // don't pop back open just because a stale divergent value re-arrives.
    const [linked, setLinked] = useState(() => allEqual || !anySet);
    const prevDivergentRef = useRef(anySet && !allEqual);
    useEffect(() => {
        const divergent = anySet && !allEqual;
        if (divergent && !prevDivergentRef.current) setLinked(false);
        prevDivergentRef.current = divergent;
    }, [anySet, allEqual]);

    // All four sides in one history entry — a single Cmd+Z reverts the whole
    // "set padding" gesture instead of one side at a time.
    const setAll = (value: string) => {
        setMultiple([
            { property: propertyFor('top'), value },
            { property: propertyFor('right'), value },
            { property: propertyFor('bottom'), value },
            { property: propertyFor('left'), value },
        ]);
    };

    const sideValue = { top, right, bottom, left };
    const sideSetter = {
        top: topSetter,
        right: rightSetter,
        bottom: bottomSetter,
        left: leftSetter,
    };

    const labelPrefix = prefix === '' ? 'offset' : prefix;

    return (
        <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
            <div className="flex min-w-0 items-center gap-1.5">
                <NumberField
                    value={linkedValue}
                    placeholder={!allEqual ? 'Mixed' : undefined}
                    allowKeywords={allowKeywords}
                    onCommit={setAll}
                    units={suppressUnitPill ? [] : undefined}
                    className="flex-1"
                    aria-label={`${labelPrefix} all sides`}
                />
                {/* 2-button mode switcher — all-sides vs per-side. */}
                <div className="bg-background-secondary flex h-[28px] shrink-0 items-center gap-0.5 rounded-[10px] border border-transparent p-0.5">
                    <button
                        type="button"
                        onClick={() => setLinked(true)}
                        aria-label="Edit all sides together"
                        aria-pressed={linked}
                        title="All sides"
                        className={cn(
                            'flex h-full w-6 cursor-pointer items-center justify-center rounded-[6px] transition-colors',
                            linked
                                ? 'bg-foreground-brand/15 text-foreground-brand'
                                : 'text-foreground-secondary hover:text-foreground-primary hover:bg-foreground/5',
                        )}
                    >
                        <Square className="size-3" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setLinked(false)}
                        aria-label="Edit each side individually"
                        aria-pressed={!linked}
                        title="Per side"
                        className={cn(
                            'flex h-full w-6 cursor-pointer items-center justify-center rounded-[6px] transition-colors',
                            !linked
                                ? 'bg-foreground-brand/15 text-foreground-brand'
                                : 'text-foreground-secondary hover:text-foreground-primary hover:bg-foreground/5',
                        )}
                    >
                        <SquareDashed className="size-3" />
                    </button>
                </div>
            </div>
            {!linked && (
                <div className="flex min-w-0 flex-col gap-1">
                    {/* Four discrete bordered boxes — `gap-1` keeps them a
                        tidy related set without merging into one rectangle.
                        Each box is `min-w-0 flex-1`, so 4 boxes + 3 gaps
                        shrink to fit the panel at its 280px minimum width. */}
                    <div className="flex min-w-0 items-stretch gap-1">
                        {SIDES.map((side) => (
                            <SideField
                                key={side}
                                value={sideValue[side].value}
                                onCommit={(v) => sideSetter[side].set(v)}
                                ariaLabel={propertyFor(side)}
                            />
                        ))}
                    </div>
                    <div className="flex min-w-0 items-stretch gap-1">
                        {SIDES.map((side) => (
                            <span
                                key={side}
                                className="text-foreground-tertiary text-tiny min-w-0 flex-1 text-center leading-none"
                            >
                                {SIDE_LABEL[side]}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});
