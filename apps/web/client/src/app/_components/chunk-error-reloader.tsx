'use client';

import { useEffect } from 'react';

// Bundler chunk filenames are content-hashed and rotate on every Turbopack HMR
// rebuild (dev) and every deploy (prod). A long-lived tab keeps a module graph
// that points at the previous filenames, so a later dynamic import fetches a
// chunk the server no longer has → `ChunkLoadError`. A fresh page load picks up
// the current graph, so the recovery is a one-time reload. The session-scoped
// timestamp guard stops a genuinely broken build from looping forever.
const RELOAD_GUARD_KEY = 'weblab:chunk-reload-at';
const RELOAD_GUARD_MS = 10_000;

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
    try {
        const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
        if (Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_MS) {
            // Already reloaded recently and still failing — the chunk is truly
            // gone (broken build). Stop looping; let the error surface.
            return false;
        }
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
        // sessionStorage can throw (private mode / disabled storage). Without a
        // guard a reload loop is possible, so bail rather than risk it.
        return false;
    }
    window.location.reload();
    return true;
}

export function ChunkErrorReloader() {
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            const target = event.target as HTMLElement | null;
            const isStaleChunkScript =
                target instanceof HTMLScriptElement &&
                /\/_next\/static\/(chunks|[\w-]+)\//.test(target.src);

            if (
                isChunkLoadError(event.error) ||
                isChunkLoadError(event.message) ||
                isStaleChunkScript
            ) {
                reloadOnceForChunkError();
            }
        };

        const onRejection = (event: PromiseRejectionEvent) => {
            if (isChunkLoadError(event.reason)) {
                reloadOnceForChunkError();
            }
        };

        // Capture phase so resource-load errors on <script> tags (which do not
        // bubble) are seen too.
        window.addEventListener('error', onError, true);
        window.addEventListener('unhandledrejection', onRejection);

        return () => {
            window.removeEventListener('error', onError, true);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    return null;
}
