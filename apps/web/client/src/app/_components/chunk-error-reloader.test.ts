import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { isChunkLoadError, reloadOnceForChunkError } from './chunk-error-reloader';

describe('isChunkLoadError', () => {
    it('matches an Error whose name is ChunkLoadError', () => {
        const err = new Error('whatever');
        err.name = 'ChunkLoadError';
        expect(isChunkLoadError(err)).toBe(true);
    });

    it('matches Turbopack/webpack chunk failure messages', () => {
        expect(isChunkLoadError(new Error('Loading chunk 964893 failed'))).toBe(true);
        expect(isChunkLoadError(new Error('Loading CSS chunk app failed'))).toBe(true);
        expect(
            isChunkLoadError(
                new Error(
                    'Failed to load chunk /_next/static/chunks/02fju~2~unh4_.js from module 964893',
                ),
            ),
        ).toBe(true);
        expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
        expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    });

    it('matches raw string messages', () => {
        expect(isChunkLoadError('Failed to load chunk foo.js')).toBe(true);
    });

    it('does not match unrelated errors or empty values', () => {
        expect(isChunkLoadError(new Error('TypeError: x is not a function'))).toBe(false);
        expect(isChunkLoadError('network request failed')).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
        expect(isChunkLoadError({})).toBe(false);
    });
});

describe('reloadOnceForChunkError', () => {
    const store = new Map<string, string>();
    let reload: ReturnType<typeof mock>;

    beforeEach(() => {
        store.clear();
        reload = mock(() => undefined);
        (globalThis as Record<string, unknown>).sessionStorage = {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
        };
        (globalThis as Record<string, unknown>).window = {
            location: { reload },
            __weblabInitialChunkRecovery: { disarm: () => undefined },
        };
    });

    afterEach(() => {
        delete (globalThis as Record<string, unknown>).sessionStorage;
        delete (globalThis as Record<string, unknown>).window;
    });

    it('disarms instead of reloading when an error boundary effect precedes the hydration marker', () => {
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        expect((window as unknown as Record<string, unknown>).__weblabChunkRecoveryDisabled).toBe(true);
        expect(store.size).toBe(0);
    });

    it('does not reload again within the guard window (no loop)', () => {
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it('does not reload a hydrated page even after the startup guard window elapsed', () => {
        store.set('weblab:chunk-reload-at', String(Date.now() - 20_000));
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it('bails without reloading when storage throws', () => {
        (globalThis as Record<string, unknown>).sessionStorage = {
            getItem: () => {
                throw new Error('storage disabled');
            },
            setItem: () => undefined,
        };
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it('cannot bypass startup disarm from a hydrated error boundary', () => {
        Object.assign(window, { __weblabChunkRecoveryDisabled: true });
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        expect(store.size).toBe(0);
    });

    it('does not reload when the initial bootstrap was never installed', () => {
        (globalThis as Record<string, unknown>).window = { location: { reload } };
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });
});
