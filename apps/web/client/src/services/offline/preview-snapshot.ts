'use client';

import localforage from 'localforage';

interface PreviewSnapshot {
    html: string;
    baseUrl: string;
    capturedAt: number;
}

let preloadScriptCache: string | null = null;

/**
 * Inline the parent-origin preload bundle into a captured HTML snapshot.
 *
 * `srcdoc` iframes have an opaque origin (`null`), so any external `<script
 * src=...>` referencing the dev-server origin will 404 when rendered. We
 * fetch the bundle once from the parent origin (where the SW cache picks
 * it up) and inject it inline so the snapshot retains a working penpal
 * child — letting the editor's optimistic visual edits keep flowing onto
 * the static DOM while offline.
 */
export async function inlinePreloadIntoSnapshot(html: string): Promise<string> {
    if (typeof window === 'undefined') return html;
    try {
        if (preloadScriptCache === null) {
            const response = await fetch('/weblab-preload-script.js', {
                cache: 'force-cache',
                credentials: 'omit',
            });
            if (!response.ok) return html;
            preloadScriptCache = await response.text();
        }
        const inline = `<script type="module" data-weblab-offline-preload="1">${preloadScriptCache}</script>`;
        if (/<\/body>/i.test(html)) {
            return html.replace(/<\/body>/i, `${inline}</body>`);
        }
        if (/<\/html>/i.test(html)) {
            return html.replace(/<\/html>/i, `${inline}</html>`);
        }
        return `${html}${inline}`;
    } catch {
        return html;
    }
}

let storePromise: Promise<LocalForage> | null = null;

function getStore(): Promise<LocalForage> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('preview-snapshot is browser-only'));
    }
    storePromise ??= Promise.resolve(
        localforage.createInstance({
            name: 'weblab',
            storeName: 'preview-snapshots',
            description: 'Frozen iframe snapshots for offline preview',
        }),
    );
    return storePromise;
}

function key(projectId: string, branchId: string, frameId: string): string {
    return JSON.stringify([projectId, branchId, frameId]);
}

export async function savePreviewSnapshot(
    projectId: string,
    branchId: string,
    frameId: string,
    html: string,
    baseUrl: string,
): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const store = await getStore();
        const snapshot: PreviewSnapshot = {
            html,
            baseUrl,
            capturedAt: Date.now(),
        };
        await store.setItem(key(projectId, branchId, frameId), snapshot);
    } catch (err) {
        console.warn('[offline] savePreviewSnapshot failed', err);
    }
}

export async function getPreviewSnapshot(
    projectId: string,
    branchId: string,
    frameId: string,
): Promise<PreviewSnapshot | null> {
    if (typeof window === 'undefined') return null;
    try {
        const store = await getStore();
        return (await store.getItem<PreviewSnapshot>(key(projectId, branchId, frameId))) ?? null;
    } catch (err) {
        console.warn('[offline] getPreviewSnapshot failed', err);
        return null;
    }
}

export async function evictPreviewSnapshot(
    projectId: string,
    branchId: string,
    frameId: string,
): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const store = await getStore();
        await store.removeItem(key(projectId, branchId, frameId));
    } catch (err) {
        console.warn('[offline] evictPreviewSnapshot failed', err);
    }
}
