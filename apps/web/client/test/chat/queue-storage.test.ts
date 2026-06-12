import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import {
    clearPendingTurn,
    clearStreamInFlight,
    loadPendingTurn,
    loadQueue,
    markStreamInFlight,
    savePendingTurn,
    saveQueue,
    wasStreamInFlight,
} from '../../src/app/project/[id]/_hooks/use-chat/queue-storage';

// queue-storage gates every call on `typeof window !== 'undefined' &&
// window.localStorage` at call time — an in-memory shim is enough.
function createLocalStorageShim() {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        get length() {
            return store.size;
        },
        key: (i: number) => [...store.keys()][i] ?? null,
    };
}

const hadWindow = typeof (globalThis as { window?: unknown }).window !== 'undefined';
const shim = createLocalStorageShim();
(globalThis as { window?: unknown }).window = { localStorage: shim };

afterAll(() => {
    if (!hadWindow) {
        delete (globalThis as { window?: unknown }).window;
    }
});

beforeEach(() => {
    shim.clear();
});

describe('pending turn persistence', () => {
    test('round-trips a saved turn', () => {
        savePendingTurn('conv-1', { content: 'add a hero section', type: 'edit' });
        expect(loadPendingTurn('conv-1')).toEqual({
            content: 'add a hero section',
            type: 'edit',
        });
    });

    test('is scoped per conversation', () => {
        savePendingTurn('conv-1', { content: 'a', type: 'edit' });
        expect(loadPendingTurn('conv-2')).toBeNull();
    });

    test('clearPendingTurn removes the entry', () => {
        savePendingTurn('conv-1', { content: 'a', type: 'edit' });
        clearPendingTurn('conv-1');
        expect(loadPendingTurn('conv-1')).toBeNull();
    });

    test('rejects malformed or wrong-shape payloads', () => {
        shim.setItem('weblab:chat:pending-turn:1:conv-1', 'not json{');
        expect(loadPendingTurn('conv-1')).toBeNull();
        shim.setItem('weblab:chat:pending-turn:1:conv-1', JSON.stringify({ content: 42 }));
        expect(loadPendingTurn('conv-1')).toBeNull();
    });

    test('no-ops for empty conversation id', () => {
        savePendingTurn('', { content: 'a', type: 'edit' });
        expect(loadPendingTurn('')).toBeNull();
    });
});

describe('inflight flag', () => {
    test('mark → was → clear lifecycle', () => {
        expect(wasStreamInFlight('conv-1')).toBe(false);
        markStreamInFlight('conv-1');
        expect(wasStreamInFlight('conv-1')).toBe(true);
        clearStreamInFlight('conv-1');
        expect(wasStreamInFlight('conv-1')).toBe(false);
    });
});

describe('queue persistence', () => {
    test('round-trips and revives timestamps', () => {
        const ts = new Date('2026-06-13T10:00:00Z');
        saveQueue('conv-1', [
            { id: 'm1', content: 'hello', type: 'edit', timestamp: ts, context: [] } as never,
        ]);
        const loaded = loadQueue('conv-1');
        expect(loaded).toHaveLength(1);
        expect(loaded[0]?.timestamp).toBeInstanceOf(Date);
        expect(loaded[0]?.timestamp.getTime()).toBe(ts.getTime());
    });

    test('empty queue removes the key', () => {
        saveQueue('conv-1', [
            { id: 'm1', content: 'hello', type: 'edit', timestamp: new Date(), context: [] } as never,
        ]);
        saveQueue('conv-1', []);
        expect(loadQueue('conv-1')).toEqual([]);
    });
});
