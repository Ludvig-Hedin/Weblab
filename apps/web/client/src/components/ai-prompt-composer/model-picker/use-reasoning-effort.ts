'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ReasoningEffort } from '@weblab/models';
import { DEFAULT_REASONING_EFFORT } from '@weblab/models';

const STORAGE_KEY = 'weblab.chat.reasoningEffort';
const VALID = new Set<ReasoningEffort>(['minimal', 'low', 'medium', 'high']);

function readStored(): ReasoningEffort {
    if (typeof window === 'undefined') return DEFAULT_REASONING_EFFORT;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw && VALID.has(raw as ReasoningEffort)) return raw as ReasoningEffort;
    } catch {
        // localStorage unavailable (private mode, sandboxed iframe) — fall back.
    }
    return DEFAULT_REASONING_EFFORT;
}

export function useReasoningEffort(): [ReasoningEffort, (next: ReasoningEffort) => void] {
    // Hydrate to the default first to keep server / first-paint markup stable;
    // localStorage value overrides on a post-mount effect.
    const [effort, setEffortState] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);

    useEffect(() => {
        setEffortState(readStored());
    }, []);

    const setEffort = useCallback((next: ReasoningEffort) => {
        setEffortState(next);
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Best-effort persistence — silently drop storage failures.
        }
    }, []);

    return [effort, setEffort];
}
