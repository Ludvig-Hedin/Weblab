'use client';

import { useEffect, useState } from 'react';

import { Input } from '@weblab/ui/input';

/** An input that commits its value on blur / Enter, only when it changed. */
export function EditableText({
    value,
    onCommit,
    placeholder,
    className,
}: {
    value: string;
    onCommit: (next: string) => void;
    placeholder?: string;
    className?: string;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);

    function commit() {
        const trimmed = draft;
        if (trimmed !== value) onCommit(trimmed);
    }

    return (
        <Input
            value={draft}
            placeholder={placeholder}
            className={className}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                }
            }}
        />
    );
}
