import { describe, expect, test } from 'bun:test';
import { captureWorkingLevelEntry, parseWorkingLevel, readWorkingLevel, requiresWorkingLevelTeardown, saveWorkingLevel, workingLevelKey, WorkingLevelLifecycle } from './working-level';
import type { WorkingLevelStorage } from './working-level';

function storage() {
    const values = new Map<string, string>();
    const store: WorkingLevelStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    return { values, store };
}

describe('device working level', () => {
    test('requires an explicit first choice and accepts only the current versioned levels', () => {
        const { store } = storage();
        expect(readWorkingLevel(store, 'user-a')).toEqual({ level: null, storageFailed: false });
        expect(parseWorkingLevel('{"version":1,"level":"content"}')).toBe('content');
        expect(parseWorkingLevel('{"version":1,"level":"full"}')).toBe('full');
        for (const raw of [null, '', 'full', 'null', '[]', '{}', '{"version":2,"level":"full"}', '{"version":1,"level":"owner"}', 'x'.repeat(257)]) expect(parseWorkingLevel(raw)).toBeNull();
    });

    test('never inherits another signed-in user preference', () => {
        const { store, values } = storage();
        expect(saveWorkingLevel(store, 'user-a', 'full')).toBe(true);
        expect(readWorkingLevel(store, 'user-a').level).toBe('full');
        expect(readWorkingLevel(store, 'user-b').level).toBeNull();
        expect(saveWorkingLevel(store, 'user-b', 'content')).toBe(true);
        expect(readWorkingLevel(store, 'user-a').level).toBe('full');
        expect(values.size).toBe(2);
        expect(workingLevelKey('user:a/b')).not.toBe(workingLevelKey('user:a%2Fb'));
    });

    test('failed storage reads require a choice, rather than defaulting to Full', () => {
        const store: WorkingLevelStorage = { getItem: () => { throw new Error('Blocked'); }, setItem: () => {} };
        expect(readWorkingLevel(store, 'user-a')).toEqual({ level: null, storageFailed: true });
    });

    test('a failed save reports a session-only choice without replacing saved data', () => {
        const { store, values } = storage();
        saveWorkingLevel(store, 'user-a', 'content');
        const failing: WorkingLevelStorage = { getItem: store.getItem, setItem: () => { throw new Error('Quota'); } };
        expect(saveWorkingLevel(failing, 'user-a', 'full')).toBe(false);
        expect(readWorkingLevel(store, 'user-a').level).toBe('content');
        expect(values.size).toBe(1);
    });

    test('does not store project permissions, membership or feature flags', () => {
        const { store, values } = storage();
        saveWorkingLevel(store, 'user-a', 'full');
        expect(JSON.parse(values.get(workingLevelKey('user-a'))!)).toEqual({ version: 1, level: 'full' });
    });

    test('keeps the current site entry when preferences change', () => {
        const entry = captureWorkingLevelEntry(null, 'user-a', 'site-a', 'full');
        expect(captureWorkingLevelEntry(entry, 'user-a', 'site-a', 'content')).toBe(entry);
        expect(captureWorkingLevelEntry(entry, 'user-a', 'site-b', 'content')).toEqual({ userId: 'user-a', siteId: 'site-b', level: 'content' });
    });

    test('an owner change captures that owner choice even for the same site', () => {
        const entry = captureWorkingLevelEntry(null, 'user-a', 'site-a', 'full');
        expect(captureWorkingLevelEntry(entry, 'user-b', 'site-a', 'content')).toEqual({ userId: 'user-b', siteId: 'site-a', level: 'content' });
    });

    test('retains only the same site and owner, closing before every different Full site or Content entry', () => {
        const entry = captureWorkingLevelEntry(null, 'user-a', 'site-a', 'full');
        expect(requiresWorkingLevelTeardown(entry, captureWorkingLevelEntry(entry, 'user-a', 'site-a', 'content'), 'user-a')).toBe(false);
        expect(requiresWorkingLevelTeardown(entry, captureWorkingLevelEntry(entry, 'user-a', 'site-b', 'full'), 'user-a')).toBe(true);
        expect(requiresWorkingLevelTeardown(entry, captureWorkingLevelEntry(entry, 'user-a', 'site-b', 'content'), 'user-a')).toBe(true);
        expect(requiresWorkingLevelTeardown(entry, null, null)).toBe(true);
        expect(requiresWorkingLevelTeardown(entry, null, 'user-a')).toBe(false);
        expect(requiresWorkingLevelTeardown(entry, captureWorkingLevelEntry(entry, 'user-b', 'site-a', 'full'), 'user-b')).toBe(true);
    });

    test('content entries also retain recovery work before site or owner changes', () => {
        const entry = captureWorkingLevelEntry(null, 'user-a', 'site-a', 'content');
        expect(requiresWorkingLevelTeardown(entry, captureWorkingLevelEntry(entry, 'user-a', 'site-a', 'full'), 'user-a')).toBe(false);
        expect(requiresWorkingLevelTeardown(entry, captureWorkingLevelEntry(entry, 'user-a', 'site-b', 'content'), 'user-a')).toBe(true);
        expect(requiresWorkingLevelTeardown(entry, captureWorkingLevelEntry(entry, 'user-a', 'site-b', 'full'), 'user-a')).toBe(true);
        expect(requiresWorkingLevelTeardown(entry, null, null)).toBe(true);
        expect(requiresWorkingLevelTeardown(entry, null, 'user-a')).toBe(false);
    });

    test('retains teardown until in-flight initialization finishes and deduplicates close requests', async () => {
        const lifecycle = new WorkingLevelLifecycle();
        const events: string[] = [];
        let initialized!: () => void;
        const initialization = new Promise<void>((resolve) => { initialized = resolve; });
        lifecycle.register(async () => { await initialization; events.push('clear'); });
        const first = lifecycle.close();
        expect(lifecycle.close()).toBe(first);
        expect(events).toEqual([]);
        initialized();
        await first;
        expect(events).toEqual(['clear']);
    });

    test('refuses the transition on failed cleanup and only retries through another explicit close', async () => {
        const lifecycle = new WorkingLevelLifecycle();
        let refused = true;
        let calls = 0;
        lifecycle.register(async () => { calls++; if (refused) throw new Error('Unsaved work'); });
        await expect(lifecycle.close()).rejects.toThrow('Unsaved work');
        expect(calls).toBe(1);
        refused = false;
        await lifecycle.close();
        expect(calls).toBe(2);
    });

    test('registration cleanup cannot unregister a later mounted provider', async () => {
        const lifecycle = new WorkingLevelLifecycle();
        const events: string[] = [];
        const removeOld = lifecycle.register(async () => { events.push('old'); });
        lifecycle.register(async () => { events.push('new'); });
        removeOld();
        removeOld();
        await lifecycle.close();
        expect(events).toEqual(['new']);
    });

    test('a same-owner project handoff failure reaches the blocking gate until its listener unmounts', () => {
        const lifecycle = new WorkingLevelLifecycle();
        let failures = 0;
        const unsubscribe = lifecycle.onFailure(() => { failures++; });
        lifecycle.reportFailure();
        expect(failures).toBe(1);
        unsubscribe();
        lifecycle.reportFailure();
        expect(failures).toBe(1);
    });

    test('prepares every registered buffer before disposal regardless of registration order', async () => {
        const lifecycle = new WorkingLevelLifecycle();
        const events: string[] = [];
        lifecycle.register(async () => { events.push('dispose'); });
        lifecycle.prepare(async () => { events.push('buffer-a'); });
        lifecycle.prepare(async () => { events.push('buffer-b'); });
        await lifecycle.close();
        expect(events).toEqual(['buffer-a', 'buffer-b', 'dispose']);
        expect(lifecycle.resumeAllowed).toBe(false);
    });

    test('unsaved-buffer refusal never begins disposal and permits returning to the old site', async () => {
        const lifecycle = new WorkingLevelLifecycle();
        let disposed = false;
        lifecycle.register(async () => { disposed = true; });
        const removeBuffer = lifecycle.prepare(async () => { throw new Error('Unsaved code buffer'); });
        await expect(lifecycle.close()).rejects.toThrow('Unsaved code buffer');
        expect(disposed).toBe(false);
        expect(lifecycle.resumeAllowed).toBe(true);
        removeBuffer();
        await lifecycle.close();
        expect(disposed).toBe(true);
        expect(lifecycle.resumeAllowed).toBe(false);
    });

    test('an explicit retained-engine pre-disposal attestation permits recovery after strict preparation refusal', async () => {
        const lifecycle = new WorkingLevelLifecycle();
        let isClosing = false;
        lifecycle.register(async () => {
            try { throw new Error('Source conflict'); }
            catch (error) {
                if (isClosing === false) lifecycle.allowResumeBeforeDisposal();
                throw error;
            }
        });
        await expect(lifecycle.close()).rejects.toThrow('Source conflict');
        expect(lifecycle.resumeAllowed).toBe(true);
        isClosing = true;
        await expect(lifecycle.close()).rejects.toThrow('Source conflict');
        expect(lifecycle.resumeAllowed).toBe(false);
    });

    test('a post-disposal refusal stays closed across retries without pre-disposal attestation', async () => {
        const lifecycle = new WorkingLevelLifecycle();
        lifecycle.register(async () => { throw new Error('Flush refused'); });
        await expect(lifecycle.close()).rejects.toThrow('Flush refused');
        expect(lifecycle.resumeAllowed).toBe(false);
        await expect(lifecycle.close()).rejects.toThrow('Flush refused');
        expect(lifecycle.resumeAllowed).toBe(false);
    });
});
