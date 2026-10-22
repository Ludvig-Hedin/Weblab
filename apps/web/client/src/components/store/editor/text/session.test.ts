import { describe, expect, mock, test } from 'bun:test';
import type { CloudTextApproval, DomElement, EditTextAction, TextSlotEdit } from '@weblab/models';
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
    return { engine: (manager as unknown as { editorEngine: EditorEngine }).editorEngine, manager, target, view, pushedA, pushedB, counts: () => ({ startsA, commitsA, commitsB }),
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
        expect(f.manager.pendingWorkBranchId).toBe('a');
        source.canWrite = false;
        release();
        await starting;
        expect(f.counts().startsA).toBe(0);
        expect(f.finalized().stopCalls).toBe(1);
        expect(f.manager.hasPendingWork).toBe(false);
        expect(f.manager.pendingWorkBranchId).toBeNull();
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


function importedTextFixture(faq = false) {
    let pin: CloudTextApproval = { version: 2, projectId: 'project', branchId: 'a', actorId: 'actor',
        path: 'src/components/hero.tsx', bindingId: 'heading-binding', generation: 1, designRevision: 1,
        target: { kind: 'component-literal', exportName: 'Hero', oid: 'heading' } };
    if (faq) pin = { ...pin, path: 'src/content/home-faq.ts',
        target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'audience', property: 'answer' },
        renderMapping: { version: 1, kind: 'keyed-prop-map', mappingId: 'faq',
            callsite: { path: 'src/components/home-faq.tsx', exportName: 'HomeFaq', oid: 'call' },
            renderer: { path: 'src/components/chat-faq.tsx', exportName: 'ChatFaq', oid: 'heading' } } };
    const source = { canWrite: true, isContentMode: true,
        state: { profile: 'imported-next-v1', savedRevision: 1, localDraftChanges: false,
            textContracts: { actorId: 'actor', contracts: [{ path: pin.path, current: true, bindings: [{ bindingId: pin.bindingId, target: pin.target }] }] } },
        resolveRenderedTextApproval: (element: DomElement) => faq && (element.contentIdentity?.itemId !== 'audience' || element.contentIdentity.mappingId !== 'faq')
            ? null : Object.freeze({ ...pin, target: Object.freeze({ ...pin.target }) }),
        isTextApprovalCurrent: (candidate: CloudTextApproval) => JSON.stringify(candidate) === JSON.stringify(pin),
        getExternalRevision: () => 'external-1' };
    const f = fixture(source);
    if (faq) f.target.contentIdentity = { mappingId: 'faq', itemId: 'audience' };
    const original = f.engine.branches.getBranchDataById('a')!;
    const codeEditor = { getJsxElementMetadata: async (_oid: string) => ({ path: pin.renderMapping?.renderer.path ?? pin.path }),
        readFile: async (_path: string): Promise<string> => faq ? 'export const homeFaqItems = [{ id: "audience", question: "Why?", answer: "Hello" }];' : 'export function Hero() { return <span data-oid="heading">Hello</span>; }' };
    const branch = { ...original, codeEditor };
    f.engine.branches.getBranchDataById = () => branch as unknown as typeof original;
    f.engine.action.previewApprovedText = async () => {};
    f.engine.action.approvedTextElements = async () => [f.target];
    const frameStarts: Array<boolean | undefined> = [];
    f.view.startEditingPlainTextV1 = async () => { frameStarts.push(false); return { domEl: f.target, originalContent: 'Hello', rich: false, textRenderMode: 'plain-string-v1' }; };
    f.view.editPlainTextV1 = async () => ({ domEl: f.target, newMap: null, textRenderMode: 'plain-string-v1' });
    const legacyStop = f.view.stopEditingText;
    f.view.stopEditingPlainTextV1 = async () => {
        const result = await legacyStop(f.target.domId);
        return result ? { domEl: result.domEl, newContent: result.newContent, textRenderMode: 'plain-string-v1' } : null;
    };
    return { ...f, source, codeEditor, frameStarts, pin: () => pin,
        renew: () => { pin = { ...pin, generation: pin.generation + 1 }; } };
}

describe('imported component text session', () => {
    test('opens exactly the clicked leaf and carries the opening approval into edits and final save', async () => {
        const f = importedTextFixture();
        await f.manager.start(f.target, f.view);
        expect(f.frameStarts).toEqual([false]);
        expect(f.manager.isEditing).toBe(true);
        await f.manager.edit('Updated');
        await f.manager.end();
        expect(f.pushedA.length).toBeGreaterThan(0);
        for (const action of f.pushedA) expect(action.cloudText).toEqual(f.pin());
        expect(f.pushedA.at(-1)).toMatchObject({ originalContent: 'Hello', newContent: 'Final' });
    });

    test('refuses a renewed approval during metadata lookup instead of adopting its new generation', async () => {
        const f = importedTextFixture();
        let entered!: () => void;
        let release!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        const waiting = new Promise<void>(resolve => { release = resolve; });
        f.codeEditor.getJsxElementMetadata = async () => { entered(); await waiting; return { path: f.pin().path }; };
        const opening = f.manager.start(f.target, f.view);
        await started; f.renew(); release(); await opening;
        expect(f.frameStarts).toEqual([]);
        expect(f.manager.isEditing).toBe(false);
        expect(f.manager.hasPendingWork).toBe(false);
        expect(f.pushedA).toEqual([]);
    });

    test('closes the hidden frame text if approval changes during the frame-style await', async () => {
        const f = importedTextFixture();
        f.view.getComputedStyleByDomId = async () => { f.renew(); return {}; };
        await f.manager.start(f.target, f.view);
        expect(f.frameStarts).toEqual([false]);
        expect(f.finalized().stopCalls).toBe(1);
        expect(f.manager.isEditing).toBe(false);
        expect(f.pushedA).toEqual([]);
    });
});


describe('keyed FAQ text session', () => {
    test('opens the native data leaf and retains its owner, item and mapping through finalization', async () => {
        const f = importedTextFixture(true);
        await f.manager.start(f.target, f.view);
        expect(f.frameStarts).toEqual([false]);
        expect(f.manager.isEditing).toBe(true);
        await f.manager.edit('Updated');
        await f.manager.end();
        expect(f.pushedA.length).toBeGreaterThan(0);
        for (const action of f.pushedA) expect(action.cloudText).toEqual(f.pin());
        expect(f.pushedA.at(-1)?.cloudText?.target).toMatchObject({ itemId: 'audience', property: 'answer' });
    });
    test('rejects missing metadata and duplicate rendered instances before hiding the leaf', async () => {
        for (const duplicate of [false, true]) {
            const f = importedTextFixture(true);
            if (duplicate) f.engine.action.approvedTextElements = async () => null;
            else delete f.target.contentIdentity;
            await f.manager.start(f.target, f.view);
            expect(f.frameStarts).toEqual([]);
            expect(f.manager.isEditing).toBe(false);
            expect(f.pushedA).toEqual([]);
        }
    });
    test('cannot retarget a pinned item when its bridge identity changes during editing', async () => {
        const f = importedTextFixture(true);
        await f.manager.start(f.target, f.view);
        f.view.editPlainTextV1 = async () => ({ domEl: { ...f.target, contentIdentity: { mappingId: 'faq', itemId: 'pricing' } }, newMap: null, textRenderMode: 'plain-string-v1' });
        await f.manager.edit('Wrong item');
        expect(f.pushedA).toEqual([]);
    });
});


describe('approved plain-string bridge contract', () => {
    test('preserves edge whitespace and repeated line breaks through opening and final readback', async () => {
        const f = importedTextFixture();
        const value = '  First\n\n\nSecond\t\u00a0 ';
        f.codeEditor.readFile = async () => `export function Hero() { return <span data-oid="heading">{${JSON.stringify(value)}}</span>; }`;
        f.view.startEditingPlainTextV1 = async () => ({ domEl: f.target, originalContent: value, textRenderMode: 'plain-string-v1' });
        f.view.stopEditingPlainTextV1 = async () => ({ domEl: f.target, newContent: value, textRenderMode: 'plain-string-v1' });
        await f.manager.start(f.target, f.view);
        expect(f.manager.isEditing).toBe(true);
        await f.manager.end();
        expect(f.pushedA.at(-1)).toMatchObject({ originalContent: value, newContent: value });
    });

    test('an old bridge never falls back to legacy start or edit', async () => {
        const f = importedTextFixture();
        let legacyCalls = 0;
        f.view.startEditingText = async () => { legacyCalls++; return null; };
        f.view.editText = async () => { legacyCalls++; return null; };
        Reflect.deleteProperty(f.view, 'startEditingPlainTextV1');
        await f.manager.start(f.target, f.view);
        expect(f.manager.isEditing).toBe(false);
        expect(legacyCalls).toBe(0);
        expect(f.pushedA).toEqual([]);
    });

    test('missing start marker and carriage-return source both refuse before opening an overlay', async () => {
        for (const carriageReturn of [false, true]) {
            const f = importedTextFixture();
            if (carriageReturn) f.codeEditor.readFile = async () => 'export function Hero() { return <span data-oid="heading">{"Hello\\rWorld"}</span>; }';
            else f.view.startEditingPlainTextV1 = async () => ({ domEl: f.target, originalContent: 'Hello' });
            await f.manager.start(f.target, f.view);
            expect(f.manager.isEditing).toBe(false);
            expect(f.pushedA).toEqual([]);
            if (carriageReturn) expect(f.frameStarts).toEqual([]);
        }
    });

    test('a stop response with wrong frame identity cannot save, and input remains recoverable', async () => {
        const f = importedTextFixture();
        await f.manager.start(f.target, f.view);
        f.view.stopEditingPlainTextV1 = async () => ({ domEl: { ...f.target, frameId: 'other' }, newContent: 'Wrong', textRenderMode: 'plain-string-v1' });
        await expect(f.manager.finalizeForDisposal()).rejects.toThrow('captured safely');
        expect(f.manager.recoverableText).toBe('Hello');
        expect(f.pushedA).toEqual([]);
    });
});


test('approved edit refuses a missing mode marker without recording changed text', async () => {
    const f = importedTextFixture();
    await f.manager.start(f.target, f.view);
    f.view.editPlainTextV1 = async () => ({ domEl: f.target, newMap: null } as unknown as NonNullable<Awaited<ReturnType<IFrameView['editPlainTextV1']>>>);
    await f.manager.edit('Keep recoverable');
    expect(f.pushedA).toEqual([]);
    expect(f.manager.recoverableText).toBe('Keep recoverable');
});
