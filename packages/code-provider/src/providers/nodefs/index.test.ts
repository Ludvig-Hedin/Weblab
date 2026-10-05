import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { LocalFileConflictError, NodeFsProvider } from './index';

type AnyBridge = { localfs: Record<string, unknown>; localdev: Record<string, unknown> };
const hashFor = (content: string) => createHash('sha256').update(content).digest('hex');

/**
 * Install an in-memory mock of the desktop bridge (`window.weblabNative`) so the
 * renderer-side NodeFsProvider can be exercised without Electron. Mirrors the
 * shape produced by apps/desktop/preload.js.
 */
function installMockBridge(seed: Record<string, string> = {}) {
    const files: Record<string, string> = { ...seed };
    const createdPaths = new Set<string>();
    const createdDirectories = new Set<string>();
    const watchListeners: Array<(p: { watchId: string; event: unknown }) => void> = [];

    const bridge = {
        localfs: {
            async createPrivateWorkingCopy(sourceRoot: string) {
                return {
                    rootPath: '/private/project', sourceRootPath: sourceRoot,
                    copyId: 'copy-1', reused: false, previewNeedsInstall: true,
                    excludedPaths: ['node_modules'],
                };
            },
            async planPrivateHandoff() {
                return {
                    copyId: 'copy-1', sourceRootPath: '/original',
                    changedFiles: [{ path: 'index.html', original: 'before', updated: 'after' }],
                    unsupportedChanges: [], sourceChanged: false, planToken: 'a'.repeat(64),
                };
            },
            async exportPrivateHandoff() {
                return { patchPath: '/private/handoff.patch', changedFiles: ['index.html'] };
            },
            async read(_root: string, path: string) {
                if (path in files) return { content: files[path], sha256: hashFor(files[path] ?? '') };
                return { error: 'not_found', notFound: true };
            },
            async writeIfUnchanged(
                _root: string,
                path: string,
                content: string,
                expectedSha256: string | null,
            ) {
                const currentHash = path in files ? hashFor(files[path] ?? '') : null;
                if (currentHash !== expectedSha256) {
                    return { conflict: true, hash: currentHash };
                }
                files[path] = content;
                if (expectedSha256 === null) createdPaths.add(path);
                else createdPaths.delete(path);
                return { success: true, hash: hashFor(content) };
            },
            async deleteFileIfUnchanged(_root: string, path: string, expectedSha256: string) {
                if (!createdPaths.has(path)) return { error: 'file_not_recently_created_by_weblab' };
                const currentHash = path in files ? hashFor(files[path] ?? '') : null;
                if (currentHash !== expectedSha256) return { conflict: true, hash: currentHash };
                delete files[path];
                createdPaths.delete(path);
                return { success: true };
            },
            async createPreparationPublicDirectory() {
                if (createdDirectories.has('public')) return { error: 'public_directory_already_exists' };
                createdDirectories.add('public');
                return { success: true };
            },
            async deletePreparationPublicDirectory() {
                if (!createdDirectories.has('public')) return { error: 'directory_not_recently_created_by_weblab' };
                if (Object.keys(files).some((path) => path.startsWith('public/'))) {
                    return { error: 'public_directory_not_empty' };
                }
                createdDirectories.delete('public');
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
                if (path in files)
                    return { type: 'file' as const, size: (files[path] ?? '').length };
                return { error: 'not_found', notFound: true };
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
            async gitInfo() {
                return { isRepositoryRoot: true, branch: 'main' };
            },
            async gitStatus() {
                return { changedFiles: ['src/a.tsx', 'src/b.tsx'] };
            },
            onOutput() {
                return () => undefined;
            },
        },
    };
    (globalThis as unknown as { weblabNative?: AnyBridge }).weblabNative =
        bridge as unknown as AnyBridge;
    return {
        ...bridge,
        externalWrite(path: string, content: string) {
            files[path] = content;
        },
    };
}

describe('NodeFsProvider (local-first)', () => {
    afterEach(() => {
        delete (globalThis as unknown as { weblabNative?: unknown }).weblabNative;
    });

    test('read and guarded write round-trip through the bridge', async () => {
        installMockBridge({ 'src/app.tsx': 'hello' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const read = await p.readFile({ args: { path: 'src/app.tsx' } });
        expect(read.file.content).toBe('hello');
        expect(read.file.toString()).toBe('hello');

        await p.writeFileIfUnchanged('src/new.tsx', 'world', null);
        const read2 = await p.readFile({ args: { path: 'src/new.tsx' } });
        expect(read2.file.content).toBe('world');
    });

    test('private working copy response identifies the editable root', async () => {
        installMockBridge();
        expect(await NodeFsProvider.createPrivateWorkingCopy('/original')).toEqual({
            rootPath: '/private/project', sourceRootPath: '/original', copyId: 'copy-1',
            reused: false, previewNeedsInstall: true, excludedPaths: ['node_modules'],
        });
    });

    test('private handoff plan and export stay on the narrow native bridge', async () => {
        installMockBridge();
        const provider = new NodeFsProvider({ rootPath: '/private/project' });
        const plan = await provider.planPrivateHandoff();
        expect(plan.changedFiles[0]?.path).toBe('index.html');
        expect(await provider.exportPrivateHandoff(plan.planToken!)).toEqual({
            patchPath: '/private/handoff.patch', changedFiles: ['index.html'],
        });
    });

    test('guarded rollback deletes only a newly created unchanged file', async () => {
        const bridge = installMockBridge({ 'existing.ts': 'keep' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const created = await p.writeFileIfUnchanged('new.ts', 'new', null);
        bridge.externalWrite('new.ts', 'external');
        await expect(p.deleteFileIfUnchanged('new.ts', created.sha256))
            .rejects.toBeInstanceOf(LocalFileConflictError);
        expect((await p.readFile({ args: { path: 'new.ts' } })).file.content).toBe('external');

        const other = await p.writeFileIfUnchanged('newer.ts', 'temporary', null);
        await p.deleteFileIfUnchanged('newer.ts', other.sha256);
        await expect(p.readFile({ args: { path: 'newer.ts' } })).rejects.toThrow(/File not found/);
        await expect(p.deleteFileIfUnchanged('existing.ts', hashFor('keep')))
            .rejects.toThrow('file_not_recently_created_by_weblab');
    });

    test('reviewed public directory creation is separate from generic mkdir', async () => {
        installMockBridge();
        const provider = new NodeFsProvider({ rootPath: '/proj' });
        await provider.createPreparationPublicDirectory();
        await expect(provider.createPreparationPublicDirectory())
            .rejects.toThrow('public_directory_already_exists');
        await provider.deletePreparationPublicDirectory();
        await expect(provider.deletePreparationPublicDirectory())
            .rejects.toThrow('directory_not_recently_created_by_weblab');
        await expect(provider.createDirectory({ args: { path: 'arbitrary' } }))
            .rejects.toThrow('Direct local file mutations are unavailable');
    });

    test('direct file mutations are blocked outside the guarded local mirror', async () => {
        installMockBridge({ 'a.ts': 'original' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await expect(p.writeFile({ args: { path: 'a.ts', content: 'changed' } })).rejects.toThrow(
            'Direct local file mutations are unavailable',
        );
        await expect(
            p.renameFile({ args: { oldPath: 'a.ts', newPath: 'b.ts' } }),
        ).rejects.toThrow('Direct local file mutations are unavailable');
        await expect(p.deleteFiles({ args: { path: 'a.ts' } })).rejects.toThrow(
            'Direct local file mutations are unavailable',
        );
        await expect(
            p.copyFiles({ args: { sourcePath: 'a.ts', targetPath: 'b.ts' } }),
        ).rejects.toThrow('Direct local file mutations are unavailable');
        await expect(p.createDirectory({ args: { path: 'sub' } })).rejects.toThrow(
            'Direct local file mutations are unavailable',
        );
        expect((await p.readFile({ args: { path: 'a.ts' } })).file.content).toBe('original');
    });

    test('readFile surfaces a clear not-found error', async () => {
        installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await expect(p.readFile({ args: { path: 'missing.ts' } })).rejects.toThrow(
            /File not found/,
        );
    });

    test('listFiles returns top-level entries', async () => {
        installMockBridge({ 'a.ts': '1', 'b.ts': '2' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const { files } = await p.listFiles({ args: { path: '.' } });
        expect(files.map((f) => f.name).sort()).toEqual(['a.ts', 'b.ts']);
    });

    test('listFiles rejects a bridge error even when files is empty', async () => {
        const bridge = installMockBridge({});
        bridge.localfs.list = async () => ({ files: [], error: 'permission_denied' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await expect(p.listFiles({ args: { path: '.' } })).rejects.toThrow('permission_denied');
    });

    test('guarded writes preserve external changes and report conflicts', async () => {
        const bridge = installMockBridge({ 'src/app.tsx': 'original' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        const original = await p.readFileWithHash('src/app.tsx');
        bridge.externalWrite('src/app.tsx', 'external');

        await expect(
            p.writeFileIfUnchanged('src/app.tsx', 'editor', original.sha256),
        ).rejects.toBeInstanceOf(LocalFileConflictError);
        expect((await p.readFile({ args: { path: 'src/app.tsx' } })).file.content).toBe(
            'external',
        );

        const current = await p.readFileWithHash('src/app.tsx');
        const saved = await p.writeFileIfUnchanged('src/app.tsx', 'editor', current.sha256);
        expect(saved.sha256).toBe(hashFor('editor'));
    });

    test('guarded write can create a file only while it is absent', async () => {
        installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await p.writeFileIfUnchanged('new.ts', 'first', null);
        await expect(p.writeFileIfUnchanged('new.ts', 'second', null)).rejects.toBeInstanceOf(
            LocalFileConflictError,
        );
    });

    test('arbitrary local commands are unavailable', async () => {
        const bridge = installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await expect(p.runCommand({ args: { command: 'git push' } })).rejects.toThrow(
            'Local shell commands are unavailable',
        );
        await expect(
            p.runBackgroundCommand({ args: { command: 'git push' } }),
        ).rejects.toThrow('Local shell commands are unavailable');
        const { terminal } = await p.createTerminal({});
        await expect(terminal.run('git push')).rejects.toThrow(
            'Local shell commands are unavailable',
        );
        expect('run' in bridge.localdev).toBe(false);
    });

    test('gitInfo and gitStatus use narrow native methods and surface errors', async () => {
        const bridge = installMockBridge({});
        const p = new NodeFsProvider({ rootPath: '/proj' });
        expect(await p.gitInfo()).toEqual({ isRepositoryRoot: true, branch: 'main' });
        expect((await p.gitStatus({})).changedFiles).toEqual(['src/a.tsx', 'src/b.tsx']);
        bridge.localdev.gitInfo = async () => ({
            isRepositoryRoot: false,
            branch: '',
            error: 'git_failed',
        });
        await expect(p.gitInfo()).rejects.toThrow('git_failed');
        bridge.localdev.gitStatus = async () => ({ changedFiles: [], error: 'git_failed' });
        await expect(p.gitStatus({})).rejects.toThrow('git_failed');
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
        await expect(p.readFileWithHash('x')).rejects.toThrow(
            /rootPath/,
        );
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

    test('watchFiles fails when desktop watcher cannot start', async () => {
        const bridge = installMockBridge({});
        bridge.localfs.watchStart = async () => ({ watchId: '', error: 'watch_limit_reached' });
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await expect(p.watchFiles({ args: { path: '.' } })).rejects.toThrow(
            'watch_limit_reached',
        );
        bridge.localfs.watchStart = async () => ({ watchId: '' });
        await expect(p.watchFiles({ args: { path: '.' } })).rejects.toThrow(
            'did not return an ID',
        );
    });

    test('dev task open() boots the local dev server', async () => {
        const bridge = installMockBridge({});
        let startCalls = 0;
        bridge.localdev.start = async () => {
            startCalls += 1;
            return { port: 4321, url: 'http://localhost:4321' };
        };
        const p = new NodeFsProvider({ rootPath: '/proj', port: 4321 });
        const { task } = await p.getTask({ args: { id: 'dev' } });
        const out = await task.open();
        expect(startCalls).toBeGreaterThan(0);
        expect(out).toContain('http://localhost:4321');
    });

    test('setup() boots the dev server (no hardcoded npm install)', async () => {
        const bridge = installMockBridge({});
        let startCalls = 0;
        bridge.localdev.start = async () => {
            startCalls += 1;
            return { port: 4321, url: 'http://localhost:4321' };
        };
        const p = new NodeFsProvider({ rootPath: '/proj' });
        await p.setup({});
        expect(startCalls).toBe(1);
    });
});
