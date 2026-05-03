'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@weblab/ui/utils';

export interface TextFieldProps {
    value: string;
    onCommit: (value: string) => void;
    placeholder?: string;
    className?: string;
}

/** A draftable text input that commits on blur or Enter. */
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
            className={cn(
                'border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 h-7 w-full min-w-0 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]',
                className,
            )}
        />
    );
}
