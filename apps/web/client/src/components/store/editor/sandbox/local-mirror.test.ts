import { describe, expect, test } from 'bun:test';

import type { NodeFsProvider, WatchEvent } from '@weblab/code-provider';
import type { CodeFileSystem } from '@weblab/file-system';

import { LocalMirror } from './local-mirror';

describe('local disk mirror', () => {
    test('opening reads source verbatim and never writes to disk', async () => {
        const diskWrites: string[] = [];
        const snapshots: Array<Array<{ path: string; content: string }>> = [];
        const provider = {
            listFiles: async ({ args }: { args: { path: string } }) => ({
                files: args.path === ''
                    ? [
                        { name: 'src', type: 'directory', isSymlink: false },
                        { name: '.git', type: 'directory', isSymlink: false },
                    ]
                    : [{ name: 'page.tsx', type: 'file', isSymlink: false }],
            }),
            readFileWithHash: async () => ({ content: '<main>Hello</main>', sha256: 'a'.repeat(64) }),
            writeFileIfUnchanged: async (path: string) => {
                diskWrites.push(path);
                return { sha256: 'b'.repeat(64) };
            },
            watchFiles: async () => ({ watcher: { stop: async () => undefined } }),
        } as unknown as NodeFsProvider;
        let localWrite: ((path: string, content: string) => Promise<void>) | undefined;
        const fs = {
            replaceLocalSnapshot: async (files: Array<{ path: string; content: string }>) => {
                snapshots.push(files);
            },
            setLocalWriteHandler: (write: typeof localWrite) => { localWrite = write; },
        } as unknown as CodeFileSystem;
        const mirror = new LocalMirror(provider, fs);

        await mirror.start();
        const openedRevision = mirror.ownRevision();
        expect(snapshots).toEqual([[{ path: 'src/page.tsx', content: '<main>Hello</main>' }]]);
        expect(diskWrites).toEqual([]);

        await localWrite?.('src/page.tsx', '<main>Edited</main>');
        expect(diskWrites).toEqual(['src/page.tsx']);
        expect(mirror.ownRevision()).not.toBe(openedRevision);
        await mirror.stop();
    });

    test('an external change refreshes the in-memory file', async () => {
        let onFileChange: ((event: WatchEvent) => Promise<void>) | undefined;
        let version = 'first';
        const refreshed: string[] = [];
        const provider = {
            listFiles: async () => ({ files: [{ name: 'page.tsx', type: 'file', isSymlink: false }] }),
            readFileWithHash: async () => ({ content: version, sha256: version }),
            watchFiles: async ({ onFileChange: callback }: {
                onFileChange: (event: WatchEvent) => Promise<void>;
            }) => {
                onFileChange = callback;
                return { watcher: { stop: async () => undefined } };
            },
        } as unknown as NodeFsProvider;
        const fs = {
            replaceLocalSnapshot: async () => undefined,
            setLocalWriteHandler: () => undefined,
            replaceLocalFile: async (_path: string, content: string) => { refreshed.push(content); },
        } as unknown as CodeFileSystem;
        const mirror = new LocalMirror(provider, fs);

        await mirror.start();
        const openedVersion = mirror.sourceVersion();
        const openedRevision = mirror.externalRevision();
        version = 'external edit';
        await onFileChange?.({ type: 'change', paths: ['page.tsx'] });
        expect(refreshed).toEqual(['external edit']);
        expect(mirror.sourceVersion()).not.toBe(openedVersion);
        expect(mirror.externalRevision()).not.toBe(openedRevision);
        await mirror.stop();
    });

    test('a delayed remove event keeps a file recreated by an atomic save', async () => {
        let onFileChange: ((event: WatchEvent) => Promise<void>) | undefined;
        let version = 'first';
        const removed: string[] = [];
        const refreshed: string[] = [];
        const provider = {
            listFiles: async () => ({ files: [{ name: 'page.tsx', type: 'file', isSymlink: false }] }),
            readFileWithHash: async () => ({ content: version, sha256: version }),
            watchFiles: async ({ onFileChange: callback }: {
                onFileChange: (event: WatchEvent) => Promise<void>;
            }) => {
                onFileChange = callback;
                return { watcher: { stop: async () => undefined } };
            },
        } as unknown as NodeFsProvider;
        const fs = {
            replaceLocalSnapshot: async () => undefined,
            setLocalWriteHandler: () => undefined,
            replaceLocalFile: async (_path: string, content: string) => { refreshed.push(content); },
            removeLocalFile: async (path: string) => { removed.push(path); },
        } as unknown as CodeFileSystem;
        const mirror = new LocalMirror(provider, fs);
        await mirror.start();
        version = 'replacement';
        await onFileChange?.({ type: 'remove', paths: ['page.tsx'] });
        expect(refreshed).toEqual(['replacement']);
        expect(removed).toEqual([]);
        await mirror.stop();
    });

    test('a save begun before an external refresh keeps its original disk baseline', async () => {
        let onFileChange: ((event: WatchEvent) => Promise<void>) | undefined;
        let localWrite: ((path: string, content: string) => Promise<void>) | undefined;
        let diskContent = 'first';
        let diskHash = 'first-hash';
        const expectedHashes: Array<string | null> = [];
        const refreshed: string[] = [];
        const provider = {
            listFiles: async () => ({ files: [{ name: 'page.tsx', type: 'file', isSymlink: false }] }),
            readFileWithHash: async () => ({ content: diskContent, sha256: diskHash }),
            writeFileIfUnchanged: async (
                _path: string,
                content: string,
                expectedSha256: string | null,
            ) => {
                expectedHashes.push(expectedSha256);
                if (expectedSha256 !== diskHash) throw new Error('File changed on disk');
                diskContent = content;
                diskHash = 'editor-hash';
                return { sha256: diskHash };
            },
            watchFiles: async ({ onFileChange: callback }: {
                onFileChange: (event: WatchEvent) => Promise<void>;
            }) => {
                onFileChange = callback;
                return { watcher: { stop: async () => undefined } };
            },
        } as unknown as NodeFsProvider;
        const fs = {
            replaceLocalSnapshot: async () => undefined,
            setLocalWriteHandler: (write: typeof localWrite) => { localWrite = write; },
            replaceLocalFile: async (_path: string, content: string) => { refreshed.push(content); },
        } as unknown as CodeFileSystem;
        const mirror = new LocalMirror(provider, fs);

        await mirror.start();
        const staleEdit = 'designer edit based on first';
        diskContent = 'external edit';
        diskHash = 'external-hash';
        await onFileChange?.({ type: 'change', paths: ['page.tsx'] });
        expect(refreshed).toEqual(['external edit']);

        await expect(localWrite?.('page.tsx', staleEdit)).rejects.toThrow('File changed on disk');
        expect(expectedHashes).toEqual(['first-hash']);
        expect(diskContent).toBe('external edit');
        await mirror.stop();
    });
});
