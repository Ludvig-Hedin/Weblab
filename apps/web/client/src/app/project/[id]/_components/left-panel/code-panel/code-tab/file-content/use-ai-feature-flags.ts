'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'weblab.ai.featureFlags';

/**
 * Cursor-style AI features behind a per-user opt-in. Persisted in
 * localStorage so we don't need a DB migration. Each browser is its own
 * setting until we promote this to user settings (which requires a
 * Drizzle migration — out of scope for this batch).
 */
export interface AiFeatureFlags {
    inlineEdit: boolean;
    tabAutocomplete: boolean;
    errorFix: boolean;
    designerInlineEdit: boolean;
}

const DEFAULTS: AiFeatureFlags = {
    inlineEdit: true,
    tabAutocomplete: true,
    errorFix: true,
    designerInlineEdit: true,
};

const readFromStorage = (): AiFeatureFlags => {
    if (typeof window === 'undefined') return DEFAULTS;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULTS;
        const parsed = JSON.parse(raw) as Partial<AiFeatureFlags>;
        return { ...DEFAULTS, ...parsed };
    } catch {
        return DEFAULTS;
    }
};

export const useAiFeatureFlags = (): AiFeatureFlags => {
    const [flags, setFlags] = useState<AiFeatureFlags>(DEFAULTS);

    useEffect(() => {
        setFlags(readFromStorage());
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) setFlags(readFromStorage());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    return flags;
};

export const setAiFeatureFlag = <K extends keyof AiFeatureFlags>(
    key: K,
    value: AiFeatureFlags[K],
) => {
    if (typeof window === 'undefined') return;
    const current = readFromStorage();
    const next = { ...current, [key]: value };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Cross-tab updates fire StorageEvent; in-tab updates need a manual nudge.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
};
