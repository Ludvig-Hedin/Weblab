'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Scoped accordion-section-state hook for the Interactions tab. Mirrors the
 * Style tab's `useSectionState` shape but persists under a distinct
 * localStorage key so the two tabs don't write into each other's open-section
 * set (which would surface bogus / unrelated section ids on first hydration).
 */
const STORAGE_KEY = 'weblab:interactions-panel:open-sections';

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

export function useInteractionsSectionState(defaultOpen: readonly string[]) {
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
