import type { ComponentDef } from '@weblab/models';

/**
 * In-memory + file-persisted index of discovered component definitions,
 * keyed `projectId/branchId -> ComponentKey -> ComponentDef`. Mirrors the
 * oid index in `index-cache.ts`: derived purely from code on every write /
 * rebuild, persisted to `.weblab/cache/components.json` as a warm-start
 * cache only.
 */

// projectId/branchId -> componentKey -> def
const staticMemoryMap = new Map<string, Record<string, ComponentDef>>();
const loadingPromises = new Map<string, Promise<Record<string, ComponentDef>>>();
// projectId/branchId -> listeners
const listeners = new Map<string, Set<(defs: ComponentDef[]) => void>>();
// projectId/branchId -> last serialized index, to skip no-op notifications
// (every JSX write re-derives its file's defs; without this, listeners — and
// the panels observing them — would re-render on every keystroke).
const lastSerialized = new Map<string, string>();

export async function getOrLoadComponentIndex(
    cacheKey: string,
    indexPath: string,
    readFile: (path: string) => Promise<string | Uint8Array>,
): Promise<Record<string, ComponentDef>> {
    const cached = staticMemoryMap.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const existingLoad = loadingPromises.get(cacheKey);
    if (existingLoad) {
        return existingLoad;
    }

    const loadPromise: Promise<Record<string, ComponentDef>> = (async () => {
        try {
            const content = await readFile(indexPath);
            if (typeof content !== 'string') {
                throw new Error('Invalid component index file content');
            }
            const index = JSON.parse(content);

            const existing = staticMemoryMap.get(cacheKey);
            if (existing !== undefined) {
                return existing;
            }
            staticMemoryMap.set(cacheKey, index);
            return index;
        } catch {
            const existing = staticMemoryMap.get(cacheKey);
            if (existing !== undefined) {
                return existing;
            }
            const emptyIndex: Record<string, ComponentDef> = {};
            staticMemoryMap.set(cacheKey, emptyIndex);
            return emptyIndex;
        } finally {
            loadingPromises.delete(cacheKey);
        }
    })();

    loadingPromises.set(cacheKey, loadPromise);
    return loadPromise;
}

export function saveComponentIndexToCache(
    cacheKey: string,
    index: Record<string, ComponentDef>,
): void {
    staticMemoryMap.set(cacheKey, { ...index });
    const serialized = JSON.stringify(index);
    if (lastSerialized.get(cacheKey) === serialized) {
        return;
    }
    lastSerialized.set(cacheKey, serialized);
    notifyComponentListeners(cacheKey);
}

export function getComponentIndexFromCache(
    cacheKey: string,
): Record<string, ComponentDef> | undefined {
    return staticMemoryMap.get(cacheKey);
}

export function clearComponentIndexCache(cacheKey: string): void {
    staticMemoryMap.delete(cacheKey);
    loadingPromises.delete(cacheKey);
    listeners.delete(cacheKey);
    lastSerialized.delete(cacheKey);
}

export function onComponentIndexChanged(
    cacheKey: string,
    cb: (defs: ComponentDef[]) => void,
): () => void {
    const set = listeners.get(cacheKey) ?? new Set();
    set.add(cb);
    listeners.set(cacheKey, set);
    return () => {
        set.delete(cb);
    };
}

function notifyComponentListeners(cacheKey: string): void {
    const set = listeners.get(cacheKey);
    if (!set || set.size === 0) return;
    const index = staticMemoryMap.get(cacheKey) ?? {};
    const defs = Object.values(index);
    for (const cb of set) {
        try {
            cb(defs);
        } catch (error) {
            console.error('[ComponentIndex] listener failed', error);
        }
    }
}
