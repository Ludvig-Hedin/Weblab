'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'weblab.chat.skipRestoreConfirm';

function readStored(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Power-user preference: skip the "Restore to here?" confirmation dialog when
 * clicking a checkpoint restore button. Persisted in localStorage so the
 * choice survives reloads. Hydrated post-mount to keep server / first-paint
 * markup deterministic.
 */
export function useSkipRestoreConfirm(): [boolean, (next: boolean) => void] {
    const [skip, setSkipState] = useState(false);

    useEffect(() => {
        setSkipState(readStored());
    }, []);

    const setSkip = useCallback((next: boolean) => {
        setSkipState(next);
        if (typeof window === 'undefined') return;
        try {
            if (next) window.localStorage.setItem(STORAGE_KEY, '1');
            else window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            // Best-effort persistence — silently drop storage failures.
        }
    }, []);

    return [skip, setSkip];
}
