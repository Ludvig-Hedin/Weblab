import { afterEach, describe, expect, test } from 'bun:test';

import { NodeFsProvider } from './index';

type AnyBridge = { localfs: Record<string, unknown>; localdev: Record<string, unknown> };

/**
 * Install an in-memory mock of the desktop bridge (`window.weblabNative`) so the
 * renderer-side NodeFsProvider can be exercised without Electron. Mirrors the
 * shape produced by apps/desktop/preload.js.
 */
function installMockBridge(seed: Record<string, string> = {}) {
    const files: Record<string, string> = { ...seed };
    const watchListeners: Array<(p: { watchId: string; event: unknown }) => void> = [];

    const bridge = {
        localfs: {
            async read(_root: string, path: string) {
                if (path in files) return { content: files[path] };
                return { error: 'not_found', notFound: true };
            },
            async write(_root: string, path: string, content: string | Uint8Array) {
                files[path] =
                    typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
                return { success: true };
            },
            async list(_root: string, path: string) {
                const prefix = path === '.' || path === '' ? '' : path.replace(/\/?$/, '/');
                const names = new Set<string>();
                for (const f of Object.keys(files)) {
                    if (!f.startsWith(prefix)) continue;
                    const rest = f.slice(prefix.length).split('/')[0];
                    if (rest) names.add(rest);
                }
                return {
                    files: [...names].map((name) => ({
                        name,
                        type: 'file' as const,
                        isSymlink: false,
                    })),
                };
            },
            async stat(_root: string, path: string) {
                if (path in files) return { type: 'file' as const, size: files[path].length };
                return { error: 'not_found', notFound: true };
            },
            async mkdir() {
                return { success: true };
            },
            async remove(_root: string, path: string) {
                delete files[path];
                return { success: true };
            },
            async rename(_root: string, oldPath: string, newPath: string) {
                files[newPath] = files[oldPath];
                delete files[oldPath];
                return { success: true };
            },
            async copy(_root: string, src: string, dst: string) {
                files[dst] = files[src];
                return { success: true };
            },
            async watchStart() {
                return { watchId: 'w1' };
            },
            async watchStop() {
                return { success: true };
            },
            onWatchEvent(listener: (p: { watchId: string; event: unknown }) => void) {
                watchListeners.push(listener);
                return () => {
                    const i = watchListeners.indexOf(listener);
                    if (i >= 0) watchListeners.splice(i, 1);
                };
            },
            __emit(watchId: string, event: unknown) {
                for (const l of [...watchListeners]) l({ watchId, event });
            },
        },
        localdev: {
            async start() {
                return { port: 4321, url: 'http://localhost:4321' };
            },
            async stop() {
                return { success: true };
            },
            async status() {
                return { running: true, port: 4321, url: 'http://localhost:4321' };
            },
            async run(_root: string, command: string) {
                if (command.includes('git status')) {
                    return { output: ' M src/a.tsx\n?? src/b.tsx\n', exitCode: 0 };
                }
                return { output: '', exitCode: 0 };
            },
            onOutput() {
                return () => {};
            },
        },
    };
    (globalThis as unknown as { weblabNative?: AnyBridge }).weblabNative = bridge as unknown as AnyBridge;
    return bridge;
}

describe('NodeFsProvider (local-first)', () => {
    afterEach(() => {
        delete (globalThis as unknown as { weblabNative?: unknown }).weblabNative;
    });

    test('read/write round-trip through the bridge', async () => {
        installMockBridge({ 'src/app.tsx': 'hello' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const read = await p.readFile({ args: { path: 'src/app.tsx' } });
        expect(read.file.content).toBe('hello');
        expect(read.file.toString()).toBe('hello');

        await p.writeFile({ args: { path: 'src/new.tsx', content: 'world' } });
        const read2 = await p.readFile({ args: { path: 'src/new.tsx' } });
        expect(read2.file.content).toBe('world');
    });

    test('readFile surfaces a clear not-found error', async () => {
        installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await expect(p.readFile({ args: { path: 'missing.ts' } })).rejects.toThrow(/File not found/);
    });

    test('listFiles returns top-level entries', async () => {
        installMockBridge({ 'a.ts': '1', 'b.ts': '2' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const { files } = await p.listFiles({ args: { path: '.' } });
        expect(files.map((f) => f.name).sort()).toEqual(['a.ts', 'b.ts']);
    });

    test('createSession returns the local preview URL', async () => {
        installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const session = await p.createSession({ args: { id: 'x' } });
        expect(session.previewUrl).toBe('http://localhost:4321');
    });

    test('gitStatus parses porcelain output', async () => {
        installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const { changedFiles } = await p.gitStatus({});
        expect(changedFiles).toEqual(['src/a.tsx', 'src/b.tsx']);
    });

    test('missing rootPath throws a clear error', async () => {
        installMockBridge({});
        const p = new NodeFsProvider({ rootPath: null });
        await expect(p.writeFile({ args: { path: 'x', content: 'y' } })).rejects.toThrow(/rootPath/);
    });

    test('off-desktop (no bridge) throws a clear error', async () => {
        delete (globalThis as unknown as { weblabNative?: unknown }).weblabNative;
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await expect(p.readFile({ args: { path: 'x' } })).rejects.toThrow(/desktop app/);
    });

    test('watchFiles delivers external change events to the callback', async () => {
        const bridge = installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const events: Array<{ type: string; paths: string[] }> = [];
        const { watcher } = await p.watchFiles({
            args: { path: '.' },
            onFileChange: async (e) => {
                events.push(e);
            },
        });
        (bridge.localfs as unknown as { __emit: (id: string, e: unknown) => void }).__emit('w1', {
            type: 'change',
            paths: ['src/x.tsx'],
        });
        await new Promise((r) => setTimeout(r, 0));
        expect(events).toHaveLength(1);
        expect(events[0]?.type).toBe('change');
        await watcher.stop();
    });
});
