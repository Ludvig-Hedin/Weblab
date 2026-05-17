'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

/**
 * `useState` variant that mirrors to `localStorage`. Returns React's native
 * `setState`, so functional updaters (`setX(prev => …)`) work as expected.
 * Used by the Brand panel so per-section + per-group collapse state survives
 * a panel close/reopen (the panel unmounts when the user switches left-panel
 * tabs).
 *
 * SSR-safe — server render uses `initial` and never touches `window`. Any
 * JSON parse failure or quota error falls back silently (private-mode
 * browsers, locked profiles).
 */
export function useLocalStorageState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        if (typeof window === 'undefined') return initial;
        const raw = window.localStorage.getItem(key);
        if (raw == null) return initial;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return initial;
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(key, JSON.stringify(state));
        } catch {
            /* quota / private-mode — ignore */
        }
    }, [key, state]);

    return [state, setState];
}
