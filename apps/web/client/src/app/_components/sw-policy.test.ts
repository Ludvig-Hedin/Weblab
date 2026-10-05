import { describe, expect, it } from 'bun:test';
import { ownsOfflineCache, ownsRegistration, removeOptedOutServiceWorker, serviceWorkerMode } from './sw-policy';

const origin = 'https://cloud.example.test';
const ownWorker = { scriptURL: `${origin}/sw.js` };
const registration = (overrides = {}) => ({
    scope: `${origin}/`, active: ownWorker, waiting: null, installing: null,
    unregister: async () => true, ...overrides,
});

describe('isolated cloud service worker opt-out', () => {
    it('only explicit false cleans up; native production and default development keep their policy', () => {
        expect(serviceWorkerMode('false', true)).toBe('opt-out');
        expect(serviceWorkerMode('false', false)).toBe('opt-out');
        expect(serviceWorkerMode(undefined, false)).toBe('inactive');
        expect(serviceWorkerMode(undefined, true)).toBe('enabled');
        expect(serviceWorkerMode('true', false)).toBe('enabled');
    });

    it('matches only the root registration with exclusively our exact same-origin script', () => {
        expect(ownsRegistration(registration(), origin)).toBe(true);
        expect(ownsRegistration(registration({ active: null, waiting: ownWorker }), origin)).toBe(true);
        for (const other of [
            { scope: `${origin}/other/` },
            { active: { scriptURL: 'https://other.example.test/sw.js' } },
            { active: { scriptURL: `${origin}/other.js` } },
            { active: { scriptURL: `${origin}/sw.js?other=1` } },
            { installing: { scriptURL: `${origin}/other.js` } },
            { active: null },
        ]) expect(ownsRegistration(registration(other), origin)).toBe(false);
    });

    it('purges only the three owned versioned cache families', () => {
        for (const name of ['weblab-shell-v1', 'weblab-runtime-v4', 'weblab-next-data-v123']) {
            expect(ownsOfflineCache(name)).toBe(true);
        }
        for (const name of ['other-shell-v4', 'weblab-drafts-v4', 'weblab-recovery', 'weblab-shell-v4-extra']) {
            expect(ownsOfflineCache(name)).toBe(false);
        }
    });

    it('unregisters owned workers, keeps unrelated caches, and reports the still-controlled tab', async () => {
        const calls: string[] = [];
        const result = await removeOptedOutServiceWorker(origin, {
            controller: ownWorker,
            getRegistrations: async () => [
                registration({ unregister: async () => { calls.push('unregister-own'); return true; } }),
                registration({ scope: `${origin}/other/`, unregister: async () => { calls.push('unregister-other'); return true; } }),
            ],
        }, {
            keys: async () => ['weblab-shell-v4', 'weblab-runtime-v3', 'weblab-next-data-v2', 'other-cache', 'weblab-recovery'],
            delete: async name => { calls.push(`delete:${name}`); return true; },
        });
        expect(calls).toEqual(['unregister-own', 'delete:weblab-shell-v4', 'delete:weblab-runtime-v3', 'delete:weblab-next-data-v2']);
        expect(result).toEqual({ requiresReload: true, failures: 0 });
    });

    it('continues cache purge after registration failure and surfaces failed deletion', async () => {
        const calls: string[] = [];
        const result = await removeOptedOutServiceWorker(origin, {
            controller: null,
            getRegistrations: async () => { throw new Error('blocked'); },
        }, {
            keys: async () => ['weblab-shell-v4', 'weblab-runtime-v4'],
            delete: async name => { calls.push(name); if (name.includes('shell')) throw new Error('blocked'); return true; },
        });
        expect(calls).toEqual(['weblab-shell-v4', 'weblab-runtime-v4']);
        expect(result).toEqual({ requiresReload: false, failures: 2 });
    });

    it('cleans again on an uncontrolled load without requesting a reload', async () => {
        const calls: string[] = [];
        const result = await removeOptedOutServiceWorker(origin, {
            controller: { scriptURL: `${origin}/unrelated.js` }, getRegistrations: async () => [],
        }, {
            keys: async () => ['weblab-shell-v4'],
            delete: async name => { calls.push(name); return true; },
        });
        expect(calls).toEqual(['weblab-shell-v4']);
        expect(result).toEqual({ requiresReload: false, failures: 0 });
    });
});
