'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

export interface ChipInputProps {
    /** Current chip values. */
    chips: string[];
    /** Called with the next array on add / remove. */
    onChange: (next: string[]) => void;
    /** Placeholder for the trailing free-text input. */
    placeholder?: string;
    /** Aria label for the input. */
    ariaLabel?: string;
    /** When true, disables editing (used for read-only previews). */
    readOnly?: boolean;
    className?: string;
}

/**
 * Generic chip input — used in v3 for the Element section's class list and
 * (future) named-style chips. Mirrors the keyboard model of v2's class chips
 * (Backspace at empty input deletes last; arrow keys walk chips) but the
 * markup is intentionally smaller so it can be reused for Text/Effect chips
 * with a single name+x layout.
 */
export function ChipInput({
    chips,
    onChange,
    placeholder,
    ariaLabel,
    readOnly,
    className,
}: ChipInputProps) {
    const [draft, setDraft] = useState('');
    const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        chipRefs.current.length = chips.length;
    }, [chips.length]);

    const focusChip = useCallback((index: number) => {
        chipRefs.current[index]?.focus();
    }, []);

    const focusInput = useCallback(() => {
        inputRef.current?.focus();
    }, []);

    const removeAt = useCallback(
        (index: number) => {
            const next = chips.filter((_, i) => i !== index);
            onChange(next);
            queueMicrotask(() => {
                if (next.length === 0) focusInput();
                else if (index >= next.length) focusChip(next.length - 1);
                else focusChip(index);
            });
        },
        [chips, focusChip, focusInput, onChange],
    );

    const addFromDraft = useCallback(() => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        const incoming = trimmed.split(/\s+/).filter(Boolean);
        const next = [...new Set([...chips, ...incoming])];
        onChange(next);
        setDraft('');
    }, [chips, draft, onChange]);

    return (
        // Outer chip container is presentational. Keyboard users reach the
        // chips and trailing input directly via Tab; the mouse handler exists
        // only to delegate clicks on empty container space to the trailing
        // input, which is itself fully keyboard-accessible.
        <div
            role="presentation"
            // Focus ring is keyboard-only: `has-[:focus-visible]:*` rings the
            // container only when a chip or the trailing input receives
            // keyboard focus — never on mouse-click.
            className={cn(
                'border-input bg-foreground/5 hover:bg-foreground/[0.08] has-[:focus-visible]:border-ring has-[:focus-visible]:ring-foreground-brand/30 flex min-h-[28px] min-w-0 flex-1 flex-wrap items-center gap-1 rounded-[6px] border p-1 transition-colors has-[:focus-visible]:ring-[3px] dark:bg-[rgb(43,43,43)] dark:hover:bg-[rgb(50,50,50)]',
                className,
            )}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    event.preventDefault();
                    focusInput();
                }
            }}
        >
            {chips.map((chip, index) => (
                <button
                    key={`${chip}-${index}`}
                    ref={(node) => {
                        chipRefs.current[index] = node;
                    }}
                    type="button"
                    disabled={readOnly}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft') {
                            event.preventDefault();
                            if (index > 0) focusChip(index - 1);
                        } else if (event.key === 'ArrowRight') {
                            event.preventDefault();
                            if (index < chips.length - 1) focusChip(index + 1);
                            else focusInput();
                        } else if (
                            event.key === 'Backspace' ||
                            event.key === 'Delete' ||
                            event.key === 'Enter'
                        ) {
                            event.preventDefault();
                            if (!readOnly) removeAt(index);
                        }
                    }}
                    onClick={() => focusChip(index)}
                    aria-label={`${chip}. Press Backspace to remove.`}
                    className="bg-foreground/[0.12] text-foreground-primary hover:bg-foreground/[0.18] focus-visible:ring-foreground-brand/30 text-mini inline-flex h-5 items-center gap-1 rounded-[4px] px-1.5 transition-colors outline-none focus-visible:ring-[3px]"
                >
                    <span className="max-w-[120px] truncate">{chip}</span>
                    {!readOnly && (
                        // Glyph is a mouse-only target. The parent <button>
                        // already handles keyboard removal (Backspace/Delete/
                        // Enter), so the inner ×  needs no separate keyboard
                        // path — flag as decorative.
                        <span
                            aria-hidden
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                                event.stopPropagation();
                                removeAt(index);
                            }}
                            className="text-foreground-secondary hover:text-foreground-primary cursor-pointer leading-none"
                        >
                            ×
                        </span>
                    )}
                </button>
            ))}
            {!readOnly && (
                <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    placeholder={chips.length === 0 ? placeholder : ''}
                    aria-label={ariaLabel ?? 'Add an item'}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            addFromDraft();
                        } else if (
                            event.key === 'Backspace' &&
                            draft.length === 0 &&
                            chips.length > 0
                        ) {
                            event.preventDefault();
                            removeAt(chips.length - 1);
                        } else if (
                            event.key === 'ArrowLeft' &&
                            event.currentTarget.selectionStart === 0 &&
                            chips.length > 0
                        ) {
                            event.preventDefault();
                            focusChip(chips.length - 1);
                        }
                    }}
                    onBlur={() => {
                        if (draft.trim()) addFromDraft();
                    }}
                    className="placeholder:text-muted-foreground text-mini text-foreground-primary h-5 min-w-[60px] flex-1 bg-transparent px-1 outline-none"
                />
            )}
        </div>
    );
}
