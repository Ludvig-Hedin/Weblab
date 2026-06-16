import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { clearSigningOut, isSigningOut, markSigningOut } from './signing-out';

// Minimal in-memory sessionStorage so the module's storage access works under
// `bun test` (no DOM). Only the subset the module touches is implemented.
function installFakeSessionStorage() {
    const store = new Map<string, string>();
    const fake = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
            store.set(k, String(v));
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => store.clear(),
    };
    (globalThis as { sessionStorage: Storage }).sessionStorage = fake as unknown as Storage;
    return store;
}

const KEY = 'weblab:signing-out-at';
const TTL_MS = 15_000;
let store: Map<string, string>;

beforeEach(() => {
    store = installFakeSessionStorage();
});

afterEach(() => {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

describe('signing-out sentinel', () => {
    it('is not set before any mark', () => {
        expect(isSigningOut()).toBe(false);
    });

    it('marks and reads back a fresh sign-out as a numeric timestamp', () => {
        markSigningOut();
        expect(isSigningOut()).toBe(true);
        const raw = store.get(KEY);
        expect(raw).toBeTruthy();
        expect(Number.isFinite(Number(raw))).toBe(true);
    });

    it('clears the flag', () => {
        markSigningOut();
        clearSigningOut();
        expect(isSigningOut()).toBe(false);
        expect(store.has(KEY)).toBe(false);
    });

    it('treats a timestamp past the TTL window as stale', () => {
        store.set(KEY, String(Date.now() - TTL_MS - 1));
        expect(isSigningOut()).toBe(false);
    });

    it('honours a timestamp inside the TTL window', () => {
        store.set(KEY, String(Date.now() - 1_000));
        expect(isSigningOut()).toBe(true);
    });

    it('ignores a corrupt (non-numeric) value', () => {
        store.set(KEY, 'not-a-number');
        expect(isSigningOut()).toBe(false);
    });

    it('degrades to a no-op when sessionStorage is unavailable', () => {
        delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
        expect(() => markSigningOut()).not.toThrow();
        expect(isSigningOut()).toBe(false);
        expect(() => clearSigningOut()).not.toThrow();
    });
});
