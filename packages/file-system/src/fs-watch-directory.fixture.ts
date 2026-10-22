/** Actual ZenFS runs under Node, matching fs-cloud-cache.fixture.ts. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ZenFS from '@zenfs/core';
import { FileSystem } from './fs';
import type { FileChangeEvent } from './types';

function deferred() {
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const pause = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, message: string) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) { if (check()) return; await pause(); }
    assert.fail(message);
}

async function fixture() {
    // ZenFS' default root is InMemory. No IndexedDB, native files or providers.
    const root = `/watch-directory-${randomUUID()}`;
    await ZenFS.promises.mkdir(`${root}/child/deep`, { recursive: true });
    await ZenFS.promises.writeFile(`${root}/source.txt`, 'source');
    const fs = new FileSystem(root);
    const watchers: Array<{ path: string; watcher: ReturnType<typeof ZenFS.watch>; closeCalls: number }> = [];
    const holds: Array<{ method: 'readdir' | 'stat'; path: string; entered: ReturnType<typeof deferred>; gate: ReturnType<typeof deferred>; completed: ReturnType<typeof deferred> }> = [];
    const hold = (method: 'readdir' | 'stat', relative = '') => {
        const item = { method, path: root + relative, entered: deferred(), gate: deferred(), completed: deferred() };
        holds.push(item); return item;
    };
    const delay = async (method: 'readdir' | 'stat', path: string) => {
        const at = holds.findIndex(item => item.method === method && item.path === path);
        if (at < 0) return;
        const item = holds.splice(at, 1)[0]!;
        item.entered.resolve();
        try { await item.gate.promise; }
        finally { item.completed.resolve(); }
    };
    const promises = Object.create(ZenFS.promises) as typeof ZenFS.promises;
    Object.defineProperty(promises, 'readdir', { value: (async (path: string) => {
        const entries = await ZenFS.promises.readdir(path);
        await delay('readdir', path); return entries;
    }) as typeof ZenFS.promises.readdir });
    Object.defineProperty(promises, 'stat', { value: (async (path: string) => {
        const stats = await ZenFS.promises.stat(path);
        await delay('stat', path); return stats;
    }) as typeof ZenFS.promises.stat });
    const backend = Object.create(ZenFS) as typeof ZenFS;
    Object.defineProperty(backend, 'promises', { value: promises });
    Object.defineProperty(backend, 'watch', { value: (...args: Parameters<typeof ZenFS.watch>) => {
        const watcher = ZenFS.watch(...args);
        const record = { path: String(args[0]), watcher, closeCalls: 0 };
        const close = watcher.close.bind(watcher);
        watcher.close = () => { record.closeCalls++; close(); };
        watchers.push(record); return watcher;
    } });
    // The sole test seam records real watchers and holds real backend reads.
    Object.defineProperty(fs, 'backend', { value: backend });
    const events: FileChangeEvent[] = [];
    const subscribe = (onEvent = (event: FileChangeEvent) => { events.push(event); }) => fs.watchDirectory('/', onEvent);
    const ready = async (count = 3) => { await until(() => watchers.length === count, 'recursive real watchers not installed'); await pause(20); };
    const dispose = async () => {
        await fs.cleanup();
        assert(watchers.every(record => record.closeCalls === 1), 'each created real watcher closes exactly once');
        await ZenFS.promises.rm(root, { recursive: true, force: true });
    };
    return { fs, root, watchers, hold, events, subscribe, ready, dispose };
}

for (const method of ['readdir', 'stat'] as const) {
    test(`unsubscribe during ${method} prevents late recursive real watchers`, async () => {
        const f = await fixture();
        const held = f.hold(method, method === 'stat' ? '/child' : '');
        const stop = f.subscribe();
        try {
            await held.entered.promise;
            assert.equal(f.watchers.length, 1);
            stop(); stop(); held.gate.resolve(); await held.completed.promise; await pause(40);
            assert.equal(f.watchers.length, 1, 'no watcher created after unsubscribe');
            assert.equal(f.watchers[0]!.closeCalls, 1);
            await ZenFS.promises.writeFile(`${f.root}/child/deep/after.txt`, 'after'); await pause(80);
            assert.deepEqual(f.events, []);
        } finally { held.gate.resolve(); await f.dispose(); }
    });
}

test('unsubscribe cancels queued delivery; independent subscription remains live', async () => {
    const f = await fixture(); const first: FileChangeEvent[] = [], second: FileChangeEvent[] = [];
    const stopFirst = f.subscribe(event => { first.push(event); });
    const stopSecond = f.subscribe(event => { second.push(event); });
    try {
        await f.ready(6);
        await ZenFS.promises.writeFile(`${f.root}/source.txt`, 'changed');
        stopFirst();
        await until(() => second.some(event => event.path === 'source.txt'), 'second subscription lost its delivery'); await pause(60);
        assert.deepEqual(first, []);
        assert.equal(f.watchers.filter(record => record.closeCalls === 0).length, 3);
        const before = second.length;
        await ZenFS.promises.writeFile(`${f.root}/source.txt`, 'again');
        await until(() => second.length > before, 'remaining subscription no longer works');
        stopSecond(); stopSecond();
        await ZenFS.promises.writeFile(`${f.root}/source.txt`, 'after stop'); await pause(80);
        assert.equal(second.length, before + 1);
    } finally { stopFirst(); stopSecond(); await f.dispose(); }
});

for (const rejects of [false, true]) {
    test(`unsubscribe during rename stat suppresses late ${rejects ? 'error' : 'success'} delivery`, async () => {
        const f = await fixture(); const stop = f.subscribe(); let held: ReturnType<typeof f.hold> | null = null;
        try {
            await f.ready(); held = f.hold('stat', '/created');
            await ZenFS.promises.mkdir(`${f.root}/created`); await held.entered.promise;
            stop();
            if (rejects) held.gate.reject(new Error('Controlled stat failure after actual read')); else held.gate.resolve();
            await held.completed.promise; await pause(80);
            assert.deepEqual(f.events, []);
            assert.equal(f.watchers.length, 3, 'late rename cannot create a child watcher');
        } finally { held?.gate.resolve(); stop(); await f.dispose(); }
    });
}

test('callback can synchronously unsubscribe before recursive watch setup', async () => {
    const f = await fixture(); let stop = () => {};
    stop = f.subscribe(event => { f.events.push(event); if (event.type === 'create') stop(); });
    try {
        await f.ready(); await ZenFS.promises.mkdir(`${f.root}/created`);
        await until(() => f.events.length > 0, 'create callback absent'); await pause(40);
        assert.deepEqual(f.events, [{ type: 'create', path: 'created' }]);
        assert.equal(f.watchers.length, 3, 'callback unsubscribe prevents recursive child watch');
    } finally { stop(); await f.dispose(); }
});

test('FileSystem cleanup cancels pending directory setup and preserves native trailing writes', async () => {
    const f = await fixture(); const held = f.hold('readdir'); const stop = f.subscribe();
    try {
        await held.entered.promise; await f.fs.cleanup();
        held.gate.resolve(); await held.completed.promise; await pause(40);
        assert.equal(f.watchers.length, 1);
        assert.equal(f.watchers[0]!.closeCalls, 1);
        await f.fs.writeFile('.weblab/index.json', '{}');
        assert.equal(await f.fs.readFile('.weblab/index.json'), '{}');
        await pause(80); assert.deepEqual(f.events, []);
        stop(); await f.fs.cleanup();
        assert.equal(f.watchers[0]!.closeCalls, 1);
    } finally { held.gate.resolve(); stop(); await f.dispose(); }
});

test('FileSystem cleanup stops established subscriptions and queued callbacks', async () => {
    const f = await fixture(); f.subscribe(); f.subscribe();
    try {
        await f.ready(6); await ZenFS.promises.writeFile(`${f.root}/source.txt`, 'changed');
        await f.fs.cleanup(); await pause(80);
        assert.deepEqual(f.events, []);
        assert.equal(f.watchers.filter(record => record.closeCalls === 1).length, 6);
    } finally { await f.dispose(); }
});
