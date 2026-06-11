import { describe, expect, it } from 'bun:test';

import { CodeProviderSync } from './sync-engine';

/**
 * Regression tests for the destructive initial-sync bug: a transient
 * provider.listFiles failure during sandbox boot used to return an empty
 * listing, which pullFromSandbox interpreted as "the sandbox deleted every
 * file" — wiping the local FS and (via the local watcher echo) destroying
 * files like `public/_weblab/interactions.json` in the real sandbox.
 *
 * The mocks below implement just enough of Provider / CodeFileSystem for
 * `start()` to run the pull + watch-setup path.
 */

interface MockEntry {
    path: string;
    type: 'file' | 'directory';
}

function createMockFs(entries: MockEntry[]) {
    const deletedFiles: string[] = [];
    const deletedDirs: string[] = [];
    const written: string[] = [];
    return {
        rootPath: '/test/branch',
        deletedFiles,
        deletedDirs,
        written,
        listAll: async () => entries,
        deleteFile: async (path: string) => {
            deletedFiles.push(path);
        },
        deleteDirectory: async (path: string) => {
            deletedDirs.push(path);
        },
        createDirectory: async () => undefined,
        writeFile: async (path: string) => {
            written.push(path);
        },
        listFiles: async () => [] as string[],
        readFile: async () => '',
        exists: async () => false,
        getInfo: async () => ({ isDirectory: false }),
        watchDirectory: () => () => undefined,
    };
}

function createMockProvider(opts: {
    listFiles: (args: { args: { path: string } }) => Promise<{
        files: Array<{ name: string; type: 'file' | 'directory' }>;
    }>;
}) {
    const deletedInSandbox: string[] = [];
    return {
        deletedInSandbox,
        listFiles: opts.listFiles,
        readFile: async () => ({ file: { type: 'text', content: 'x' } }),
        writeFile: async () => undefined,
        deleteFiles: async ({ args }: { args: { path: string } }) => {
            deletedInSandbox.push(args.path);
        },
        createDirectory: async () => undefined,
        renameFile: async () => undefined,
        statFile: async () => ({ type: 'file' }),
        watchFiles: async () => ({ watcher: { stop: async () => undefined } }),
    };
}

function getSync(provider: unknown, fs: unknown, key: string): CodeProviderSync {
    return CodeProviderSync.getInstance(
        provider as never,
        fs as never,
        key,
        // Unique sandboxId per test (via `key`) so the static instance
        // registry can't leak one test's sync into another.
    );
}

describe('CodeProviderSync initial pull safety', () => {
    it('does NOT delete local files when the sandbox listing throws (incomplete)', async () => {
        const fs = createMockFs([
            { path: '/public', type: 'directory' },
            { path: '/public/_weblab/interactions.json', type: 'file' },
            { path: '/app/page.tsx', type: 'file' },
        ]);
        const provider = createMockProvider({
            listFiles: async () => {
                throw new Error('sandbox still booting');
            },
        });

        const sync = getSync(provider, fs, 'sbx-incomplete');
        await sync.start();
        sync.stop();
        sync.release();

        expect(fs.deletedFiles).toEqual([]);
        expect(fs.deletedDirs).toEqual([]);
    });

    it('does NOT delete local files when the sandbox listing is empty', async () => {
        const fs = createMockFs([
            { path: '/app/page.tsx', type: 'file' },
            { path: '/package.json', type: 'file' },
        ]);
        const provider = createMockProvider({
            listFiles: async () => ({ files: [] }),
        });

        const sync = getSync(provider, fs, 'sbx-empty');
        await sync.start();
        sync.stop();
        sync.release();

        expect(fs.deletedFiles).toEqual([]);
        expect(fs.deletedDirs).toEqual([]);
    });

    it('deletes local-only files when the sandbox listing is complete', async () => {
        const fs = createMockFs([
            { path: '/package.json', type: 'file' },
            { path: '/stale-local-only.ts', type: 'file' },
        ]);
        const provider = createMockProvider({
            listFiles: async ({ args }) => {
                if (args.path === './') {
                    return { files: [{ name: 'package.json', type: 'file' }] };
                }
                return { files: [] };
            },
        });

        const sync = getSync(provider, fs, 'sbx-complete');
        await sync.start();
        sync.stop();
        sync.release();

        expect(fs.deletedFiles).toEqual(['/stale-local-only.ts']);
    });

    it('suppresses the local-watcher echo of a sync-initiated delete', async () => {
        let watcherCallback:
            | ((event: {
                  path: string;
                  type: 'create' | 'update' | 'delete' | 'rename';
              }) => Promise<void>)
            | null = null;

        const fs = createMockFs([
            { path: '/package.json', type: 'file' },
            { path: '/public', type: 'directory' },
            { path: '/public/_weblab/interactions.json', type: 'file' },
        ]);
        fs.watchDirectory = ((_path: string, cb: typeof watcherCallback) => {
            watcherCallback = cb;
            return () => undefined;
        }) as never;

        // Sandbox listing is complete but lacks `public` → sync deletes it
        // locally. The subsequent watcher events must NOT reach the provider.
        const provider = createMockProvider({
            listFiles: async ({ args }) => {
                if (args.path === './') {
                    return { files: [{ name: 'package.json', type: 'file' }] };
                }
                return { files: [] };
            },
        });

        const sync = getSync(provider, fs, 'sbx-echo');
        await sync.start();

        expect(fs.deletedDirs).toContain('/public');
        expect(watcherCallback).not.toBeNull();

        // Simulate the ZenFS watcher reporting the deletes the sync just made.
        await watcherCallback!({ path: '/public/_weblab/interactions.json', type: 'delete' });
        await watcherCallback!({ path: '/public', type: 'delete' });

        sync.stop();
        sync.release();

        expect(provider.deletedInSandbox).toEqual([]);
    });

    it('pushes a genuine user-initiated local delete to the sandbox', async () => {
        let watcherCallback:
            | ((event: {
                  path: string;
                  type: 'create' | 'update' | 'delete' | 'rename';
              }) => Promise<void>)
            | null = null;

        const fs = createMockFs([{ path: '/package.json', type: 'file' }]);
        fs.watchDirectory = ((_path: string, cb: typeof watcherCallback) => {
            watcherCallback = cb;
            return () => undefined;
        }) as never;

        const provider = createMockProvider({
            listFiles: async ({ args }) => {
                if (args.path === './') {
                    return { files: [{ name: 'package.json', type: 'file' }] };
                }
                return { files: [] };
            },
        });

        const sync = getSync(provider, fs, 'sbx-user-delete');
        await sync.start();

        await watcherCallback!({ path: '/old-component.tsx', type: 'delete' });

        sync.stop();
        sync.release();

        expect(provider.deletedInSandbox).toEqual(['old-component.tsx']);
    });
});
