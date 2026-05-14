'use client';

import { useCallback, useEffect, useState } from 'react';

// Distinct from v2 so toggling the env flag doesn't share collapse state and
// drag a stale set of section IDs into the new accordion (v3 has different IDs).
const STORAGE_KEY = 'weblab:style-panel-v3:open-sections';

function read(): Set<string> | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            return new Set(parsed.filter((v): v is string => typeof v === 'string'));
        }
    } catch {
        // ignore
    }
    return null;
}

function write(open: Set<string>) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
    } catch {
        // ignore
    }
}

export function useSectionState(defaultOpen: readonly string[]) {
    const [open, setOpen] = useState<string[]>([...defaultOpen]);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        const stored = read();
        if (stored !== null) {
            setOpen([...stored]);
        }
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (hydrated) {
            write(new Set(open));
        }
    }, [open, hydrated]);

    const toggle = useCallback((sectionId: string) => {
        setOpen((prev) =>
            prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
        );
    }, []);

    return { open, setOpen, toggle };
}
