'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

export interface ChipInputProps {
    /** Current chip values. */
    chips: string[];
    /** Called with the next array on add / remove / rename. */
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
 * v4 chip input — brand-blue chips that are ALWAYS editable in place.
 *
 * Each chip is a real `<input>`. Typing edits the chip text; the chip
 * resizes to its content. Edits commit on blur or Enter.
 *
 * Keyboard model:
 *   - Click a chip → caret lands in the chip; type to edit.
 *   - ←/→ at chip edges walks to the previous/next chip (or the
 *     trailing input past the last chip) — navigate classes as units.
 *   - Backspace removes the WHOLE class (a class is a token, not free
 *     text) when: the chip is empty, the caret is at the chip's left
 *     edge, or you're in the trailing input — one press per class.
 *     Mid-text Backspace still edits characters. Delete on an empty
 *     chip removes it too.
 *   - Enter on a chip commits and jumps to the next chip / trailing input.
 *   - Enter on the trailing input adds whatever was typed (space-split).
 *   - Escape on a chip reverts the chip text and blurs.
 *   - The trailing × on each chip also removes it via mouse.
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
    const chipInputRefs = useRef<Array<HTMLInputElement | null>>([]);
    const trailingInputRef = useRef<HTMLInputElement | null>(null);

    // Local drafts mirror the live `chips` prop but let the user edit each
    // chip in place without round-tripping every keystroke through the
    // parent. Commit on blur or Enter writes the dedup'd next list back.
    const [chipDrafts, setChipDrafts] = useState<string[]>(chips);

    // Keep local drafts in sync when `chips` changes from outside (e.g.
    // selection change, raw className edit). Avoid clobbering an active
    // focused edit.
    useEffect(() => {
        const focused = document.activeElement;
        const idx = chipInputRefs.current.findIndex((el) => el === focused);
        if (idx === -1) setChipDrafts(chips);
    }, [chips]);

    useEffect(() => {
        chipInputRefs.current.length = chips.length;
    }, [chips.length]);

    const focusChip = useCallback((index: number) => {
        const el = chipInputRefs.current[index];
        if (!el) return;
        el.focus();
        const n = el.value.length;
        el.setSelectionRange(n, n);
    }, []);

    const focusTrailing = useCallback(() => {
        trailingInputRef.current?.focus();
    }, []);

    const commitChip = useCallback(
        (index: number, raw: string) => {
            const trimmed = raw.trim();
            if (trimmed === chips[index]) return;
            const next = chips.slice();
            if (!trimmed) {
                next.splice(index, 1);
            } else {
                next[index] = trimmed;
            }
            const dedup = Array.from(new Set(next));
            onChange(dedup);
        },
        [chips, onChange],
    );

    const removeAt = useCallback(
        (index: number) => {
            const next = chips.filter((_, i) => i !== index);
            onChange(next);
        },
        [chips, onChange],
    );

    const addFromDraft = useCallback(() => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        const incoming = trimmed.split(/\s+/).filter(Boolean);
        const next = Array.from(new Set([...chips, ...incoming]));
        onChange(next);
        setDraft('');
    }, [chips, draft, onChange]);

    return (
        <div
            role="presentation"
            className={cn(
                'bg-background-secondary hover:bg-background-tertiary has-[:focus-visible]:border-foreground-brand flex min-h-[28px] min-w-0 flex-1 flex-wrap items-center gap-1 rounded-[10px] border border-transparent p-[3px] transition-colors',
                className,
            )}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    event.preventDefault();
                    focusTrailing();
                }
            }}
        >
            {chips.map((chip, index) => {
                const value = chipDrafts[index] ?? chip;
                return (
                    <span
                        key={`${chip}-${index}`}
                        className="bg-foreground-brand/15 text-foreground-brand text-mini focus-within:ring-foreground-brand/40 inline-flex h-[20px] items-center gap-1 rounded-[6px] px-1.5 transition-colors focus-within:ring-2"
                    >
                        <input
                            ref={(node) => {
                                chipInputRefs.current[index] = node;
                            }}
                            type="text"
                            value={value}
                            spellCheck={false}
                            readOnly={readOnly}
                            aria-label={`${chip}. Press Enter to commit, Backspace to remove.`}
                            onChange={(e) => {
                                const next = chipDrafts.slice();
                                next[index] = e.target.value;
                                setChipDrafts(next);
                            }}
                            onBlur={() => commitChip(index, value)}
                            onKeyDown={(event) => {
                                const input = event.currentTarget;
                                const atStart =
                                    input.selectionStart === 0 && input.selectionEnd === 0;
                                const atEnd =
                                    input.selectionStart === value.length &&
                                    input.selectionEnd === value.length;

                                if (event.key === 'ArrowLeft' && atStart && index > 0) {
                                    event.preventDefault();
                                    focusChip(index - 1);
                                } else if (event.key === 'ArrowRight' && atEnd) {
                                    event.preventDefault();
                                    if (index < chips.length - 1) focusChip(index + 1);
                                    else focusTrailing();
                                } else if (
                                    (event.key === 'Backspace' && (value === '' || atStart)) ||
                                    (event.key === 'Delete' && value === '')
                                ) {
                                    // Backspace on an empty chip OR at a chip's
                                    // left edge removes the WHOLE class (a class
                                    // is a token, not free text) — matches the
                                    // Framer/Webflow mental model. Mid-text
                                    // Backspace still edits characters normally.
                                    event.preventDefault();
                                    if (!readOnly) {
                                        removeAt(index);
                                        if (index > 0)
                                            window.setTimeout(() => focusChip(index - 1), 0);
                                        else window.setTimeout(() => focusTrailing(), 0);
                                    }
                                } else if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitChip(index, value);
                                    if (index < chips.length - 1)
                                        window.setTimeout(() => focusChip(index + 1), 0);
                                    else window.setTimeout(() => focusTrailing(), 0);
                                } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    const reset = chipDrafts.slice();
                                    reset[index] = chip;
                                    setChipDrafts(reset);
                                    input.blur();
                                }
                            }}
                            className="text-foreground-brand min-w-[8px] cursor-text bg-transparent text-[11.5px] outline-none"
                            style={{ width: `${Math.max(value.length + 0.5, 2)}ch` }}
                        />
                        {!readOnly && (
                            <span
                                aria-hidden
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeAt(index);
                                }}
                                className="text-foreground-brand/65 hover:text-foreground-brand cursor-pointer leading-none"
                            >
                                ×
                            </span>
                        )}
                    </span>
                );
            })}
            {!readOnly && (
                <input
                    ref={trailingInputRef}
                    type="text"
                    value={draft}
                    placeholder={placeholder}
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
                            // Remove the whole trailing class in one press
                            // (was: focus into it, so the next press deleted a
                            // character). Focus stays here so repeated Backspace
                            // peels classes off the end.
                            event.preventDefault();
                            if (!readOnly) removeAt(chips.length - 1);
                        } else if (
                            event.key === 'ArrowLeft' &&
                            event.currentTarget.selectionStart === 0 &&
                            chips.length > 0
                        ) {
                            // Arrow into the last class to navigate between
                            // them as units (caret lands at its end).
                            event.preventDefault();
                            focusChip(chips.length - 1);
                        }
                    }}
                    onBlur={() => {
                        if (draft.trim()) addFromDraft();
                    }}
                    className="placeholder:text-muted-foreground text-mini text-foreground-primary h-[20px] min-w-[60px] flex-1 bg-transparent px-1 outline-none"
                />
            )}
        </div>
    );
}
