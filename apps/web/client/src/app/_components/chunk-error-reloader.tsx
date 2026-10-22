'use client';

import { useEffect } from 'react';
import { disarmInitialChunkRecovery } from './chunk-bootstrap';

// Keep the recognizer for existing error boundaries. Automatic recovery belongs
// exclusively to the raw pre-hydration bootstrap, before editing is possible.

export function isChunkLoadError(value: unknown): boolean {
    if (!value) return false;
    if (value instanceof Error) {
        if (value.name === 'ChunkLoadError') return true;
        return CHUNK_ERROR_MESSAGE.test(value.message);
    }
    if (typeof value === 'string') return CHUNK_ERROR_MESSAGE.test(value);
    return false;
}

const CHUNK_ERROR_MESSAGE =
    /(Loading( CSS)? chunk [\w-]+ failed)|(Failed to load chunk)|(error loading dynamically imported module)|(Importing a module script failed)/i;

export function reloadOnceForChunkError(): boolean {
    // These legacy callers run in hydrated error-boundary effects. Their effect
    // may precede the sibling marker, so never infer that an armed marker means
    // this call is safe to reload. False preserves the existing error UI.
    if (typeof window !== 'undefined') disarmInitialChunkRecovery();
    return false;
}

export function ChunkErrorReloader() {
    useEffect(() => {
        // This signal is permanent for the document, including remounts.
        // The initial listener does not suppress normal error reporting.
        disarmInitialChunkRecovery();
    }, []);

    return null;
}
