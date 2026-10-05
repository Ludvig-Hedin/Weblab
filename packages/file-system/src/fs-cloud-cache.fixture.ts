/** Runs under Node because the installed ZenFS runtime cannot load under Bun. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ZenFS, { mounts } from '@zenfs/core';
import { FileSystem } from './fs';

const cloudMounts = () => [...mounts.keys()].filter((key) => key.startsWith('/__weblab_cloud_cache_'));

test('cloud instances hydrate independently without writing persistent parent directories', async () => {
    const baseline = cloudMounts().length;
    const first = new FileSystem('/same-project/same-branch', { ephemeral: true });
    const second = new FileSystem('/same-project/same-branch', { ephemeral: true });
    const one = first.initialize();
    assert.equal(first.initialize(), one, 'initialization is single-flight');
    await Promise.all([one, second.initialize()]);
    try {
        assert.equal(cloudMounts().length, baseline + 2);
        assert.equal(first.rootPath, '/same-project/same-branch');
        assert.equal(await ZenFS.promises.exists('/same-project'), false);
        await first.writeFile('src/app/page.tsx', 'first draft');
        await second.writeFile('src/app/page.tsx', 'second draft');
        assert.equal(await first.readFile('src/app/page.tsx'), 'first draft');
        assert.equal(await second.readFile('src/app/page.tsx'), 'second draft');
        await first.cleanup();
        assert.equal(cloudMounts().length, baseline + 1);
        await assert.rejects(first.readFile('src/app/page.tsx'), /closed/);
        await assert.rejects(first.writeFile('other.txt', 'after close'), /closed/);
        await assert.rejects(first.initialize(), /closed/);
        assert.equal(await second.readFile('src/app/page.tsx'), 'second draft');
        await first.cleanup();
        assert.equal(cloudMounts().length, baseline + 1);
    } finally { await Promise.all([first.cleanup(), second.cleanup()]); }
    assert.equal(cloudMounts().length, baseline);
});

test('closing during initialization releases only its own mount and never reopens admission', async () => {
    const baseline = cloudMounts().length;
    const fs = new FileSystem('/close-project/branch', { ephemeral: true });
    const initializing = fs.initialize();
    const failure = assert.rejects(initializing, /closed/);
    const closing = fs.cleanup();
    await Promise.all([closing, failure]);
    assert.equal(cloudMounts().length, baseline);
    await assert.rejects(fs.initialize(), /closed/);
});

test('a failed initialization can retry without leaking a mount', async () => {
    const baseline = cloudMounts().length;
    const fs = new FileSystem('/retry-project/branch', { ephemeral: true });
    const internal = fs as unknown as { initializeStorage: () => Promise<void> };
    const initialize = internal.initializeStorage.bind(fs);
    internal.initializeStorage = async () => { throw new Error('Backend unavailable'); };
    await assert.rejects(fs.initialize(), /Backend unavailable/);
    internal.initializeStorage = initialize;
    await fs.initialize();
    assert.equal(cloudMounts().length, baseline + 1);
    await fs.cleanup();
    assert.equal(cloudMounts().length, baseline);
});

test('cloud creation refuses file over directory without deleting existing data', async () => {
    const fs = new FileSystem('/collision/branch', { ephemeral: true });
    await fs.initialize();
    try {
        await fs.createDirectory('src');
        await fs.writeFile('src/keep.txt', 'keep');
        await assert.rejects(fs.writeFile('src', 'replace directory'), /Cannot replace a directory/);
        await assert.rejects(fs.createFile('src', 'replace directory'), /Cannot replace a directory/);
        assert.equal(await fs.readFile('src/keep.txt'), 'keep');
        assert.equal((await fs.getInfo('src')).isDirectory, true);
        await assert.rejects(fs.createDirectory('src/keep.txt'), /file blocks/);
        assert.equal(await fs.readFile('src/keep.txt'), 'keep');
    } finally { await fs.cleanup(); }
});

test('native cleanup retains its established path and permits its trailing index flush', async () => {
    const fs = new FileSystem('/native-preserved/branch');
    // Use the actual root backend without requiring browser IndexedDB in Node.
    Object.defineProperty(fs, 'backend', { value: ZenFS });
    await ZenFS.promises.mkdir(fs.rootPath, { recursive: true });
    await fs.writeFile('source.txt', 'native source');
    await fs.cleanup();
    await fs.writeFile('.weblab/index.json', '{}');
    assert.equal(fs.rootPath, '/native-preserved/branch');
    assert.equal(await fs.readFile('source.txt'), 'native source');
    assert.equal(await fs.readFile('.weblab/index.json'), '{}');
    await ZenFS.promises.rm('/native-preserved', { recursive: true });
});
