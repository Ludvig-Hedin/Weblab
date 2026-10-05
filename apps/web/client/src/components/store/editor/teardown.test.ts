import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Action, DomElement } from '@weblab/models';
import { StyleChangeType } from '@weblab/models/style';
import type { BranchData } from './branch/manager';
import type { EditorEngine as Engine } from './engine';
import type { IFrameView } from '@/app/project/[id]/_components/canvas/frame/view';

const saved: Array<{ branchId: string; undo: Action[]; redo: Action[]; version?: string }> = [];
const refusedSaves = new Set<string>();
let holdSave: Promise<void> | null = null;
const branchSaveHolds = new Map<string, { wait: Promise<void>; entered: () => void }>();
let clearCalls = 0;

void mock.module('./history/storage', () => ({
    loadHistory: async () => null,
    saveHistory: async (branchId: string, undo: Action[], redo: Action[], version?: string) => {
        const hold = branchSaveHolds.get(branchId);
        if (hold) { hold.entered(); await hold.wait; }
        if (holdSave) await holdSave;
        if (refusedSaves.has(branchId)) throw new Error(`save refused: ${branchId}`);
        saved.push({ branchId, undo: [...undo], redo: [...redo], version });
    },
    clearHistory: async () => { clearCalls++; },
}));

// These fixtures supply each branch's editor directly. Do not initialize the
// unrelated ZenFS singleton while loading the real engine/branch prototypes.
void mock.module('@weblab/file-system', () => ({
    CodeFileSystem: class {
        constructor() { throw new Error('Teardown fixtures must supply their own source editor.'); }
    },
}));

// Prototype fixtures never contact the backend. Loading its singleton would
// validate unrelated application secrets before teardown assertions can run.
void mock.module('@/components/store/lib/convex-http-client', () => ({
    getConvexHttpClient: () => { throw new Error('Teardown fixtures must not contact the backend.'); },
    whenConvexAuthReady: async () => undefined,
}));

// Branch imports the sandbox session/provider, whose transport also loads env.
// No transport is needed when testing branch teardown with supplied editors.
void mock.module('@/lib/sandbox-server-client', () => ({
    getSandboxServerClient: () => { throw new Error('Teardown fixtures must not open a sandbox transport.'); },
    setSandboxServerAuthFetcher: () => { throw new Error('Teardown fixtures must not configure sandbox authentication.'); },
}));

// Geometry is outside the source-saving contract of the text overlap fixture.
const geometry = await import('./overlay/utils');
void mock.module('./overlay/utils', () => ({ ...geometry, adaptRectToCanvas: (rect: unknown) => rect }));

const { HistoryManager } = await import('./history');
const { BranchManager } = await import('./branch/manager');
const { EditorEngine } = await import('./engine');
const { ActionManager } = await import('./action');
const { TextEditingManager } = await import('./text');

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

const edit = (): Action => ({ type: 'edit-text', targets: [], originalContent: 'before', newContent: 'after' });

function fixture(branchIds = ['a']) {
    const events: string[] = [];
    let write: (action: Action) => Promise<boolean> = async () => true;
    let pending: Promise<void> = Promise.resolve();
    let cleanupFailure: string | null = null;
    let finalText: Promise<void> = Promise.resolve();
    let rebases: Promise<void> = Promise.resolve();
    let actionOwner: object | null = null;
    const engine = Object.create(EditorEngine.prototype) as InstanceType<typeof EditorEngine>;
    const branches = Object.create(BranchManager.prototype) as InstanceType<typeof BranchManager>;
    const data = new Map<string, BranchData>();
    const code = { hasPendingWrites: false, write: (action: Action) => write(action),
        waitForPendingWrites: () => pending, clear: () => { events.push('code.clear'); } };
    Object.assign(engine, { clearPromise: null, isClosing: false, branches, code,
        posthog: { capture: () => undefined },
        text: { finalizeForDisposal: async () => { events.push('text.finalize'); await finalText; } },
        action: { clear: () => { actionOwner = null; events.push('action.clear'); },
            beginDisposalPreparation: (owner: object) => {
                expect(actionOwner).toBeNull();
                actionOwner = owner;
                events.push('action.prepare');
            },
            cancelDisposalPreparation: (owner: object) => {
                expect(actionOwner).toBe(owner);
                actionOwner = null;
                events.push('action.resume');
            },
            flushAndWaitForPendingRebases: async () => { events.push('rebases.flush'); await rebases; } },
        snap: { hideSnapLines: () => { events.push('snap.clear'); } },
    });
    for (const name of ['elements', 'frames', 'overlay', 'ast', 'insert', 'move', 'style',
        'stylePreferences', 'propertiesClipboard', 'copy', 'group', 'canvas', 'breakpoints',
        'image', 'theme', 'tokens', 'font', 'pages', 'chat', 'interactions', 'components',
        'frameEvent', 'screenshot', 'comment', 'presence', 'state']) {
        Object.assign(engine, { [name]: { clear: () => { events.push(`${name}.clear`); } } });
    }
    for (const id of branchIds) {
        data.set(id, {
            branch: { id },
            history: new HistoryManager(engine, id, [edit()], [edit()]),
            sandbox: { clear: () => { events.push(`${id}.sandbox.clear`); } },
            error: { clear: () => { events.push(`${id}.error.clear`); } },
            codeEditor: { cleanup: async () => {
                events.push(`${id}.editor.cleanup`);
                if (cleanupFailure === id) throw new Error('index cleanup failed');
            } },
        } as unknown as BranchData);
    }
    Object.assign(branches, { editorEngine: engine, branchMap: data, initializations: new Map(), disposalPreparation: null, currentBranchId: branchIds[0],
        reactionDisposer: () => { events.push('reaction.dispose'); } });
    return { engine, branches, data, events, code,
        writeWith: (next: typeof write) => { write = next; },
        waitWrites: (wait: Promise<void>) => { pending = wait; },
        failCleanup: (id: string) => { cleanupFailure = id; },
        waitText: (wait: Promise<void>) => { finalText = wait; },
        failRebases: () => { rebases = Promise.reject(new Error('rebase refused')); },
    };
}

function textRebaseFixture() {
    const f = fixture();
    const history = f.data.get('a')!.history;
    let own = 0;
    let waiting: Promise<void> = Promise.resolve();
    const started = deferred();
    const stopping = deferred();
    const writes: Array<Parameters<Engine['code']['writeResponsiveStyleNow']>[0]> = [];
    history.setSourceVersion(() => `source-${own}`, () => 'external-1', () => `own-${own}`);
    f.writeWith(async () => { own++; return true; });
    Object.assign(f.engine.code, { writeResponsiveStyleNow: async (args: Parameters<Engine['code']['writeResponsiveStyleNow']>[0]) => {
        writes.push(args);
        started.resolve();
        await waiting;
        own++;
        await history.noteOwnSourceWrite(args.getHistoryLease?.());
        return 'applied' as const;
    } });
    Object.assign(f.engine.style, { breakpointMapFor: () => ({ mobile: 'red' }), removedBreakpointMapFor: () => ({}) });
    const target = { domId: 'heading', oid: 'heading', branchId: 'a', frameId: 'frame', instanceId: null, rect: {} } as DomElement;
    const view = { id: 'frame',
        startEditingText: async () => ({ domEl: target, originalContent: 'Hello', rich: true }),
        getComputedStyleByDomId: async () => ({}),
        stopEditingText: async () => { stopping.resolve(); return { domEl: target, newContent: 'Final' }; },
    } as unknown as IFrameView;
    Object.assign(f.engine.frames, { get: () => ({ view }) });
    Object.assign(f.engine.overlay, { clearUI: () => undefined,
        state: { addTextEditor: () => undefined, removeTextEditor: () => undefined } });
    const action = new ActionManager(f.engine);
    Object.assign(f.engine, { action });
    const text = new TextEditingManager(f.engine);
    text.isChildTextEditable = async () => true;
    Object.assign(f.engine, { text });
    return { ...f, action, text, history, view, target, writes, started, stopping,
        holdResponsive: (wait: Promise<void>) => { waiting = wait; }, currentVersion: () => `source-${own}` };
}

beforeEach(() => { saved.length = 0; refusedSaves.clear(); branchSaveHolds.clear(); holdSave = null; clearCalls = 0; });

describe('recoverable editor teardown', () => {
    test('storage failure preserves both stacks, and retry saves before release', async () => {
        const f = fixture();
        const history = f.data.get('a')!.history;
        refusedSaves.add('a');
        await expect(history.dispose()).rejects.toThrow('save refused');
        expect(history.canUndo).toBe(true);
        expect(history.canRedo).toBe(true);
        expect(clearCalls).toBe(0);
        refusedSaves.clear();
        await history.dispose();
        expect(saved[0]?.undo).toHaveLength(1);
        expect(saved[0]?.redo).toHaveLength(1);
        expect(history.canUndo).toBe(false);
        expect(history.canRedo).toBe(false);
    });

    test('open transaction is saved; a refused source write keeps its remainder for retry', async () => {
        const f = fixture();
        const history = f.data.get('a')!.history;
        let writes = 0;
        f.writeWith(async () => { writes++; return writes > 1; });
        await history.startTransaction();
        await history.push(edit());
        await expect(history.flushForDisposal()).rejects.toThrow('unfinished edit');
        expect(history.isInTransaction).toBe(true);
        expect(history.canRedo).toBe(true);
        expect(saved).toEqual([]);
        await history.flushForDisposal();
        expect(history.isInTransaction).toBe(false);
        expect(writes).toBe(2);
        expect(saved[0]?.undo).toHaveLength(2);
        expect(clearCalls).toBe(0);
    });

    test('pending source write blocks final persistence and disposal', async () => {
        const f = fixture();
        const wait = deferred();
        f.waitWrites(wait.promise);
        let finished = false;
        const disposing = f.data.get('a')!.history.dispose().then(() => { finished = true; });
        await Promise.resolve();
        expect(finished).toBe(false);
        expect(saved).toEqual([]);
        expect(f.data.get('a')!.history.canUndo).toBe(true);
        wait.resolve();
        await disposing;
        expect(saved).toHaveLength(1);
    });

    test('a rejected transaction write is removed once and retained only as an unfinished retry', async () => {
        const f = fixture();
        const history = f.data.get('a')!.history;
        let refuse = true;
        f.writeWith(async () => {
            if (refuse) throw new Error('transport refused');
            return true;
        });
        await history.startTransaction();
        await history.push(edit());
        await expect(history.flushForDisposal()).rejects.toThrow('transport refused');
        expect(history.length).toBe(1);
        expect(history.isInTransaction).toBe(true);
        expect(history.canRedo).toBe(true);
        refuse = false;
        await history.flushForDisposal();
        expect(saved[0]?.undo).toHaveLength(2);
    });

    test('external source drift refuses strict saving without erasing history or stamping it current', async () => {
        const f = fixture();
        const history = f.data.get('a')!.history;
        let external = 'external-1';
        history.setSourceVersion(() => 'source-hash', () => external, () => 'own-1');
        external = 'external-2';
        await expect(history.flushForDisposal()).rejects.toThrow('source changed');
        expect(history.canUndo).toBe(true);
        expect(history.canRedo).toBe(true);
        expect(saved).toEqual([]);
        expect(clearCalls).toBe(0);
    });

    test('an owned final source write can acknowledge its own revision, never an external change', async () => {
        const f = fixture();
        const history = f.data.get('a')!.history;
        let own = 'own-1';
        let external = 'external-1';
        let version = 'source-1';
        history.setSourceVersion(() => version, () => external, () => own);
        const lease = history.beginDisposalPreparation();
        const expected = history.getExternalRevisionForDisposal(lease);
        own = 'own-2'; version = 'source-2';
        history.acknowledgeDisposalSourceWrite(lease, expected);
        const checkpoint = await history.flushForDisposal(lease);
        expect(saved.at(-1)?.version).toBe('source-2');
        history.assertDisposalCheckpoint(lease, checkpoint);
        external = 'external-2';
        expect(() => history.acknowledgeDisposalSourceWrite(lease, expected)).toThrow('source changed');
        expect(history.canUndo).toBe(true);
        expect(clearCalls).toBe(0);
        history.cancelDisposalPreparation(lease);
    });

    test('source replay receipt requires verified revisions and a real successful storage write', async () => {
        const f = fixture();
        const history = f.data.get('a')!.history;
        expect(await history.confirmSourceReplay('external-1')).toBe(false);
        let own = 'own-1';
        history.setSourceVersion(() => 'source-1', () => 'external-1', () => own);
        own = 'own-2';
        refusedSaves.add('a');
        await expect(history.confirmSourceReplay('external-1')).rejects.toThrow('save refused');
        expect(history.canUndo).toBe(true);
        refusedSaves.clear();
        expect(await history.confirmSourceReplay('external-1')).toBe(true);
        expect(saved.at(-1)?.version).toBe('source-1');
    });

    test('one failed branch flush preserves all branches, reaction and editors', async () => {
        const f = fixture(['a', 'b']);
        refusedSaves.add('b');
        await expect(f.branches.clear()).rejects.toThrow('save refused: b');
        expect(f.events.filter((event) => event.endsWith('.clear') || event.endsWith('.cleanup') || event.endsWith('.dispose'))).toEqual([]);
        expect(f.data.size).toBe(2);
        expect(f.data.get('a')!.history.canUndo).toBe(true);
        expect(f.data.get('b')!.history.canUndo).toBe(true);
        refusedSaves.clear();
        await f.branches.clear();
        expect(f.data.size).toBe(0);
        expect(f.events).toContain('reaction.dispose');
        expect(f.events).toContain('a.editor.cleanup');
        expect(f.events).toContain('b.editor.cleanup');
    });

    test('holding branch B saving refuses late pushes and transactions into prepared branch A', async () => {
        const f = fixture(['a', 'b']);
        const wait = deferred();
        const entered = deferred();
        branchSaveHolds.set('b', { wait: wait.promise, entered: entered.resolve });
        let writes = 0;
        f.writeWith(async () => { writes++; return true; });
        const clearing = f.branches.clear();
        await entered.promise;
        const a = f.data.get('a')!.history;
        expect(await a.push(edit())).toBe(false);
        await expect(a.startTransaction()).rejects.toThrow('saving before it closes');
        expect(await a.pushImmediate(edit())).toBe(false);
        expect(await a.undo()).toBeNull();
        expect(await a.redo()).toBeNull();
        expect(a.length).toBe(1);
        expect(writes).toBe(0);
        wait.resolve();
        await clearing;
        expect(f.data.size).toBe(0);
    });

    test('a late owned source acknowledgement invalidates A checkpoint before any release', async () => {
        const f = fixture(['a', 'b']);
        const wait = deferred();
        const entered = deferred();
        branchSaveHolds.set('b', { wait: wait.promise, entered: entered.resolve });
        let version = 'source-1';
        let own = 'own-1';
        const a = f.data.get('a')!.history;
        a.setSourceVersion(() => version, () => 'external-1', () => own);
        const preparation = f.branches.beginDisposalPreparation();
        const clearing = f.branches.clear(undefined, preparation);
        await entered.promise;
        version = 'source-2'; own = 'own-2';
        await expect(a.noteOwnSourceWrite()).rejects.toThrow('preparation owner');
        await a.noteOwnSourceWrite(preparation.getHistoryLease('a'));
        wait.resolve();
        await expect(clearing).rejects.toThrow('editor changed while saving');
        expect(f.events.filter((event) => event.endsWith('.clear') || event.endsWith('.cleanup') || event.endsWith('.dispose'))).toEqual([]);
        expect(a.canUndo).toBe(true);
        expect(f.data.size).toBe(2);
        f.branches.cancelDisposalPreparation(preparation);
        branchSaveHolds.clear();
        await f.branches.clear();
        expect(f.data.size).toBe(0);
    });

    test('a previously admitted push settling false during preparation refuses release', async () => {
        const f = fixture();
        const wait = deferred();
        const a = f.data.get('a')!.history;
        f.writeWith(async () => { await wait.promise; return false; });
        const pushing = a.push(edit());
        const clearing = f.branches.clear();
        wait.resolve();
        expect(await pushing).toBe(false);
        await expect(clearing).rejects.toThrow('admitted edit could not be saved');
        expect(f.data.size).toBe(1);
        expect(f.events.filter((event) => event.endsWith('.clear') || event.endsWith('.cleanup') || event.endsWith('.dispose'))).toEqual([]);
        await a.startTransaction();
    });

    test('branch reinitialization also preserves all old branches when preparation fails', async () => {
        const f = fixture(['a', 'b']);
        refusedSaves.add('b');
        await expect(f.branches.initBranches([])).rejects.toThrow('save refused: b');
        expect(f.events.filter((event) => event.endsWith('.clear') || event.endsWith('.cleanup') || event.endsWith('.dispose'))).toEqual([]);
        expect(f.data.size).toBe(2);
        expect(f.branches.activeBranch.id).toBe('a');
    });

    test('successful branch reinitialization retires its old action preparation before the next init', async () => {
        const f = fixture();
        await f.branches.initBranches([]);
        expect(f.events).toContain('action.clear');
        await f.branches.initBranches([]);
        expect(f.events.filter((event) => event === 'action.prepare')).toHaveLength(2);
    });

    test('style transactions commit before draining their new rebases and saving history', async () => {
        const f = fixture();
        const history = f.data.get('a')!.history;
        let committed = false;
        let drained = false;
        Object.assign(f.engine.action, {
            waitForQueuedStyleDispatches: async () => undefined,
            finishQueuedStyleAction: async () => { committed = true; },
            flushAndWaitForPendingRebases: async () => {
                expect(committed).toBe(true);
                drained = true;
            },
        });
        f.writeWith(async () => true);
        await history.startTransaction();
        await history.push({ type: 'update-style', targets: [] });
        await f.branches.clear();
        expect(drained).toBe(true);
        expect(saved.at(-1)?.undo).toHaveLength(2);
        expect(f.events).toContain('a.editor.cleanup');
    });

    test('engine pre-disposal failure keeps managers and guard alive and permits a new clear attempt', async () => {
        const f = fixture();
        refusedSaves.add('a');
        const first = f.engine.clear();
        expect(f.engine.clear()).toBe(first);
        await expect(first).rejects.toThrow('save refused');
        expect(f.events.filter((event) => event.endsWith('.clear') || event.endsWith('.cleanup') || event.endsWith('.dispose'))).toEqual([]);
        expect(f.engine.isClosing).toBe(false);
        expect(f.data.get('a')!.history.canUndo).toBe(true);
        refusedSaves.clear();
        const retry = f.engine.clear();
        expect(retry).not.toBe(first);
        await retry;
        expect(f.events).toContain('code.clear');
        expect(f.engine.clear()).toBe(retry);
    });

    test('engine shares an in-flight flush and awaits captured text before branch disposal', async () => {
        const f = fixture();
        const wait = deferred();
        f.waitText(wait.promise);
        const first = f.engine.clear();
        expect(f.engine.clear()).toBe(first);
        await Promise.resolve();
        expect(f.events).toEqual(['action.prepare', 'text.finalize']);
        expect(saved).toEqual([]);
        wait.resolve();
        await first;
        expect(f.events.indexOf('rebases.flush')).toBeLessThan(f.events.indexOf('a.sandbox.clear'));
        expect(f.events.filter((event) => event === 'a.editor.cleanup')).toHaveLength(1);
    });

    test('failure after destructive disposal is cached and never retried as a live editor', async () => {
        const f = fixture();
        f.failCleanup('a');
        const first = f.engine.clear();
        await expect(first).rejects.toThrow('index cleanup failed');
        expect(f.engine.isClosing).toBe(true);
        expect(f.events).toContain('code.clear');
        expect(f.engine.clear()).toBe(first);
        await expect(f.engine.clear()).rejects.toThrow('index cleanup failed');
        expect(f.events.filter((event) => event === 'a.editor.cleanup')).toHaveLength(1);
        await expect(f.engine.initBranches([])).rejects.toThrow('previous editor');
        await expect(f.engine.init()).rejects.toThrow('previous editor');
    });

    test('normal text end shares its local owner with an already running responsive acknowledgement', async () => {
        const f = textRebaseFixture();
        const wait = deferred();
        await f.text.start(f.target, f.view);
        f.holdResponsive(wait.promise);
        f.action.requestSourceRebase('heading', 'color');
        f.action.flushPendingRebases();
        await f.started.promise;
        const ending = f.text.end();
        await f.stopping.promise;
        expect(f.history.isPreparingForDisposal).toBe(true);
        expect(f.writes[0]!.getHistoryLease?.()).toBeDefined();
        expect(() => f.action.requestSourceRebase('late', 'color')).toThrow('Keep this editor open');
        wait.resolve();
        await ending;
        expect(f.text.isEditing).toBe(false);
        expect(f.history.isPreparingForDisposal).toBe(false);
        expect(f.action.hasPendingRebases).toBe(false);
        expect(saved.at(-1)?.version).toBe(f.currentVersion());
        expect(saved.at(-1)?.undo.some((entry) => entry.type === 'edit-text' && entry.newContent === 'Final')).toBe(true);
        f.action.clear();
    });

    test('normal text finalization drains the responsive rebase created by its strict gesture commit', async () => {
        const f = textRebaseFixture();
        await f.text.start(f.target, f.view);
        await f.history.push({ type: 'update-style', targets: [{
            oid: 'heading', branchId: 'a', domId: 'heading', frameId: 'frame',
            change: { original: { color: { value: 'black', type: StyleChangeType.Value } },
                updated: { color: { value: 'red', type: StyleChangeType.Value } } },
        }] });
        expect(f.writes).toEqual([]);
        await f.text.end();
        expect(f.writes).toHaveLength(1);
        expect(f.text.isEditing).toBe(false);
        expect(f.action.hasPendingRebases).toBe(false);
        expect(f.history.isPreparingForDisposal).toBe(false);
        expect(saved.at(-1)?.version).toBe(f.currentVersion());
        expect(saved.at(-1)?.undo.some((entry) => entry.type === 'update-style')).toBe(true);
        f.action.clear();
    });
});
