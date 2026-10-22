import { describe, expect, it, mock } from 'bun:test';

import { NodeFsProvider } from '@weblab/code-provider';
import { EditorAttributes } from '@weblab/constants';
import type { CodeFileSystem } from '@weblab/file-system';
import type { Branch } from '@weblab/models';
import type { Action } from '@weblab/models/actions';
import { RouterType } from '@weblab/models';

import type { EditorEngine } from '../engine';
import type { ErrorManager } from '../error';
import type { BranchData } from '../branch/manager';
import type { SandboxManager as SandboxManagerType } from './index';
import type { LocalPreparationApplyError as LocalPreparationApplyErrorType } from './index';
import type { LocalPreparationPlan } from './preload-script';
import { planLocalProjectPreparation } from './preload-script';
import { LocalMirror } from './local-mirror';
import { cleanHandoffFiles } from '../git/handoff-clean';

void mock.module('../history/storage', () => ({
    loadHistory: async () => null,
    saveHistory: async () => undefined,
    clearHistory: async () => undefined,
}));
void mock.module('@/components/store/lib/convex-http-client', () => ({
    getConvexHttpClient: () => ({}),
    whenConvexAuthReady: async () => undefined,
    captureConvexAuthOwner: () => null,
    getConvexHttpClientForOwner: () => { throw new Error('Fixture must not create a cloud client'); },
}));

// Each fixture supplies its source editor. Importing the real branch manager
// must not initialize the unrelated global ZenFS filesystem.
void mock.module('@weblab/file-system', () => ({
    CodeFileSystem: class {
        constructor() { throw new Error('Preparation fixtures must supply their own source editor.'); }
    },
}));

// Native disk fixtures never open the remote sandbox transport or its env.
void mock.module('@/lib/sandbox-server-client', () => ({
    getSandboxServerClient: () => { throw new Error('Preparation fixtures must not open a remote sandbox transport.'); },
    setSandboxServerAuthFetcher: () => { throw new Error('Preparation fixtures must not configure remote sandbox auth.'); },
}));

const { HistoryManager } = await import('../history');
const { BranchManager } = await import('../branch/manager');
const { LocalPreparationApplyError, PreloadScriptState, SandboxManager } = await import('./index');

function attachPreparationHistory(manager: SandboxManagerType, beforeHydration?: Promise<void>) {
    const engine = manager['editorEngine'];
    const branch = manager['branch'];
    const fs = manager['fs'];
    fs.replaceLocalSnapshot ??= async () => undefined;
    fs.setLocalWriteHandler ??= () => undefined;
    Object.assign(engine, {
        code: { hasPendingWrites: false, waitForPendingWrites: async () => undefined },
        text: { hasPendingWork: false },
        action: {
            hasPendingStylePreflights: false, hasPendingRebases: false,
            beginHistoryDisposalPreparation: () => undefined,
            cancelHistoryDisposalPreparation: () => undefined,
        },
    });
    const history = new HistoryManager(engine, branch.id);
    const branches = new BranchManager(engine);
    const branchData: BranchData = { branch, sandbox: manager, history,
        error: manager['errorManager'], codeEditor: fs, localStyleWriter: 'none' };
    branches['branchMap'].set(branch.id, branchData);
    branches['currentBranchId'] = branch.id;
    branches.refreshStyleWriter = async () => undefined;
    Object.assign(engine, { branches });
    const ready = (async () => {
        const mirror = new LocalMirror(manager.session.provider as NodeFsProvider, fs);
        await mirror.start();
        manager['localMirror'] = mirror;
        history.setSourceVersion(() => manager.getLocalSourceVersion(),
            () => manager.getLocalExternalRevision(), () => manager.getLocalOwnRevision());
        await beforeHydration;
        await history.hydrate();
    })();
    branches['initializations'].set(branch.id, { branch: branches.getBranchDataById(branch.id)!, promise: ready });
    return { history, branches, ready, engine };
}

function preparationFixture(beforeHydration?: Promise<void>, initialFiles?: Map<string, string>) {
    const file = (content: string) => ({ content, sha256: `hash:${content}` });
    const disk = new Map([['index.html', file('original')], ['other.css', file('unchanged')]]);
    if (initialFiles) {
        disk.clear();
        for (const [path, content] of initialFiles) disk.set(path, file(content));
    }
    const provider = new NodeFsProvider({ rootPath: '/selected-project' });
    let writeHook: ((path: string, content: string) => void) | undefined;
    const writes: string[] = [];
    provider.listFiles = async () => ({ files: [...disk.keys()].map((name) => ({ name, type: 'file' as const, isSymlink: false })) });
    provider.readFileWithHash = async (path) => {
        const current = disk.get(path);
        if (!current) throw new Error(`File not found: ${path}`);
        return current;
    };
    provider.writeFileIfUnchanged = async (path, content, expected) => {
        writes.push(path);
        writeHook?.(path, content);
        if ((disk.get(path)?.sha256 ?? null) !== expected) throw new Error('Hash conflict');
        disk.set(path, file(content));
        return { sha256: file(content).sha256 };
    };
    provider.deleteFileIfUnchanged = async (path, expected) => {
        if (disk.get(path)?.sha256 !== expected) throw new Error('Hash conflict');
        disk.delete(path);
    };
    provider.watchFiles = async () => ({ watcher: { stop: async () => undefined } }) as never;
    provider.destroy = async () => undefined;
    let snapshots = 0;
    let localWrite: ((path: string, content: string) => Promise<void>) | undefined;
    const fs = { listAll: async () => [...disk.keys()].map((path) => ({ path, type: 'file' as const })),
        replaceLocalSnapshot: async () => { snapshots++; },
        setLocalWriteHandler: (write: typeof localWrite) => { localWrite = write; } } as unknown as CodeFileSystem;
    const branch = { id: 'branch', runtime: { type: 'local' } } as unknown as Branch;
    const manager = new SandboxManager(branch, {} as EditorEngine, {} as ErrorManager, fs);
    manager.session.provider = provider;
    const plan: LocalPreparationPlan = { files: [
        { path: 'index.html', original: 'original', updated: 'prepared', expectedSha256: file('original').sha256 },
        { path: '__weblab-preload.js', original: null, updated: 'preload', expectedSha256: null },
    ] };
    manager['localPreparationPlan'] = plan;
    manager['localPreparationProvider'] = provider;
    return { manager, plan, disk, file, writes, provider, fs, snapshots: () => snapshots,
        writeLocal: (path: string, content: string) => localWrite!(path, content),
        ...attachPreparationHistory(manager, beforeHydration),
        setWriteHook: (hook: (path: string, content: string) => void) => { writeHook = hook; } };
}

async function withPreparedHistory(test: (fixture: ReturnType<typeof preparationFixture>) => Promise<void>) {
    const disk = new Map([['index.html', '<html><head></head><body><main>Hello</main></body></html>']]);
    const provider = new NodeFsProvider({ rootPath: '/selected-project' });
    provider.readFileWithHash = async (path) => {
        const content = disk.get(path);
        if (content === undefined) throw new Error(`Missing fixture file: ${path}`);
        return { content, sha256: `hash:${content}` };
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
        async () => new Response('/* Weblab stale domId lookup blocked: */'),
        { preconnect: originalFetch.preconnect },
    );
    let fixture: ReturnType<typeof preparationFixture> | undefined;
    try {
        const preparation = await planLocalProjectPreparation(provider, 'static-html', [...disk.keys()]);
        for (const file of preparation.files) disk.set(file.path, file.updated);
        const prepared = preparationFixture(undefined, disk);
        fixture = prepared;
        Object.assign(fixture.engine, { framework: 'static-html', posthog: { capture: () => undefined } });
        fixture.engine.code.write = async () => true;
        await fixture.ready;
        const action: Action = { type: 'edit-text', targets: [], originalContent: 'before', newContent: 'after' };
        await fixture.history.pushImmediate(action);
        await fixture.history.pushImmediate({ ...action, newContent: 'second' });
        await fixture.history.undo();
        expect(fixture.history.canUndo).toBe(true);
        expect(fixture.history.canRedo).toBe(true);
        await test(fixture);
    } finally {
        globalThis.fetch = originalFetch;
        fixture?.manager.clear();
    }
}

async function planNextDocuments(disk: Map<string, string>) {
    const provider = new NodeFsProvider({ rootPath: '/selected-project' });
    provider.listFiles = async () => ({ files: [{ name: 'public', type: 'directory', isSymlink: false }] });
    provider.readFileWithHash = async (path) => {
        const content = disk.get(path);
        if (content === undefined) throw new Error(`Missing fixture file: ${path}`);
        return { content, sha256: `${path}:${content}` };
    };
    const originalFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => {
        fetched++;
        return new Response('/* Weblab stale domId lookup blocked: */');
    }) as unknown as typeof fetch;
    try {
        return await planLocalProjectPreparation(provider, 'nextjs', [...disk.keys()],
            { type: RouterType.APP, basePath: 'src/app' });
    } catch (error) {
        expect(fetched).toBe(0);
        throw error;
    } finally {
        globalThis.fetch = originalFetch;
    }
}

describe('local document layout discovery', () => {
    const document = 'export default function Layout({children}) { return <html><body>{children}</body></html>; }';

    it('prepares locale and sibling roots without manufacturing a base document', async () => {
        const disk = new Map([
            ['src/app/[locale]/layout.tsx', document],
            ['src/app/(auth)/layout.tsx', document],
            ['src/app/(studio)/layout.tsx', document],
            ['src/app/[locale]/nested/layout.tsx', 'export default function Nested({children}) { return <section>{children}</section>; }'],
            ['src/application/layout.tsx', document],
        ]);
        const first = await planNextDocuments(disk);
        expect(first.files.some((file) => file.path === 'src/app/layout.tsx')).toBe(false);
        for (const root of ['[locale]', '(auth)', '(studio)']) {
            const updated = first.files.find((file) => file.path === `src/app/${root}/layout.tsx`)?.updated;
            expect(updated).toContain('src="/weblab-preload-script.js"');
            expect(updated).toContain('src="/weblab-ix-runtime.js"');
        }
        for (const path of ['src/app/[locale]/nested/layout.tsx', 'src/application/layout.tsx']) {
            expect(first.files.find((file) => file.path === path)?.updated).not.toContain('weblab-preload-script');
        }
        for (const file of first.files) disk.set(file.path, file.updated);
        expect((await planNextDocuments(disk)).files).toEqual([]);
    });

    it('localizes aliased scripts in every alternative document and remains unchanged on retry', async () => {
        const layout = 'import PreviewScript from "next/script"; export default function Layout({children, login}) { if (login) return <html><body>Login</body></html>; return <html><body>{children}</body></html>; }';
        const disk = new Map([['src/app/layout.tsx', layout]]);
        const first = await planNextDocuments(disk);
        const updated = first.files.find((file) => file.path === 'src/app/layout.tsx')!.updated;
        expect(updated.match(/src="\/weblab-preload-script.js"/g)).toHaveLength(2);
        expect(updated.match(/src="\/weblab-ix-runtime.js"/g)).toHaveLength(2);
        expect(updated).toContain('<PreviewScript');
        expect(updated).not.toContain('cdn.jsdelivr.net');
        for (const file of first.files) disk.set(file.path, file.updated);
        expect((await planNextDocuments(disk)).files).toEqual([]);
    });

    it('rejects ancestor documents and incomplete document trees before fetching assets', async () => {
        await expect(planNextDocuments(new Map([
            ['src/app/layout.tsx', document], ['src/app/(site)/layout.tsx', document],
        ]))).rejects.toThrow('Overlapping document layouts');
        await expect(planNextDocuments(new Map([
            ['src/app/layout.tsx', document], ['src/app/layout.jsx', 'export default ({children}) => <main>{children}</main>;'],
        ]))).rejects.toThrow('Multiple layout files');
        for (const layout of [
            'export default () => <html><head /></html>;',
            'export default () => <><html /><body /></>;',
            'export default () => <html><body><html><body /></html></body></html>;',
        ]) {
            const disk = new Map([['src/app/[locale]/layout.tsx', layout]]);
            await expect(planNextDocuments(disk)).rejects.toThrow('no files were changed');
            expect(disk.get('src/app/[locale]/layout.tsx')).toBe(layout);
        }
    });

    it('keeps wrapping compatibility only for an existing base layout', async () => {
        const plain = 'export default function Layout({children}) { return <main>{children}</main>; }';
        const disk = new Map([['src/app/layout.tsx', plain]]);
        expect((await planNextDocuments(disk)).files.find((file) => file.path === 'src/app/layout.tsx')?.updated)
            .toContain('<html');
        await expect(planNextDocuments(new Map([['src/app/[locale]/layout.tsx', plain]])))
            .rejects.toThrow('No existing App Router document layout');
    });

    it('reviews exact bridge asset exceptions in middleware and removes them from customer handoff', async () => {
        const proxy = 'export function proxy(request) { return authenticate(request); } export const config = {matcher: ["/((?!_next/static|images).*)"]};';
        const disk = new Map([['src/app/[locale]/layout.tsx', document], ['src/proxy.tsx', proxy]]);
        const first = await planNextDocuments(disk);
        expect(first.files.find((file) => file.path === 'src/proxy.tsx')?.updated).toContain('weblab-preload-script');
        expect(cleanHandoffFiles(first.files)).toEqual([]);
        for (const file of first.files) disk.set(file.path, file.updated);
        expect((await planNextDocuments(disk)).files).toEqual([]);
        await expect(planNextDocuments(new Map([
            ['src/app/layout.tsx', document], ['src/proxy.ts', 'export const config = {matcher: getMatchers()};'],
        ]))).rejects.toThrow('static');
    });
});

describe('local project preparation', () => {
    it('acknowledges a real no-op plan without changing restored undo or redo history', async () => {
        await withPreparedHistory(async (fixture) => {
            const plan = await fixture.manager.planLocalPreparation();
            expect(plan.files).toEqual([]);
            const undo = fixture.history['undoStack'];
            const redo = fixture.history['redoStack'];
            const mirror = fixture.manager['localMirror'];
            const snapshots = fixture.snapshots();
            fixture.history.beginDisposalPreparation = () => { throw new Error('No-op must not lease history'); };
            fixture.engine.action.beginHistoryDisposalPreparation = () => { throw new Error('No-op must not lease actions'); };
            await fixture.manager.applyLocalPreparation(plan);
            expect(fixture.manager.preloadScriptState).toBe(PreloadScriptState.INJECTED);
            expect(fixture.history['undoStack']).toBe(undo);
            expect(fixture.history['redoStack']).toBe(redo);
            expect(fixture.history.canUndo).toBe(true);
            expect(fixture.history.canRedo).toBe(true);
            expect(fixture.history.isPreparingForDisposal).toBe(false);
            expect(fixture.manager['localMirror']).toBe(mirror);
            expect(fixture.snapshots()).toBe(snapshots);
            expect(fixture.writes).toEqual([]);
            expect(fixture.manager['localPreparationApplying']).toBe(false);
        });
    });

    it('refuses disk changes after a no-op review without clearing recovery history', async () => {
        await withPreparedHistory(async (fixture) => {
            const plan = await fixture.manager.planLocalPreparation();
            fixture.disk.set('index.html', fixture.file('outside edit'));
            await expect(fixture.manager.applyLocalPreparation(plan)).rejects.toThrow('source changed');
            expect(fixture.history.canUndo).toBe(true);
            expect(fixture.history.canRedo).toBe(true);
            expect(fixture.writes).toEqual([]);
            expect(fixture.manager.preloadScriptState).not.toBe(PreloadScriptState.INJECTED);
            expect(fixture.manager['localPreparationApplying']).toBe(false);
        });
    });

    it('still refuses a real changed plan with recovery history before any source mutation', async () => {
        await withPreparedHistory(async (fixture) => {
            globalThis.fetch = Object.assign(
                async () => new Response('/* Weblab stale domId lookup blocked: newer asset */'),
                { preconnect: globalThis.fetch.preconnect },
            );
            const plan = await fixture.manager.planLocalPreparation();
            expect(plan.files.length).toBeGreaterThan(0);
            await expect(fixture.manager.applyLocalPreparation(plan)).rejects.toThrow('empty history');
            expect(fixture.history.canUndo).toBe(true);
            expect(fixture.history.canRedo).toBe(true);
            expect(fixture.writes).toEqual([]);
            expect(fixture.history.isPreparingForDisposal).toBe(false);
        });
    });

    it('refuses a replacement mirror even when its source bytes match the reviewed no-op', async () => {
        await withPreparedHistory(async (fixture) => {
            const plan = await fixture.manager.planLocalPreparation();
            await fixture.manager['localMirror']!.stop();
            const replacement = new LocalMirror(fixture.provider, fixture.fs);
            await replacement.start();
            fixture.manager['localMirror'] = replacement;
            await expect(fixture.manager.applyLocalPreparation(plan)).rejects.toThrow('project changed');
            expect(fixture.history.canUndo).toBe(true);
            expect(fixture.history.canRedo).toBe(true);
            expect(fixture.writes).toEqual([]);
        });
    });

    it('refuses an owner change during no-op disk verification', async () => {
        await withPreparedHistory(async (fixture) => {
            const plan = await fixture.manager.planLocalPreparation();
            const read = fixture.provider.readFileWithHash.bind(fixture.provider);
            fixture.provider.readFileWithHash = async (path) => {
                const value = await read(path);
                fixture.branches['currentBranchId'] = null;
                return value;
            };
            await expect(fixture.manager.applyLocalPreparation(plan)).rejects.toThrow();
            expect(fixture.history.canUndo).toBe(true);
            expect(fixture.history.canRedo).toBe(true);
            expect(fixture.writes).toEqual([]);
            expect(fixture.manager.preloadScriptState).not.toBe(PreloadScriptState.INJECTED);
        });
    });

    it('drains an old watcher read before restarting the prepared source mirror', async () => {
        const fixture = preparationFixture();
        await fixture.ready;
        const mirror = fixture.manager['localMirror']!;
        const read = fixture.provider.readFileWithHash.bind(fixture.provider);
        let releaseRead!: () => void;
        let startedRead!: () => void;
        const heldRead = new Promise<void>((resolve) => { releaseRead = resolve; });
        const reading = new Promise<void>((resolve) => { startedRead = resolve; });
        let held = false;
        fixture.provider.readFileWithHash = async (path) => {
            if (path === 'index.html' && !held) {
                held = true;
                startedRead();
                await heldRead;
                return fixture.file('stale watcher bytes');
            }
            return read(path);
        };
        const refreshed: string[] = [];
        fixture.fs.replaceLocalFile = async (_path, content) => { refreshed.push(content); };
        const refresh = mirror['onDiskChange']({ type: 'change', paths: ['index.html'] });
        await reading;
        let startedStop!: () => void;
        const stopping = new Promise<void>((resolve) => { startedStop = resolve; });
        const stop = mirror.stop.bind(mirror);
        mirror.stop = async () => { startedStop(); await stop(); };
        const applying = fixture.manager.applyLocalPreparation(fixture.plan);
        await stopping;
        expect(fixture.writes).toEqual([]);
        releaseRead();
        await refresh;
        await applying;
        expect(refreshed).toEqual([]);
        expect(fixture.disk.get('index.html')?.content).toBe('prepared');
        await fixture.history.flushForDisposal();
    });

    it('stops a replacement watcher when disposal wins while its startup is pending', async () => {
        const fixture = preparationFixture();
        let releaseWatcher!: () => void;
        let startedWatcher!: () => void;
        const heldWatcher = new Promise<void>((resolve) => { releaseWatcher = resolve; });
        const startingReplacement = new Promise<void>((resolve) => { startedWatcher = resolve; });
        let watches = 0;
        let stopped = 0;
        fixture.provider.watchFiles = async () => {
            watches++;
            if (watches === 2) { startedWatcher(); await heldWatcher; }
            return { watcher: { stop: async () => { stopped++; } } } as never;
        };
        await fixture.ready;
        const applying = fixture.manager.applyLocalPreparation(fixture.plan);
        await startingReplacement;
        fixture.manager.clear();
        releaseWatcher();
        await expect(applying).rejects.toThrow('project changed');
        expect(fixture.manager['localMirror']).toBeNull();
        expect(watches).toBe(2);
        expect(stopped).toBe(2);
        await expect(fixture.writeLocal('index.html', 'must refuse')).rejects.toThrow('closed');
        await expect(fixture.history.flushForDisposal()).rejects.toThrow('source version could not be verified');
    });

    it('keeps preparation followed by strict publish history saving valid, including new preload files', async () => {
        const fixture = preparationFixture();
        await fixture.ready;
        const oldRevision = fixture.manager.getLocalExternalRevision();
        await fixture.manager.applyLocalPreparation(fixture.plan);
        expect(fixture.manager.getLocalExternalRevision()).not.toBe(oldRevision);
        await fixture.history.flushForDisposal();
        expect(fixture.history.length).toBe(0);
        expect(fixture.disk.get('__weblab-preload.js')?.content).toBe('preload');
    });

    it('rebinds a complete rollback but keeps a partial rollback strictly refused', async () => {
        for (const partial of [false, true]) {
            const fixture = preparationFixture();
            await fixture.ready;
            fixture.setWriteHook((path) => {
                if (path !== '__weblab-preload.js') return;
                if (partial) fixture.disk.set('index.html', fixture.file('outside edit'));
                throw new Error('Preload write failed');
            });
            await expect(fixture.manager.applyLocalPreparation(fixture.plan)).rejects.toThrow('Preload write failed');
            if (partial) {
                expect(fixture.disk.get('index.html')?.content).toBe('outside edit');
                await expect(fixture.history.flushForDisposal()).rejects.toThrow('source changed');
            } else {
                expect(fixture.disk.get('index.html')?.content).toBe('original');
                await fixture.history.flushForDisposal();
            }
        }
    });

    it('refuses an unobserved unrelated disk change before writes without replacing the live snapshot', async () => {
        const fixture = preparationFixture();
        await fixture.ready;
        const snapshots = fixture.snapshots();
        fixture.disk.set('new.css', fixture.file('outside edit'));
        await expect(fixture.manager.applyLocalPreparation(fixture.plan)).rejects.toThrow('source changed');
        expect(fixture.writes).toEqual([]);
        expect(fixture.snapshots()).toBe(snapshots);
        await expect(fixture.history.flushForDisposal()).rejects.toThrow('source changed');
    });

    it('refuses unrelated disk changes during preparation instead of blessing the new mirror', async () => {
        const fixture = preparationFixture();
        await fixture.ready;
        fixture.setWriteHook((path) => {
            if (path === '__weblab-preload.js') fixture.disk.set('other.css', fixture.file('outside edit'));
        });
        await expect(fixture.manager.applyLocalPreparation(fixture.plan)).rejects.toThrow('mirrored source changed');
        await expect(fixture.history.flushForDisposal()).rejects.toThrow('source changed');
        expect(fixture.disk.get('other.css')?.content).toBe('outside edit');
    });

    it('waits for source attachment and history hydration before admitting preparation writes', async () => {
        let finish!: () => void;
        const hydration = new Promise<void>((resolve) => { finish = resolve; });
        const fixture = preparationFixture(hydration);
        const applying = fixture.manager.applyLocalPreparation(fixture.plan);
        await Promise.resolve();
        expect(fixture.writes).toEqual([]);
        finish();
        await applying;
        await fixture.history.flushForDisposal();
    });

    it('refuses an active branch change during preparation and preserves the original disk version', async () => {
        const fixture = preparationFixture();
        await fixture.ready;
        fixture.setWriteHook((path) => {
            if (path === 'index.html') fixture.branches['currentBranchId'] = null;
        });
        await expect(fixture.manager.applyLocalPreparation(fixture.plan)).rejects.toThrow();
        expect(fixture.disk.get('index.html')?.content).toBe('original');
        await expect(fixture.history.flushForDisposal()).rejects.toThrow('source version could not be verified');
    });

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
        await attachPreparationHistory(manager).ready;
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try { await manager.applyLocalPreparation(plan); }
        catch (error) { failure = error; }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyErrorType).remainingPaths).toEqual([]);
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
        await attachPreparationHistory(manager).ready;
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyErrorType).remainingPaths).toEqual([]);
        expect(disk.get('first.tsx')?.content).toBe('before one');
        expect(disk.get('second.tsx')?.content).toBe('before two');
    });

    it('reports an external preflight change without claiming Weblab changed it', async () => {
        const provider = new NodeFsProvider({ rootPath: '/selected-project' });
        provider.listFiles = async () => ({ files: [{ name: 'page.tsx', type: 'file' as const, isSymlink: false }] });
        provider.watchFiles = async () => ({ watcher: { stop: async () => undefined } }) as never;
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
        await attachPreparationHistory(manager).ready;
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyErrorType).remainingPaths).toEqual([]);
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
        await attachPreparationHistory(manager).ready;
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyErrorType).remainingPaths).toEqual([]);
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
        await attachPreparationHistory(manager).ready;
        manager['localPreparationPlan'] = plan;
        manager['localPreparationProvider'] = provider;

        let failure: unknown;
        try {
            await manager.applyLocalPreparation(plan);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(LocalPreparationApplyError);
        expect((failure as LocalPreparationApplyErrorType).remainingPaths).toEqual(['first.tsx']);
        expect(disk.get('first.tsx')?.content).toBe('external edit');
    });
});
