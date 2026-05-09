import localforage from 'localforage';

import type { Branch, Canvas, Frame, Project } from '@weblab/models';
import type { ChatConversation } from '@weblab/models';

import { LocalForageKeys } from '@/utils/constants';

export interface CachedProjectExtras {
    userCanvas?: Canvas;
    frames?: Frame[];
    conversations?: ChatConversation[];
    extrasCachedAt?: number;
}

export interface CachedProjectRecord extends CachedProjectExtras {
    project: Project;
    branches: Branch[];
    cachedAt: number;
}

let storePromise: Promise<LocalForage> | null = null;

function getStore(): Promise<LocalForage> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('project-cache is browser-only'));
    }
    storePromise ??= Promise.resolve(
        localforage.createInstance({
            name: 'weblab',
            storeName: 'projects-cache',
            description: 'Cached project + branches for offline editor boot',
        }),
    );
    return storePromise;
}

export async function cacheProject(project: Project, branches: Branch[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const store = await getStore();
        const existing = (await store.getItem<CachedProjectRecord>(project.id)) ?? null;
        const record: CachedProjectRecord = {
            ...(existing ?? {}),
            project,
            branches,
            cachedAt: Date.now(),
        };
        await store.setItem(project.id, record);
    } catch (err) {
        console.warn('[offline] cacheProject failed', err);
    }
}

/**
 * Patch the canvas + frames + conversations onto an existing cache entry.
 * Called from useStartProject when the online polled queries succeed so the
 * next offline boot has enough data to render the canvas immediately. If
 * no base record exists yet the patch is silently dropped.
 */
export async function cacheProjectExtras(
    projectId: string,
    extras: CachedProjectExtras,
): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const store = await getStore();
        const existing = await store.getItem<CachedProjectRecord>(projectId);
        if (!existing) return;
        const next: CachedProjectRecord = {
            ...existing,
            ...extras,
            extrasCachedAt: Date.now(),
        };
        await store.setItem(projectId, next);
    } catch (err) {
        console.warn('[offline] cacheProjectExtras failed', err);
    }
}

export async function getCachedProject(projectId: string): Promise<CachedProjectRecord | null> {
    if (typeof window === 'undefined') return null;
    try {
        const store = await getStore();
        return (await store.getItem<CachedProjectRecord>(projectId)) ?? null;
    } catch (err) {
        console.warn('[offline] getCachedProject failed', err);
        return null;
    }
}

export async function listCachedProjects(): Promise<CachedProjectRecord[]> {
    if (typeof window === 'undefined') return [];
    try {
        const store = await getStore();
        const all: CachedProjectRecord[] = [];
        await store.iterate<CachedProjectRecord, void>((rec) => {
            if (rec) all.push(rec);
        });
        all.sort((a, b) => (b.cachedAt ?? 0) - (a.cachedAt ?? 0));
        return all;
    } catch (err) {
        console.warn('[offline] listCachedProjects failed', err);
        return [];
    }
}

export async function evictCachedProject(projectId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const store = await getStore();
        await store.removeItem(projectId);
    } catch (err) {
        console.warn('[offline] evictCachedProject failed', err);
    }
}

export async function setLastOpenedProject(projectId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        await localforage.setItem(LocalForageKeys.LAST_OPENED_PROJECT_ID, projectId);
    } catch (err) {
        console.warn('[offline] setLastOpenedProject failed', err);
    }
}

export async function getLastOpenedProject(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    try {
        return (await localforage.getItem<string>(LocalForageKeys.LAST_OPENED_PROJECT_ID)) ?? null;
    } catch {
        return null;
    }
}

/**
 * Ask the active service worker to fetch + cache the given URLs so they're
 * navigable offline. Falls back to a direct `fetch` if no SW is controlling
 * the page (e.g. dev mode without SW). Best-effort: never throws.
 */
export async function precacheNavigationUrls(urls: string[]): Promise<void> {
    if (typeof window === 'undefined') return;
    if (urls.length === 0) return;
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'WEBLAB_PRECACHE_URLS',
                urls,
            });
            return;
        }
        // Fallback: hit each URL so the browser HTTP cache at least has a
        // recent copy, even if the SW route isn't active.
        await Promise.all(
            urls.map((url) =>
                fetch(url, { credentials: 'include' }).catch(() => undefined),
            ),
        );
    } catch (err) {
        console.warn('[offline] precacheNavigationUrls failed', err);
    }
}

/**
 * Ask the browser to keep our IndexedDB data through storage pressure. Best-effort:
 * Safari often denies this. Logs to console; never throws.
 */
export async function requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    if (!('storage' in navigator) || !navigator.storage.persist || !navigator.storage.persisted) {
        return false;
    }
    try {
        const persisted = await navigator.storage.persisted();
        if (persisted) return true;
        return await navigator.storage.persist();
    } catch (err) {
        console.warn('[offline] requestPersistentStorage failed', err);
        return false;
    }
}
