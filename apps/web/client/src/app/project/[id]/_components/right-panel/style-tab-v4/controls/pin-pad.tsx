'use client';

import * as React from 'react';

import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES_SM } from './constants';

type Side = 'top' | 'right' | 'bottom' | 'left';

export interface PinPadProps {
    /** Current value for each side. Empty string or `auto` = unset. */
    sides: Record<Side, string>;
    /** Called when a side input changes. */
    onCommitSide: (side: Side, value: string) => void;
    /** Called when the user clicks a center-pad zone (toggles 0 ↔ auto). */
    onTogglePin: (side: Side) => void;
    /** Called when the user clicks the center element — clears all sides. */
    onClearAll?: () => void;
    className?: string;
}

function isPinned(v: string): boolean {
    const t = v.trim();
    return t !== '' && t !== 'auto';
}

/**
 * v4 Position pin-pad (Webflow/Framer-style, super-tight variant).
 *
 * Layout:
 *
 *   - 3-column grid with 4 sides arranged around a 64×64 center pad.
 *   - Each side is a small `IconNumberInput`-style cell with a single-
 *     letter glyph (T / L / R / B) inside.
 *   - Empty cell renders `Auto` placeholder.
 *   - Pinned cell (numeric) shows a brand-blue thin bar on the pad's
 *     matching side.
 *   - Clicking a pad side toggles that side between `0` and `auto`
 *     (clears it). Focus then jumps to the matching input.
 */
export function PinPad({ sides, onCommitSide, onTogglePin, onClearAll, className }: PinPadProps) {
    const refs = {
        top: React.useRef<HTMLInputElement | null>(null),
        right: React.useRef<HTMLInputElement | null>(null),
        bottom: React.useRef<HTMLInputElement | null>(null),
        left: React.useRef<HTMLInputElement | null>(null),
    } as const;

    const handleToggle = (side: Side) => {
        onTogglePin(side);
        setTimeout(() => refs[side].current?.focus(), 0);
    };

    return (
        <div
            className={cn(
                'mx-auto grid w-full max-w-[260px] items-center justify-items-center',
                className,
            )}
            style={{
                gridTemplateColumns: '1fr 64px 1fr',
                gridTemplateRows: '24px 64px 24px',
                columnGap: 6,
                rowGap: 4,
            }}
        >
            <SideCell
                side="top"
                value={sides.top}
                inputRef={refs.top}
                onCommit={(v) => onCommitSide('top', v)}
                glyph="T"
            />

            <SideCell
                side="left"
                value={sides.left}
                inputRef={refs.left}
                onCommit={(v) => onCommitSide('left', v)}
                glyph="L"
                style={{ gridColumn: 1, gridRow: 2 }}
            />

            {/* Center pad */}
            <div
                className="bg-background-secondary relative h-[64px] w-[64px] rounded-[10px]"
                style={{ gridColumn: 2, gridRow: 2 }}
            >
                <PadZone
                    side="top"
                    active={isPinned(sides.top)}
                    onClick={() => handleToggle('top')}
                />
                <PadZone
                    side="right"
                    active={isPinned(sides.right)}
                    onClick={() => handleToggle('right')}
                />
                <PadZone
                    side="bottom"
                    active={isPinned(sides.bottom)}
                    onClick={() => handleToggle('bottom')}
                />
                <PadZone
                    side="left"
                    active={isPinned(sides.left)}
                    onClick={() => handleToggle('left')}
                />
                <button
                    type="button"
                    aria-label="Clear all sides"
                    title="Clear all sides"
                    onClick={onClearAll}
                    disabled={!onClearAll}
                    className="border-foreground-tertiary bg-foreground/[0.04] hover:bg-foreground/[0.08] focus-visible:ring-foreground-brand/40 disabled:hover:bg-foreground/[0.04] absolute top-1/2 left-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-[2px] border-[1.25px] transition-colors outline-none focus-visible:ring-2 disabled:cursor-default"
                />
            </div>

            <SideCell
                side="right"
                value={sides.right}
                inputRef={refs.right}
                onCommit={(v) => onCommitSide('right', v)}
                glyph="R"
                style={{ gridColumn: 3, gridRow: 2 }}
            />

            <SideCell
                side="bottom"
                value={sides.bottom}
                inputRef={refs.bottom}
                onCommit={(v) => onCommitSide('bottom', v)}
                glyph="B"
                style={{ gridColumn: 2, gridRow: 3 }}
            />
        </div>
    );
}

interface SideCellProps {
    side: Side;
    value: string;
    onCommit: (value: string) => void;
    glyph: string;
    inputRef: React.MutableRefObject<HTMLInputElement | null>;
    style?: React.CSSProperties;
}

function SideCell({ side, value, onCommit, glyph, inputRef, style }: SideCellProps) {
    const pinned = isPinned(value);
    const [draft, setDraft] = React.useState(value === 'auto' ? '' : value);
    React.useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setDraft(value === 'auto' ? '' : value);
        }
    }, [value, inputRef]);

    return (
        <div
            className={cn(
                FIELD_BASE_CLASSES_SM,
                'flex min-w-0 items-center gap-1.5',
                pinned && 'border-foreground-brand/40',
            )}
            style={style}
        >
            <span className="text-foreground-tertiary inline-flex w-3 shrink-0 items-center justify-center text-tiny leading-none font-medium">
                {glyph}
            </span>
            <input
                ref={inputRef}
                type="text"
                spellCheck={false}
                inputMode="decimal"
                value={draft}
                placeholder="Auto"
                aria-label={`${side} offset`}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => {
                    const next = e.currentTarget.value.trim();
                    if (next === '') {
                        // Empty means "auto". Don't clobber an already-auto /
                        // empty cell with '' when the user blurs without
                        // editing — only convert a real value to auto.
                        if (value !== 'auto' && value !== '') onCommit('auto');
                        return;
                    }
                    if (next !== value) onCommit(next);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setDraft(value === 'auto' ? '' : value);
                        (e.currentTarget as HTMLInputElement).blur();
                    }
                }}
                className="text-foreground-primary placeholder:text-muted-foreground min-w-0 flex-1 cursor-text bg-transparent text-[11.5px] tabular-nums outline-none"
                style={{ fontVariantNumeric: 'tabular-nums' }}
            />
        </div>
    );
}

interface PadZoneProps {
    side: Side;
    active: boolean;
    onClick: () => void;
}

function PadZone({ side, active, onClick }: PadZoneProps) {
    const layout: Record<Side, string> = {
        top: 'top-[5px] left-1/2 -translate-x-1/2 w-[18px] h-[1.5px]',
        bottom: 'bottom-[5px] left-1/2 -translate-x-1/2 w-[18px] h-[1.5px]',
        left: 'left-[5px] top-1/2 -translate-y-1/2 h-[18px] w-[1.5px]',
        right: 'right-[5px] top-1/2 -translate-y-1/2 h-[18px] w-[1.5px]',
    };
    const hitLayout: Record<Side, string> = {
        top: 'top-0 left-0 right-0 h-[20px]',
        bottom: 'bottom-0 left-0 right-0 h-[20px]',
        left: 'left-0 top-0 bottom-0 w-[22px]',
        right: 'right-0 top-0 bottom-0 w-[22px]',
    };
    return (
        <>
            <button
                type="button"
                aria-label={`Toggle ${side} pin`}
                onClick={onClick}
                className={cn(
                    'focus-visible:ring-foreground-brand/30 absolute cursor-pointer rounded-[3px] outline-none focus-visible:ring-2',
                    hitLayout[side],
                )}
            />
            <span
                aria-hidden
                className={cn(
                    'absolute rounded-[1.5px] transition-[opacity,background-color] duration-150',
                    layout[side],
                    active
                        ? 'bg-foreground-brand opacity-100'
                        : 'bg-foreground-tertiary opacity-30',
                )}
            />
        </>
    );
}
