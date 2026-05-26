'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

export interface TextFieldProps {
    value: string;
    onCommit: (value: string) => void;
    placeholder?: string;
    /** When true, multiple selected elements have different values. Shows italic "Mixed" placeholder. */
    mixed?: boolean;
    className?: string;
}

/**
 * Style panel text input (v3 fork). Geometry comes from v3's
 * `FIELD_BASE_CLASSES` — the single source of truth for height (30px), radius
 * (8px), padding (10px), dark fill, border, hover, and focus ring. Edit only
 * that constant when you want to retune the look — every row editor follows.
 *
 * v3 difference vs v2: the base class rings on KEYBOARD focus only. The
 * `<input>` is itself the focusable element, so the `focus-visible:*` variants
 * in `FIELD_BASE_CLASSES` apply directly — no ring on mouse-click.
 *
 * Commits on blur or Enter; resets on Escape.
 */
export function TextField({ value, onCommit, placeholder, mixed, className }: TextFieldProps) {
    const [draft, setDraft] = useState(value);
    const lastValueRef = useRef(value);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const skipBlurCommitRef = useRef(false);

    useEffect(() => {
        if (value === lastValueRef.current) return;
        lastValueRef.current = value;
        if (document.activeElement !== inputRef.current) setDraft(value);
    }, [value]);

    return (
        <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (skipBlurCommitRef.current) {
                    skipBlurCommitRef.current = false;
                    return;
                }
                if (draft !== value) onCommit(draft);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (draft !== value) onCommit(draft);
                    skipBlurCommitRef.current = true;
                    e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setDraft(value);
                    skipBlurCommitRef.current = true;
                    e.currentTarget.blur();
                }
            }}
            placeholder={mixed ? 'Mixed' : placeholder}
            className={cn(
                FIELD_BASE_CLASSES,
                'min-w-0',
                mixed && 'placeholder:italic placeholder:text-foreground-tertiary/70',
                className,
            )}
        />
    );
}
