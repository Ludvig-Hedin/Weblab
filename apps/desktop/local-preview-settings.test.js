import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
    createPrivateWorkingCopy, getPreviewSettings, grantLocalRoot, installDependencies,
    planPrivateHandoff, previewRequestHeaders, projectDevEnvironment, setPreviewSettings, startDevServer,
    stopDevServer, stopPreview,
} from './weblab-local.js';

const SETTINGS = { NEXT_PUBLIC_SANITY_PROJECT_ID: 'qa123abc', NEXT_PUBLIC_SANITY_DATASET: 'weblab-qa' };
let directory, source, base, copy, settingsFile;

beforeAll(async () => {
    directory = await fsp.mkdtemp(join(await fsp.realpath(tmpdir()), 'weblab-preview-settings-'));
    source = join(directory, 'original');
    base = join(directory, 'private');
    await fsp.mkdir(source);
    await fsp.mkdir(base, { mode: 0o700 });
    await fsp.writeFile(join(source, 'index.html'), '<html><body>Unchanged original</body></html>');
    const git = (...args) => execFileSync('git', args, { cwd: source, stdio: 'pipe', timeout: 5000 });
    git('init', '-q');
    git('add', 'index.html');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture');
    source = await grantLocalRoot(source);
    copy = await createPrivateWorkingCopy(source, base);
    settingsFile = join(base, copy.copyId, 'preview-settings.json');
});

afterAll(async () => {
    if (copy) await stopDevServer(copy.rootPath);
    if (directory) await fsp.rm(directory, { recursive: true, force: true });
});

function gate() {
    let release, reached;
    const waiting = new Promise((resolve) => { release = resolve; });
    const entered = new Promise((resolve) => { reached = resolve; });
    return { waiting, entered, release, reached };
}

async function enteredWithin(promise) {
    let timer;
    try {
        await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Fixture barrier not reached')), 3000);
        })]);
    } finally { clearTimeout(timer); }
}

test('public settings read back from disk outside source, clear, and never enter handoff', async () => {
    expect(await getPreviewSettings(copy.rootPath, base)).toBeNull();
    await setPreviewSettings(copy.rootPath, SETTINGS, base);
    expect(await getPreviewSettings(copy.rootPath, base)).toEqual(SETTINGS);
    expect((await fsp.stat(settingsFile)).mode & 0o777).toBe(0o600);
    const record = JSON.parse(await fsp.readFile(settingsFile, 'utf8'));
    expect(record).toEqual({ version: 1, copyId: copy.copyId, settings: SETTINGS });
    const env = projectDevEnvironment(copy.rootPath, 31847, null, await getPreviewSettings(copy.rootPath, base));
    expect(env).toMatchObject({ ...SETTINGS, PORT: '31847' });
    expect(env).not.toHaveProperty('SANITY_API_READ_TOKEN');
    expect(env).not.toHaveProperty('CLERK_SECRET_KEY');
    expect((await planPrivateHandoff(copy.rootPath, base)).changedFiles).toEqual([]);
    expect(await fsp.readFile(join(source, 'index.html'), 'utf8')).toBe('<html><body>Unchanged original</body></html>');
    expect((await fsp.readdir(copy.rootPath)).some((name) => name.startsWith('.env'))).toBe(false);
    await setPreviewSettings(copy.rootPath, null, base);
    expect(await getPreviewSettings(copy.rootPath, base)).toBeNull();
    expect(projectDevEnvironment(copy.rootPath, 31847)).not.toHaveProperty('NEXT_PUBLIC_SANITY_PROJECT_ID');
});

test('allowlist rejects partial, secret, malformed and additional settings without changing saved values', async () => {
    await setPreviewSettings(copy.rootPath, SETTINGS, base);
    for (const invalid of [
        {}, { NEXT_PUBLIC_SANITY_PROJECT_ID: 'qa123abc' },
        { ...SETTINGS, SANITY_API_READ_TOKEN: 'fixture-not-a-token' },
        { ...SETTINGS, PORT: '9999' },
        { ...SETTINGS, NEXT_PUBLIC_SANITY_PROJECT_ID: '../escape' },
        { ...SETTINGS, NEXT_PUBLIC_SANITY_DATASET: 'qa\nOTHER=value' },
        { ...SETTINGS, NEXT_PUBLIC_SANITY_DATASET: '' }, [], undefined,
    ]) {
        await expect(setPreviewSettings(copy.rootPath, invalid, base)).rejects.toThrow('Only public Sanity settings');
    }
    expect(await getPreviewSettings(copy.rootPath, base)).toEqual(SETTINGS);
    await expect(getPreviewSettings(source, base)).rejects.toThrow('original_git_root_is_read_only');
    await expect(setPreviewSettings(source, SETTINGS, base)).rejects.toThrow('original_git_root_is_read_only');
});

test('settings reject unsafe permissions, foreign copy metadata, oversized data and symlinks', async () => {
    const good = await fsp.readFile(settingsFile);
    try {
        await fsp.chmod(settingsFile, 0o644);
        await expect(getPreviewSettings(copy.rootPath, base)).rejects.toThrow('settings file is unsafe');
        await fsp.chmod(settingsFile, 0o600);
        await fsp.writeFile(settingsFile, JSON.stringify({ version: 1, copyId: 'another-copy', settings: SETTINGS }));
        await expect(setPreviewSettings(copy.rootPath, null, base)).rejects.toThrow('do not match this copy');
        await fsp.writeFile(settingsFile, ' '.repeat(4097));
        await expect(getPreviewSettings(copy.rootPath, base)).rejects.toThrow('file_size_limit');
        await fsp.unlink(settingsFile);
        await fsp.symlink(join(source, 'index.html'), settingsFile);
        await expect(getPreviewSettings(copy.rootPath, base)).rejects.toThrow('symlink_path');
        await expect(setPreviewSettings(copy.rootPath, null, base)).rejects.toThrow('symlink_path');
        expect(await fsp.readFile(join(source, 'index.html'), 'utf8')).toContain('Unchanged original');
    } finally {
        await fsp.rm(settingsFile, { force: true });
        await fsp.writeFile(settingsFile, good, { mode: 0o600 });
    }
});

test('settings reject a file grown during the real open/read/stat sequence', async () => {
    const good = await fsp.readFile(settingsFile);
    const open = fsp.open;
    let injected = false;
    const spy = spyOn(fsp, 'open').mockImplementation(async (...args) => {
        const handle = await open(...args);
        if (args[0] === settingsFile && !injected) {
            injected = true;
            const read = handle.readFile.bind(handle);
            handle.readFile = async (...readArgs) => {
                await fsp.appendFile(settingsFile, ' ');
                return read(...readArgs);
            };
        }
        return handle;
    });
    try {
        await expect(getPreviewSettings(copy.rootPath, base)).rejects.toThrow('file_changed_during_read');
    } finally {
        spy.mockRestore();
        await fsp.writeFile(settingsFile, good);
    }
});

test('queued setters exclude starts and installs throughout atomic saving, then persist the latest settings', async () => {
    const barrier = gate();
    const open = fsp.open;
    let intercepted = false;
    const spy = spyOn(fsp, 'open').mockImplementation(async (...args) => {
        if (typeof args[0] === 'string' && basename(args[0]).endsWith('.preview-settings.json.tmp') && !intercepted) {
            intercepted = true;
            barrier.reached();
            await barrier.waiting;
        }
        return open(...args);
    });
    const first = setPreviewSettings(copy.rootPath, SETTINGS, base);
    let second;
    try {
        await enteredWithin(barrier.entered);
        second = setPreviewSettings(copy.rootPath, { ...SETTINGS, NEXT_PUBLIC_SANITY_DATASET: 'latest' }, base);
        expect((await startDevServer(copy.rootPath, null, null, () => null)).error).toContain('settings are being saved');
        expect((await installDependencies(copy.rootPath, base)).error).toContain('settings are being saved');
    } finally {
        barrier.release();
        await Promise.allSettled([first, second]);
        spy.mockRestore();
    }
    await first;
    await second;
    expect((await getPreviewSettings(copy.rootPath, base)).NEXT_PUBLIC_SANITY_DATASET).toBe('latest');
});

test('stop and save refuse a pending start, and live preview must stop before settings change', async () => {
    const barrier = gate();
    const readdir = fsp.readdir;
    let intercepted = false;
    const spy = spyOn(fsp, 'readdir').mockImplementation(async (...args) => {
        if (args[0] === copy.rootPath && !intercepted) {
            intercepted = true;
            barrier.reached();
            await barrier.waiting;
        }
        return readdir(...args);
    });
    const starting = startDevServer(copy.rootPath, null, null, () => null);
    try {
        await enteredWithin(barrier.entered);
        expect((await stopPreview(copy.rootPath)).error).toContain('still starting');
        await expect(setPreviewSettings(copy.rootPath, SETTINGS, base)).rejects.toThrow('still starting');
    } finally {
        barrier.release();
        spy.mockRestore();
    }
    try {
        expect(await starting).toMatchObject({ url: expect.stringMatching(/^http:\/\/localhost:\d+$/) });
        await expect(setPreviewSettings(copy.rootPath, SETTINGS, base)).rejects.toThrow('Stop the preview');
        expect(await stopPreview(copy.rootPath)).toEqual({ success: true });
        await setPreviewSettings(copy.rootPath, SETTINGS, base);
    } finally { await stopDevServer(copy.rootPath); }
});

test('public-only .env files remain forbidden in project source even with separate settings', async () => {
    const envFile = join(copy.rootPath, '.env.local');
    await fsp.writeFile(envFile, 'NEXT_PUBLIC_SANITY_PROJECT_ID=qa123abc\n');
    try {
        expect((await startDevServer(copy.rootPath, null, null, () => null)).error).toContain('Live credentials are not allowed');
        await expect(getPreviewSettings(copy.rootPath, base)).rejects.toThrow('Live credentials are not allowed');
        await expect(planPrivateHandoff(copy.rootPath, base)).rejects.toThrow('credential');
    } finally { await fsp.unlink(envFile); }
});

test('only live owned private preview iframe documents get no-cache, preserving every other header', async () => {
    const requestHeaders = { 'cache-control': 'max-age=0', 'CACHE-Control': 'stale', Accept: 'text/html', Cookie: 'fixture=value' };
    const starting = await startDevServer(copy.rootPath, null, null, () => null);
    expect(starting.error).toBeUndefined();
    const details = { method: 'GET', resourceType: 'subFrame', url: starting.url + '/se', requestHeaders };
    try {
        const fresh = previewRequestHeaders(details);
        expect(fresh).toEqual({ Accept: 'text/html', Cookie: 'fixture=value', 'Cache-Control': 'no-cache' });
        expect(fresh).not.toBe(requestHeaders);
        expect(requestHeaders['cache-control']).toBe('max-age=0');
        expect(previewRequestHeaders({ ...details, url: details.url.replace('localhost', '127.0.0.1') })).toEqual(fresh);
        for (const changed of [
            { method: 'POST' }, { resourceType: 'mainFrame' }, { resourceType: 'xhr' },
            { resourceType: 'fetch' }, { resourceType: 'script' }, { resourceType: 'stylesheet' },
            { resourceType: 'image' }, { url: 'http://localhost/se' },
            { url: 'http://localhost:1/se' }, { url: 'https://localhost:' + starting.port + '/se' },
            { url: 'http://example.invalid:' + starting.port + '/se' },
            { url: 'http://localhost.example.invalid:' + starting.port + '/se' },
            { url: 'http://user:pass@localhost:' + starting.port + '/se' },
            { url: 'http://[::1]:' + starting.port + '/se' }, { url: 'not a URL' },
        ]) expect(previewRequestHeaders({ ...details, ...changed })).toBe(requestHeaders);
    } finally { await stopDevServer(copy.rootPath); }
    expect(previewRequestHeaders(details)).toBe(requestHeaders);
});

test('provider forwards only its captured root and surfaces failed save/stop acknowledgements', async () => {
    const { NodeFsProvider } = await import('../../packages/code-provider/src/providers/nodefs/index');
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'weblabNative');
    const calls = [];
    const localdev = {
        getPreviewSettings: async (root) => { calls.push(root); return { settings: SETTINGS }; },
        setPreviewSettings: async (root, settings) => { calls.push([root, settings]); return { success: true }; },
        stop: async () => ({ error: 'still starting' }),
    };
    Object.defineProperty(globalThis, 'weblabNative', { configurable: true, value: { localdev } });
    try {
        const provider = new NodeFsProvider({ rootPath: copy.rootPath });
        expect(await provider.getPreviewSettings()).toEqual(SETTINGS);
        await provider.setPreviewSettings(null);
        expect(calls).toEqual([copy.rootPath, [copy.rootPath, null]]);
        await expect(provider.stopPreview()).rejects.toThrow('still starting');
        localdev.stop = async () => ({});
        await expect(provider.stopPreview()).rejects.toThrow('did not confirm');
        localdev.stop = async () => ({ success: true });
        await provider.stopPreview();
        localdev.setPreviewSettings = async () => ({ error: 'not saved' });
        await expect(provider.setPreviewSettings(SETTINGS)).rejects.toThrow('not saved');
    } finally {
        if (previous) Object.defineProperty(globalThis, 'weblabNative', previous);
        else delete globalThis.weblabNative;
    }
});
