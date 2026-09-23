import { describe, expect, it } from 'bun:test';

import { NodeFsProvider } from '@weblab/code-provider';
import { EditorAttributes } from '@weblab/constants';
import type { CodeFileSystem } from '@weblab/file-system';
import type { Branch } from '@weblab/models';
import { RouterType } from '@weblab/models';

import type { EditorEngine } from '../engine';
import type { ErrorManager } from '../error';
import { LocalPreparationApplyError, SandboxManager } from './index';
import type { LocalPreparationPlan } from './preload-script';
import { planLocalProjectPreparation } from './preload-script';
import type { LocalMirror } from './local-mirror';

describe('local project preparation', () => {
    it('plans exact static HTML changes without touching the project folder', async () => {
        const writes: string[] = [];
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.readFileWithHash = async () => ({
            content: '<html><head></head><body><main>Hello</main></body></html>',
            sha256: 'a'.repeat(64),
        });
        provider.writeFileIfUnchanged = async (path) => {
            writes.push(path);
            return { sha256: 'b'.repeat(64) };
        };
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('/* Weblab stale domId lookup blocked: */')) as unknown as typeof fetch;
        try {
            const plan = await planLocalProjectPreparation(provider, 'static-html', ['index.html']);
            expect(writes).toEqual([]);
            expect(plan.files.map((file) => file.path)).toEqual([
                'index.html', '__weblab-preload.js', '__weblab-ix-runtime.js',
            ]);
            expect(plan.files[0]?.original).toContain('<main>Hello</main>');
            expect(plan.files[0]?.updated).toContain(EditorAttributes.DATA_WEBLAB_ID);
            expect(plan.files[0]?.updated).toContain('data-weblab-preload');
            expect(plan.files[0]?.expectedSha256).toBe('a'.repeat(64));
            expect(plan.files[1]?.original).toBeNull();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('refuses an old preload bundle before producing an apply plan', async () => {
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.readFileWithHash = async () => ({
            content: '<html><head></head><body><main>Hello</main></body></html>',
            sha256: 'a'.repeat(64),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('/* old preload bundle */')) as unknown as typeof fetch;
        try {
            await expect(planLocalProjectPreparation(provider, 'static-html', ['index.html']))
                .rejects.toThrow('preload bundle is stale');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('keeps existing OIDs stable across files and becomes idempotent', async () => {
        const disk = new Map([
            ['index.html', '<html><head></head><body><main data-oid="home-id">Home</main></body></html>'],
            ['about.html', '<html><head></head><body><main data-oid="about-id">About</main></body></html>'],
        ]);
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.readFileWithHash = async (path) => {
            const content = disk.get(path);
            if (content === undefined) throw new Error(`File not found: ${path}`);
            return { content, sha256: `${path}:${content.length}` };
        };
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('/* Weblab stale domId lookup blocked: */')) as unknown as typeof fetch;
        try {
            const first = await planLocalProjectPreparation(
                provider, 'static-html', [...disk.keys()],
            );
            expect(first.files.find((file) => file.path === 'index.html')?.updated)
                .toContain('data-oid="home-id"');
            expect(first.files.find((file) => file.path === 'about.html')?.updated)
                .toContain('data-oid="about-id"');
            expect(first.files.find((file) => file.path === 'about.html')?.updated)
                .toContain('data-weblab-preload');
            for (const file of first.files) disk.set(file.path, file.updated);

            const second = await planLocalProjectPreparation(
                provider, 'static-html', [...disk.keys()],
            );
            expect(second.files).toEqual([]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('plans a Next.js layout with same-origin preload scripts', async () => {
        const layoutPath = 'src/app/layout.tsx';
        const disk = new Map([
            [layoutPath, 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }'],
        ]);
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.listFiles = async () => ({
            files: [{ name: 'public', type: 'directory', isSymlink: false }],
        });
        provider.readFileWithHash = async (path) => {
            const content = disk.get(path);
            if (content === undefined) throw new Error(`File not found: ${path}`);
            return { content, sha256: `${path}:${content.length}` };
        };
        const fetched: string[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            fetched.push(String(input));
            return new Response('/* Weblab stale domId lookup blocked: */');
        }) as unknown as typeof fetch;
        try {
            const plan = await planLocalProjectPreparation(
                provider, 'nextjs', [layoutPath], { type: RouterType.APP, basePath: 'src/app' },
            );
            const layout = plan.files.find((file) => file.path === layoutPath);
            expect(layout?.updated).toContain('/weblab-preload-script.js');
            expect(layout?.updated).toContain('/weblab-ix-runtime.js');
            expect(layout?.updated).not.toContain('cdn.jsdelivr.net');
            expect(fetched).toEqual(['/weblab-preload-script.js', '/weblab-ix-runtime.js']);
            for (const file of plan.files) disk.set(file.path, file.updated);
            const second = await planLocalProjectPreparation(
                provider, 'nextjs', [...disk.keys()],
                { type: RouterType.APP, basePath: 'src/app' },
            );
            expect(second.files).toEqual([]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('reviews creation of a missing Next.js public folder without writing it', async () => {
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.listFiles = async () => ({ files: [] });
        provider.readFileWithHash = async () => ({
            content: 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }',
            sha256: 'a'.repeat(64),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('/* Weblab stale domId lookup blocked: */')) as unknown as typeof fetch;
        try {
            const plan = await planLocalProjectPreparation(
                provider, 'nextjs', ['src/app/layout.tsx'],
                { type: RouterType.APP, basePath: 'src/app' },
            );
            expect(plan.createDirectories).toEqual(['public']);
            expect(plan.files.map((file) => file.path)).toContain('public/weblab-preload-script.js');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('rolls back a reviewed public folder when a later preparation write fails', async () => {
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        let directoryExists = false;
        const disk = new Map<string, { content: string; sha256: string }>();
        provider.listFiles = async ({ args }) => ({
            files: args.path === '' && directoryExists
                ? [{ name: 'public', type: 'directory' as const, isSymlink: false }]
                : [],
        });
        provider.createPreparationPublicDirectory = async () => { directoryExists = true; };
        provider.deletePreparationPublicDirectory = async () => { directoryExists = false; };
        provider.writeFileIfUnchanged = async (path, content) => {
            if (path.endsWith('ix-runtime.js')) throw new Error('Runtime write failed');
            disk.set(path, { content, sha256: 'created' });
            return { sha256: 'created' };
        };
        provider.deleteFileIfUnchanged = async (path) => { disk.delete(path); };
        provider.watchFiles = async () => ({ watcher: { stop: async () => undefined } }) as never;
        const fs = {
            replaceLocalSnapshot: async () => undefined,
            setLocalWriteHandler: () => undefined,
        } as unknown as CodeFileSystem;
        const branch = { id: 'branch', runtime: { type: 'local' } } as unknown as Branch;
        const manager = new SandboxManager(branch, {} as EditorEngine, {} as ErrorManager, fs);
        manager.session.provider = provider;
        manager['localMirror'] = { stop: async () => undefined } as unknown as LocalMirror;
        const plan: LocalPreparationPlan = {
            createDirectories: ['public'],
            files: [
                { path: 'public/weblab-preload-script.js', original: null, updated: 'preload', expectedSha256: null },
                { path: 'public/weblab-ix-runtime.js', original: null, updated: 'runtime', expectedSha256: null },
            ],
        };
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try { await manager.applyLocalPreparation(plan); }
        catch (error) { failure = error; }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyError).remainingPaths).toEqual([]);
        expect(directoryExists).toBe(false);
        expect(disk.size).toBe(0);
    });

    it('rolls back its own first write when a later guarded write fails', async () => {
        const disk = new Map([
            ['first.tsx', { content: 'before one', sha256: 'old-one' }],
            ['second.tsx', { content: 'before two', sha256: 'old-two' }],
        ]);
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.readFileWithHash = async (path) => {
            const entry = disk.get(path);
            if (!entry) throw new Error(`File not found: ${path}`);
            return entry;
        };
        provider.writeFileIfUnchanged = async (path, content, expected) => {
            if (path === 'second.tsx') throw new Error('The second write failed');
            const current = disk.get(path);
            if (current?.sha256 !== expected) throw new Error('Hash conflict');
            const sha256 = content === 'before one' ? 'old-one' : 'new-one';
            disk.set(path, { content, sha256 });
            return { sha256 };
        };
        provider.listFiles = async () => ({
            files: [...disk.keys()].map((name) => ({ name, type: 'file' as const, isSymlink: false })),
        });
        provider.watchFiles = async () => ({ watcher: { stop: async () => undefined } }) as never;
        const fs = {
            replaceLocalSnapshot: async () => undefined,
            setLocalWriteHandler: () => undefined,
        } as unknown as CodeFileSystem;
        const branch = { id: 'branch', runtime: { type: 'local' } } as unknown as Branch;
        const manager = new SandboxManager(branch, {} as EditorEngine, {} as ErrorManager, fs);
        manager.session.provider = provider;
        manager['localMirror'] = { stop: async () => undefined } as unknown as LocalMirror;
        const plan: LocalPreparationPlan = {
            files: [
                { path: 'first.tsx', original: 'before one', updated: 'after one', expectedSha256: 'old-one' },
                { path: 'second.tsx', original: 'before two', updated: 'after two', expectedSha256: 'old-two' },
            ],
        };
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyError).remainingPaths).toEqual([]);
        expect(disk.get('first.tsx')?.content).toBe('before one');
        expect(disk.get('second.tsx')?.content).toBe('before two');
    });

    it('reports an external preflight change without claiming Weblab changed it', async () => {
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.readFileWithHash = async () => ({ content: 'external edit', sha256: 'external' });
        let writes = 0;
        provider.writeFileIfUnchanged = async () => {
            writes++;
            return { sha256: 'written' };
        };
        const branch = { id: 'branch', runtime: { type: 'local' } } as unknown as Branch;
        const manager = new SandboxManager(
            branch, {} as EditorEngine, {} as ErrorManager, {} as CodeFileSystem,
        );
        manager.session.provider = provider;
        manager['localMirror'] = { stop: async () => undefined } as unknown as LocalMirror;
        const plan: LocalPreparationPlan = {
            files: [{
                path: 'page.tsx', original: 'reviewed source', updated: 'prepared source',
                expectedSha256: 'reviewed',
            }],
        };
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyError).remainingPaths).toEqual([]);
        expect(writes).toBe(0);
    });

    it('deletes a newly created preload file after a later guarded write fails', async () => {
        const disk = new Map<string, { content: string; sha256: string }>();
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.listFiles = async () => ({
            files: [...disk.keys()].map((name) => ({ name, type: 'file' as const, isSymlink: false })),
        });
        provider.readFileWithHash = async (path) => {
            const file = disk.get(path);
            if (!file) throw new Error(`File not found: ${path}`);
            return file;
        };
        provider.writeFileIfUnchanged = async (path, content, expected) => {
            if (path === '__weblab-ix-runtime.js') throw new Error('The second write failed');
            if (expected !== null || disk.has(path)) throw new Error('Hash conflict');
            disk.set(path, { content, sha256: 'created-hash' });
            return { sha256: 'created-hash' };
        };
        provider.deleteFileIfUnchanged = async (path, expected) => {
            if (disk.get(path)?.sha256 !== expected) throw new Error('Hash conflict');
            disk.delete(path);
        };
        provider.watchFiles = async () => ({ watcher: { stop: async () => undefined } }) as never;
        const fs = {
            replaceLocalSnapshot: async () => undefined,
            setLocalWriteHandler: () => undefined,
        } as unknown as CodeFileSystem;
        const branch = { id: 'branch', runtime: { type: 'local' } } as unknown as Branch;
        const manager = new SandboxManager(branch, {} as EditorEngine, {} as ErrorManager, fs);
        manager.session.provider = provider;
        manager['localMirror'] = { stop: async () => undefined } as unknown as LocalMirror;
        const plan: LocalPreparationPlan = {
            files: [
                { path: '__weblab-preload.js', original: null, updated: 'preload', expectedSha256: null },
                { path: '__weblab-ix-runtime.js', original: null, updated: 'runtime', expectedSha256: null },
            ],
        };
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyError).remainingPaths).toEqual([]);
        expect(disk.size).toBe(0);
    });

    it('leaves a concurrent external edit intact when rollback loses the hash check', async () => {
        const disk = new Map([
            ['first.tsx', { content: 'before', sha256: 'old-hash' }],
            ['second.tsx', { content: 'before two', sha256: 'second-hash' }],
        ]);
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.readFileWithHash = async (path) => disk.get(path)!;
        provider.writeFileIfUnchanged = async (path, content, expected) => {
            if (path === 'second.tsx') {
                disk.set('first.tsx', { content: 'external edit', sha256: 'external-hash' });
                throw new Error('The second write failed');
            }
            if (disk.get(path)?.sha256 !== expected) throw new Error('Hash conflict');
            disk.set(path, { content, sha256: 'our-hash' });
            return { sha256: 'our-hash' };
        };
        provider.listFiles = async () => ({
            files: [...disk.keys()].map((name) => ({ name, type: 'file' as const, isSymlink: false })),
        });
        provider.watchFiles = async () => ({ watcher: { stop: async () => undefined } }) as never;
        const fs = {
            replaceLocalSnapshot: async () => undefined,
            setLocalWriteHandler: () => undefined,
        } as unknown as CodeFileSystem;
        const branch = { id: 'branch', runtime: { type: 'local' } } as unknown as Branch;
        const manager = new SandboxManager(branch, {} as EditorEngine, {} as ErrorManager, fs);
        manager.session.provider = provider;
        manager['localMirror'] = { stop: async () => undefined } as unknown as LocalMirror;
        const plan: LocalPreparationPlan = { files: [
            { path: 'first.tsx', original: 'before', updated: 'prepared', expectedSha256: 'old-hash' },
            { path: 'second.tsx', original: 'before two', updated: 'prepared two', expectedSha256: 'second-hash' },
        ] };
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyError).remainingPaths).toEqual(['first.tsx']);
        expect(disk.get('first.tsx')?.content).toBe('external edit');
    });
});
