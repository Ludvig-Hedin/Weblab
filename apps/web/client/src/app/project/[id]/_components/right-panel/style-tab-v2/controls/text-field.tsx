'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

export interface TextFieldProps {
    value: string;
    onCommit: (value: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * Style panel text input. Geometry comes from FIELD_BASE_CLASSES — that's the
 * single source of truth for height (30px), radius (8px), padding (10px),
 * dark fill (rgb(43,43,43)), border, hover, and focus ring. Edit only that
 * constant when you want to retune the look — every row editor follows.
 *
 * Commits on blur or Enter; resets on Escape.
 */
export function TextField({ value, onCommit, placeholder, className }: TextFieldProps) {
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
            placeholder={placeholder}
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
            className={cn(FIELD_BASE_CLASSES, 'min-w-0', className)}
        />
    );
}
