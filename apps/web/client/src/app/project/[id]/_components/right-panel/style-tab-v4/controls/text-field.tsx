'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

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
    const t = useTranslations('editor.stylePanel.controls.numberInput');
    const [draft, setDraft] = useState(value);
    const lastValueRef = useRef(value);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const skipBlurCommitRef = useRef(false);
    // True once the user has typed in this focus session. Without it, a focus
    // that spans an external value change (undo, sibling commit) would commit
    // the now-stale draft on blur and silently revert the external value.
    const userTouchedRef = useRef(false);

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
            onFocus={() => {
                userTouchedRef.current = false;
            }}
            onChange={(e) => {
                userTouchedRef.current = true;
                setDraft(e.target.value);
            }}
            onBlur={() => {
                if (skipBlurCommitRef.current) {
                    skipBlurCommitRef.current = false;
                    userTouchedRef.current = false;
                    return;
                }
                if (!userTouchedRef.current) {
                    // No user input during focus — resync the draft to the
                    // current value so the next focus shows fresh state.
                    if (draft !== value) setDraft(value);
                    return;
                }
                userTouchedRef.current = false;
                if (draft !== value) onCommit(draft);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (userTouchedRef.current && draft !== value) onCommit(draft);
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
            placeholder={mixed ? t('mixed') : placeholder}
            className={cn(
                FIELD_BASE_CLASSES,
                'min-w-0',
                mixed && 'placeholder:text-foreground-tertiary/70 placeholder:italic',
                className,
            )}
        />
    );
}
