import { describe, expect, mock, test } from 'bun:test';
import type { DomElement, EditTextAction, TextSlotEdit } from '@weblab/models';
import type { EditorEngine } from '../engine';
import type { IFrameView } from '@/app/project/[id]/_components/canvas/frame/view';

void mock.module('../overlay/utils', () => ({ adaptRectToCanvas: (rect: unknown) => rect, adaptValueToCanvas: (value: number) => value }));
const { TextEditingManager } = await import('./index');

function fixture(cloudSource?: { canWrite: boolean }) {
    const pushedA: EditTextAction[] = [];
    const pushedB: EditTextAction[] = [];
    let startsA = 0;
    let commitsA = 0;
    let commitsB = 0;
    let flushesA = 0;
    let stopCalls = 0;
    let flushFailure: Error | null = null;
    let stopFailure: Error | null = null;
    let stopWait: Promise<void> | null = null;
    let navigationEligible = true;
    let navigationReleases = 0;
    // Real history is a class instance, which MobX preserves by identity.
    const historyA = Object.assign(new (class FixtureHistory {})(), {
        canNavigateRejectedText: () => navigationEligible,
        beginDisposalPreparation: () => ({ owner: Symbol('fixture-text') }),
        cancelDisposalPreparation: () => { navigationReleases++; },
        getExternalRevisionForDisposal: () => undefined,
        acknowledgeDisposalSourceWrite: () => undefined,
        startTransaction: async () => { startsA++; },
        push: async (action: EditTextAction) => { pushedA.push(action); return true; },
        pushForDisposal: async (action: EditTextAction): Promise<boolean> => historyA.push(action),
        commitTransaction: async () => { commitsA++; },
        commitForDisposal: async (): Promise<void> => historyA.commitTransaction(),
        flushForDisposal: async (): Promise<void> => {
            flushesA++;
            if (flushFailure) throw flushFailure;
        },
    });
    const historyB = {
        push: async (action: EditTextAction) => { pushedB.push(action); return true; },
        commitTransaction: async () => { commitsB++; },
    };
    const target = { domId: 'heading', oid: 'heading', branchId: 'a', frameId: 'frame', instanceId: null, rect: {} } as DomElement;
    let slots: TextSlotEdit[] | undefined;
    const view = {
        id: 'frame',
        startEditingText: async () => ({ domEl: target, originalContent: 'Hello', rich: true }),
        getComputedStyleByDomId: async () => ({}),
        stopEditingText: async () => {
            stopCalls++;
            if (stopWait) await stopWait;
            if (stopFailure) throw stopFailure;
            const result = { domEl: target, newContent: 'Final', textSlots: slots };
            slots = [];
            return result;
        },
        editText: async () => ({ domEl: target, textSlots: slots }),
    } as unknown as IFrameView;
    const engine = {
        history: historyA,
        branches: { getBranchDataById: () => ({ history: historyA,
            branch: { runtime: cloudSource ? { cloud: { sourceVersion: 1 } } : {} },
            sandbox: { cloudSource } }) },
        action: { beginHistoryDisposalPreparation: () => undefined, cancelHistoryDisposalPreparation: () => undefined,
            flushAndWaitForPendingRebases: async () => undefined },
        frames: { get: () => ({ view }) },
        overlay: { clearUI: () => undefined, refresh: async () => undefined,
            state: { addTextEditor: () => undefined, removeTextEditor: () => undefined, updateTextEditor: () => undefined } },
    } as unknown as EditorEngine;
    const manager = new TextEditingManager(engine);
    manager.isChildTextEditable = async () => true;
    return { manager, target, view, pushedA, pushedB, counts: () => ({ startsA, commitsA, commitsB }),
        finalized: () => ({ flushesA, stopCalls }),
        navigationEligible: (value: boolean) => { navigationEligible = value; },
        navigationReleases: () => navigationReleases,
        failFlush: (error: Error | null) => { flushFailure = error; },
        failStop: (error: Error | null) => { stopFailure = error; },
        waitStop: (wait: Promise<void>) => { stopWait = wait; },
        richSlots: (value: TextSlotEdit[]) => { slots = value; },
        closeEngine: () => { (manager as unknown as { editorEngine: EditorEngine }).editorEngine.isClosing = true; },
        emptyRich: () => { slots = []; },
        switchBranch: () => { ((manager as unknown as { editorEngine: { history: unknown } }).editorEngine).history = historyB; } };
}

describe('text source session', () => {
    test('cloud source refusing writes blocks a new text session before contacting the frame', async () => {
        const f = fixture({ canWrite: false });
        let contacted = false;
        f.view.startEditingText = async () => { contacted = true; return null; };
        await f.manager.start(f.target, f.view);
        expect(contacted).toBe(false);
        expect(f.manager.hasPendingWork).toBe(false);
        expect(f.counts().startsA).toBe(0);
    });

    test('pending cloud text start is protected and rolls back if source becomes unavailable', async () => {
        const source = { canWrite: true };
        const f = fixture(source);
        let entered!: () => void;
        let release!: () => void;
        const waiting = new Promise<void>((resolve) => { release = resolve; });
        const entering = new Promise<void>((resolve) => { entered = resolve; });
        f.view.getComputedStyleByDomId = async () => { entered(); await waiting; return {}; };
        const starting = f.manager.start(f.target, f.view);
        await entering;
        expect(f.manager.isEditing).toBe(false);
        expect(f.manager.hasPendingWork).toBe(true);
        source.canWrite = false;
        release();
        await starting;
        expect(f.counts().startsA).toBe(0);
        expect(f.finalized().stopCalls).toBe(1);
        expect(f.manager.hasPendingWork).toBe(false);
    });

    test('latest input including hard breaks remains recoverable when the frame reply is lost', async () => {
        const f = fixture();
        await f.manager.start(f.target, f.view);
        let release!: () => void;
        const waiting = new Promise<void>((resolve) => { release = resolve; });
        f.view.editText = async () => { await waiting; throw new Error('frame lost'); };
        const editing = f.manager.edit('New heading\nSecond line');
        expect(f.manager.recoverableText).toBe('New heading\nSecond line');
        expect(f.manager.hasPendingWork).toBe(true);
        release();
        await editing;
        f.failStop(new Error('stop reply lost'));
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('stop reply lost');
        expect(f.manager.recoverableText).toBe('New heading\nSecond line');
        expect(f.manager.hasPendingWork).toBe(true);
    });

    test('a later cloud source conflict preserves the active text session and its input', async () => {
        const source = { canWrite: true };
        const f = fixture(source);
        await f.manager.start(f.target, f.view);
        source.canWrite = false;
        await f.manager.edit('Keep this draft');
        expect(f.manager.isEditing).toBe(true);
        expect(f.manager.hasPendingWork).toBe(true);
        expect(f.manager.recoverableText).toBe('Keep this draft');
        expect(f.finalized().stopCalls).toBe(0);
        expect(f.pushedA[0]?.newContent).toBe('Keep this draft');
    });

    test('a no-change rich session never creates flattened source history', async () => {
        const f = fixture();
        f.emptyRich();
        await f.manager.start(f.target, f.view);
        await f.manager.end();
        expect(f.pushedA).toEqual([]);
        expect(f.counts()).toEqual({ startsA: 1, commitsA: 1, commitsB: 0 });
    });

    test('editing and ending after a branch switch keeps the original history', async () => {
        const f = fixture();
        await f.manager.start(f.target, f.view);
        f.switchBranch();
        await f.manager.edit('Changed');
        await f.manager.end();
        expect(f.pushedA).toHaveLength(2);
        expect(f.pushedB).toEqual([]);
        expect(f.pushedA[0]?.targets[0]?.branchId).toBe('a');
        expect(f.counts()).toEqual({ startsA: 1, commitsA: 1, commitsB: 0 });
    });

    test('failed final save keeps its rich result and retries without another stop or push', async () => {
        const f = fixture();
        const slots: TextSlotEdit[] = [{ oid: 'heading', index: 0, oldText: 'Hello', newText: 'Final' }];
        f.richSlots(slots);
        await f.manager.start(f.target, f.view);
        f.closeEngine();
        f.failFlush(new Error('storage unavailable'));
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('storage unavailable');
        expect(f.manager.isEditing).toBe(true);
        expect(f.manager.hasPendingWork).toBe(true);
        expect(f.manager.recoverableText).toBe('Final');
        expect(f.manager.isFinalizing).toBe(true);
        await f.manager.edit('Must not replace the retained final text');
        expect(f.manager.recoverableText).toBe('Final');
        expect(f.pushedA[0]?.textSlots).toEqual(slots);
        f.failFlush(null);
        await f.manager.finalizeForDisposal();
        expect(f.manager.isEditing).toBe(false);
        expect(f.manager.hasPendingWork).toBe(false);
        expect(f.manager.recoverableText).toBeNull();
        expect(f.manager.isFinalizing).toBe(false);
        expect(f.pushedA).toHaveLength(1);
        expect(f.finalized()).toEqual({ flushesA: 2, stopCalls: 1 });
    });

    test('override failure keeps the stopped session and retries the same final content', async () => {
        const f = fixture();
        const contents: string[] = [];
        let refuse = true;
        await f.manager.start(f.target, f.view, async (content) => {
            contents.push(content);
            if (refuse) throw new Error('override refused');
        });
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('override refused');
        expect(f.manager.isEditing).toBe(true);
        refuse = false;
        await f.manager.finalizeForDisposal();
        expect(contents).toEqual(['Final', 'Final']);
        expect(f.finalized().stopCalls).toBe(1);
        expect(f.pushedA).toEqual([]);
    });

    test('an override already saved is not invoked again when history persistence fails', async () => {
        const f = fixture();
        let overrides = 0;
        await f.manager.start(f.target, f.view, async () => { overrides++; });
        f.failFlush(new Error('history refused'));
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('history refused');
        f.failFlush(null);
        await f.manager.finalizeForDisposal();
        expect(overrides).toBe(1);
        expect(f.finalized().stopCalls).toBe(1);
    });

    test('a lost stop reply remains blocked because a retry could have empty consumed rich slots', async () => {
        const f = fixture();
        await f.manager.start(f.target, f.view);
        f.failStop(new Error('frame reply lost'));
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('frame reply lost');
        f.failStop(null);
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('frame reply lost');
        expect(f.manager.isEditing).toBe(true);
        expect(f.finalized()).toEqual({ flushesA: 0, stopCalls: 1 });
        expect(f.pushedA).toEqual([]);
    });

    test('normal end and strict disposal share an in-flight stop; closing admits no new edit', async () => {
        const f = fixture();
        await f.manager.start(f.target, f.view);
        let release!: () => void;
        f.waitStop(new Promise<void>((resolve) => { release = resolve; }));
        const ending = f.manager.end();
        f.closeEngine();
        const disposing = f.manager.finalizeForDisposal();
        await f.manager.edit('Too late');
        expect(f.pushedA).toEqual([]);
        expect(f.manager.isEditing).toBe(true);
        release();
        await Promise.all([ending, disposing]);
        expect(f.pushedA).toHaveLength(1);
        expect(f.finalized()).toEqual({ flushesA: 1, stopCalls: 1 });
    });

    test('a text start admitted before closing keeps its frame result for the strict finalizer', async () => {
        const f = fixture();
        let entered!: () => void;
        let release!: () => void;
        const waiting = new Promise<void>((resolve) => { release = resolve; });
        const entering = new Promise<void>((resolve) => { entered = resolve; });
        const readStyle = f.view.getComputedStyleByDomId;
        f.view.getComputedStyleByDomId = async (...args) => { entered(); await waiting; return readStyle(...args); };
        const slots: TextSlotEdit[] = [{ oid: 'heading', index: 0, oldText: 'Hello', newText: 'Final' }];
        f.richSlots(slots);
        const starting = f.manager.start(f.target, f.view);
        await entering;
        f.closeEngine();
        const disposing = f.manager.finalizeForDisposal();
        release();
        await Promise.all([starting, disposing]);
        expect(f.counts().startsA).toBe(0);
        expect(f.pushedA[0]?.textSlots).toEqual(slots);
        expect(f.finalized().stopCalls).toBe(1);
        expect(f.manager.isEditing).toBe(false);
    });
});


describe('rejected cloud text navigation', () => {
    test('keeps captured text and blocks replay until the exact navigation lease is released', async () => {
        const f = fixture({ canWrite: true });
        await f.manager.start(f.target, f.view);
        f.failFlush(new Error('source rejected'));
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('source rejected');
        const counts = { ...f.finalized(), ...f.counts(), pushes: f.pushedA.length };
        const releases = f.navigationReleases();
        const lease = f.manager.prepareRejectedCloudNavigation('a');
        lease.assertCurrent();
        expect(f.manager.recoverableText).toBe('Final');
        expect(f.manager.hasPendingWork).toBe(true);
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('confirmed cloud reload');
        await f.manager.edit('Must not replace retained text');
        expect(f.manager.recoverableText).toBe('Final');
        expect({ ...f.finalized(), ...f.counts(), pushes: f.pushedA.length }).toEqual(counts);
        expect(() => f.manager.prepareRejectedCloudNavigation('a')).toThrow();
        lease.release();
        lease.release();
        expect(f.navigationReleases()).toBe(releases + 1);
        expect(() => lease.assertCurrent()).toThrow();
        expect(f.manager.recoverableText).toBe('Final');
    });

    test('refuses active, native, wrong-branch and unrelated-history sessions', async () => {
        const cloud = fixture({ canWrite: true });
        await cloud.manager.start(cloud.target, cloud.view);
        expect(() => cloud.manager.prepareRejectedCloudNavigation('a')).toThrow('settled rejected');
        cloud.failFlush(new Error('rejected'));
        await expect(cloud.manager.finalizeForDisposal()).rejects.toThrow('rejected');
        expect(() => cloud.manager.prepareRejectedCloudNavigation('b')).toThrow('settled rejected');
        cloud.navigationEligible(false);
        expect(() => cloud.manager.prepareRejectedCloudNavigation('a')).toThrow('Other history');
        cloud.navigationEligible(true);
        const lease = cloud.manager.prepareRejectedCloudNavigation('a');
        cloud.navigationEligible(false);
        expect(() => lease.assertCurrent()).toThrow();
        lease.release();
        const native = fixture();
        await native.manager.start(native.target, native.view);
        native.failFlush(new Error('rejected'));
        await expect(native.manager.finalizeForDisposal()).rejects.toThrow('rejected');
        expect(() => native.manager.prepareRejectedCloudNavigation('a')).toThrow('settled rejected');
    });
});
