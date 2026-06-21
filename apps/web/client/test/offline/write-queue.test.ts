import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// `write-queue` short-circuits when `window` is undefined ("browser-only"
// guard) — stub it before importing the module under test.
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
    (globalThis as { window?: unknown }).window = globalThis;
}

/**
 * In-memory `localforage` substitute. Each `createInstance` call returns a
 * fresh Map-backed store with the subset of the LocalForage API the
 * write-queue exercises. Reset between tests via `__resetStores`.
 */
const stores = new Map<string, Map<string, unknown>>();

function getOrCreateStore(name: string): Map<string, unknown> {
    let s = stores.get(name);
    if (!s) {
        s = new Map();
        stores.set(name, s);
    }
    return s;
}

mock.module('localforage', () => {
    return {
        default: {
            createInstance: ({ storeName }: { storeName: string }) => {
                const store = getOrCreateStore(storeName);
                return {
                    async getItem<T>(key: string): Promise<T | null> {
                        return (store.get(key) as T | undefined) ?? null;
                    },
                    async setItem<T>(key: string, value: T): Promise<T> {
                        store.set(key, value);
                        return value;
                    },
                    async removeItem(key: string): Promise<void> {
                        store.delete(key);
                    },
                    async clear(): Promise<void> {
                        store.clear();
                    },
                    async length(): Promise<number> {
                        return store.size;
                    },
                    async iterate<T, U>(
                        iteratee: (value: T, key: string, n: number) => U,
                    ): Promise<U | undefined> {
                        let n = 1;
                        for (const [k, v] of store) {
                            const result = iteratee(v as T, k, n++);
                            if (result !== undefined) return result;
                        }
                        return undefined;
                    },
                };
            },
        },
        createInstance: ({ storeName }: { storeName: string }) => {
            const store = getOrCreateStore(storeName);
            return {
                async getItem<T>(key: string): Promise<T | null> {
                    return (store.get(key) as T | undefined) ?? null;
                },
                async setItem<T>(key: string, value: T): Promise<T> {
                    store.set(key, value);
                    return value;
                },
                async removeItem(key: string): Promise<void> {
                    store.delete(key);
                },
                async clear(): Promise<void> {
                    store.clear();
                },
                async length(): Promise<number> {
                    return store.size;
                },
                async iterate<T, U>(
                    iteratee: (value: T, key: string, n: number) => U,
                ): Promise<U | undefined> {
                    let n = 1;
                    for (const [k, v] of store) {
                        const result = iteratee(v as T, k, n++);
                        if (result !== undefined) return result;
                    }
                    return undefined;
                },
            };
        },
    };
});

// Import AFTER the module mock so the in-memory store is wired in.
import {
    enqueue,
    getDeadLetterDepth,
    getQueueContent,
    getQueueDepth,
    listDeadLetter,
    listQueueForProject,
    moveToDeadLetter,
    retryDeadLetterRecord,
} from '../../src/services/offline/write-queue';

describe('write-queue coalescing', () => {
    beforeEach(() => {
        stores.clear();
    });
    afterEach(() => {
        stores.clear();
    });

    test('repeated writes to the same path coalesce to a single record', async () => {
        const projectId = 'proj-1';
        const branchId = 'branch-1';
        const path = '/src/Hero.tsx';

        await enqueue({ projectId, branchId, op: 'write', path, content: 'a' });
        await enqueue({ projectId, branchId, op: 'write', path, content: 'b' });
        await enqueue({ projectId, branchId, op: 'write', path, content: 'c' });

        const queue = await listQueueForProject(projectId);
        expect(queue.length).toBe(1);
        expect(queue[0]?.path).toBe(path);
    });

    test('writes to different paths are kept independently', async () => {
        const projectId = 'proj-2';
        const branchId = 'branch-1';

        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/a.tsx',
            content: '1',
        });
        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/b.tsx',
            content: '2',
        });
        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/c.tsx',
            content: '3',
        });

        const queue = await listQueueForProject(projectId);
        expect(queue.length).toBe(3);
    });

    test('delete supersedes prior writes to same path', async () => {
        const projectId = 'proj-3';
        const branchId = 'branch-1';
        const path = '/dead.tsx';

        await enqueue({ projectId, branchId, op: 'write', path, content: 'x' });
        await enqueue({ projectId, branchId, op: 'delete', path });

        const queue = await listQueueForProject(projectId);
        expect(queue.length).toBe(1);
        expect(queue[0]?.op).toBe('delete');
    });

    test('rename invalidates pending writes to oldPath but preserves new path writes', async () => {
        const projectId = 'proj-4';
        const branchId = 'branch-1';

        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/old.tsx',
            content: 'stale',
        });
        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/new.tsx',
            content: 'fresh',
        });
        await enqueue({
            projectId,
            branchId,
            op: 'rename',
            path: '/new.tsx',
            oldPath: '/old.tsx',
        });

        const queue = await listQueueForProject(projectId);
        // Expect exactly: rename + the write to /new.tsx (write to /old.tsx
        // dropped, since /old.tsx no longer exists post-rename).
        expect(queue.length).toBe(2);
        const ops = queue.map((r) => `${r.op}:${r.path}`).sort();
        expect(ops).toEqual(['rename:/new.tsx', 'write:/new.tsx'].sort());
    });

    test('records cross projects do not coalesce', async () => {
        const branchId = 'branch-1';
        const path = '/src/Hero.tsx';

        await enqueue({ projectId: 'a', branchId, op: 'write', path, content: '1' });
        await enqueue({ projectId: 'b', branchId, op: 'write', path, content: '2' });

        expect(await getQueueDepth('a')).toBe(1);
        expect(await getQueueDepth('b')).toBe(1);
    });

    test('queue is sorted in enqueue order by id', async () => {
        const projectId = 'proj-5';
        const branchId = 'branch-1';

        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/a.tsx',
            content: '1',
        });
        await new Promise((r) => setTimeout(r, 5));
        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/b.tsx',
            content: '2',
        });
        await new Promise((r) => setTimeout(r, 5));
        await enqueue({
            projectId,
            branchId,
            op: 'write',
            path: '/c.tsx',
            content: '3',
        });

        const queue = await listQueueForProject(projectId);
        const paths = queue.map((r) => r.path);
        expect(paths).toEqual(['/a.tsx', '/b.tsx', '/c.tsx']);
    });
});

describe('write-queue concurrency + dead-letter', () => {
    beforeEach(() => {
        stores.clear();
    });
    afterEach(() => {
        stores.clear();
    });

    test('concurrent writes to the same path coalesce to a single record', async () => {
        const projectId = 'proj-race';
        const branchId = 'branch-1';
        const path = '/src/Race.tsx';

        // Two writes to the same path fire concurrently. Without serialization,
        // each runs its supersede pass against the pre-insert state (neither
        // sees the other) and both records survive — bloating the queue and
        // risking a spurious conflict from a stale baseHash on replay.
        await Promise.all([
            enqueue({ projectId, branchId, op: 'write', path, content: 'a' }),
            enqueue({ projectId, branchId, op: 'write', path, content: 'b' }),
        ]);

        const queue = await listQueueForProject(projectId);
        expect(queue.length).toBe(1);
        expect(queue[0]?.path).toBe(path);
    });

    test('retrying the same dead-letter record twice is idempotent', async () => {
        const projectId = 'proj-dl';
        const branchId = 'branch-1';
        const path = '/src/Dead.tsx';

        const rec = await enqueue({ projectId, branchId, op: 'write', path, content: 'final' });
        await moveToDeadLetter(rec);
        const [dl] = await listDeadLetter();
        expect(dl).toBeDefined();

        // Double-retry (e.g. a double-click on "Retry") must not duplicate the
        // live record or apply the wrong content — the requeued id is stable so
        // both writes target the same key with identical content.
        await Promise.all([retryDeadLetterRecord(dl!), retryDeadLetterRecord(dl!)]);

        const queue = await listQueueForProject(projectId);
        expect(queue.length).toBe(1);
        expect(await getQueueContent(queue[0]!)).toBe('final');
        expect(await getDeadLetterDepth()).toBe(0);
    });
});
