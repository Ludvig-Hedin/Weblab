import { beforeEach, describe, expect, it, mock } from 'bun:test';

import type { Action, EditTextAction, InsertElementAction } from '@weblab/models/actions';
import { EditorAttributes } from '@weblab/constants';

import { transformRedoAction, updateTransactionActions } from './helpers';
import { HistoryManager } from './index';

// Storage mock (same approach as dispose.test.ts) — no IndexedDB/localforage.
let loadHistoryResult: { undoStack: Action[]; redoStack: Action[] } | null = null;

void mock.module('./storage', () => ({
    loadHistory: async () => loadHistoryResult,
    saveHistory: async () => undefined,
    clearHistory: async () => undefined,
}));

type Engine = ConstructorParameters<typeof HistoryManager>[0];

const makeEngine = (write: (action: Action) => Promise<boolean>): Engine =>
    ({
        code: { write },
        posthog: { capture: () => undefined },
    }) as unknown as Engine;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

const editTextAction = (oid: string, newContent: string): EditTextAction => ({
    type: 'edit-text',
    targets: [{ domId: `dom-${oid}`, oid, frameId: 'frame-1', branchId: 'branch-1' }],
    originalContent: 'before',
    newContent,
});

const imageInsertAction = (): InsertElementAction => ({
    type: 'insert-element',
    targets: [{ domId: 'dom-img', oid: 'oid-img', frameId: 'frame-1', branchId: 'branch-1' }],
    location: { type: 'append', targetDomId: 'dom-parent', targetOid: 'oid-parent' },
    element: {
        domId: 'dom-img',
        oid: 'oid-img',
        branchId: 'branch-1',
        tagName: 'img',
        attributes: {
            class: 'w-24',
            src: '/assets/cat.png',
            alt: 'A cat',
        },
        styles: {},
        textContent: null,
        children: [],
    },
    editText: null,
    pasteParams: null,
    codeBlock: null,
});

beforeEach(() => {
    loadHistoryResult = null;
});

describe('A7: commitTransaction vs racing startTransaction/undo', () => {
    it('reports a failed queued style write so the preview can roll back', async () => {
        const finishes: boolean[] = [];
        const engine = {
            code: { write: async () => false },
            action: { finishQueuedStyleAction: async (_action: Action, saved: boolean) => {
                finishes.push(saved);
            }, waitForQueuedStyleDispatches: async () => undefined },
            posthog: { capture: () => undefined },
        } as unknown as Engine;
        const mgr = new HistoryManager(engine, 'branch-style-failure');

        void mgr.startTransaction();
        await mgr.push({ type: 'update-style', targets: [] });
        await mgr.commitTransaction();

        expect(finishes).toEqual([false]);
        expect(mgr.length).toBe(0);
    });

    it('a startTransaction during an in-flight commit does not capture the commit pushes', async () => {
        const gate = deferred<boolean>();
        const mgr = new HistoryManager(
            makeEngine(() => gate.promise),
            'branch-a7',
        );

        void mgr.startTransaction();
        await mgr.push(editTextAction('el-1', 'hello'));
        const commit = mgr.commitTransaction();

        // A new gesture begins while the commit's code write is in flight.
        void mgr.startTransaction();
        gate.resolve(true);
        await commit;

        // The committed action landed on the undo stack instead of being
        // re-captured (and lost) inside the new, never-committed transaction.
        expect(mgr.length).toBe(1);
        expect(mgr.isInTransaction).toBe(true);

        // Closing the (empty) new gesture must not change the stack.
        await mgr.commitTransaction();
        expect(mgr.length).toBe(1);
    });

    it('undo right after a non-awaited commit waits for it and pops the committed action', async () => {
        const previous = editTextAction('el-old', 'old');
        const gate = deferred<boolean>();
        const mgr = new HistoryManager(
            makeEngine(() => gate.promise),
            'branch-a7',
            [previous],
        );

        void mgr.startTransaction();
        await mgr.push(editTextAction('el-new', 'new'));
        const commit = mgr.commitTransaction(); // fire-and-forget slider release
        const undoPromise = mgr.undo(); // user hits cmd+Z immediately after

        gate.resolve(true);
        await commit;
        const result = await undoPromise;

        // undo popped the just-committed action — not `previous`.
        expect(result).not.toBeNull();
        const redoEntry = result?.redoEntry;
        expect(redoEntry?.type).toBe('edit-text');
        expect(redoEntry?.type === 'edit-text' ? redoEntry.targets[0]?.oid : null).toBe('el-new');
        // `previous` is still undoable underneath.
        expect(mgr.length).toBe(1);
    });
});

describe('B2: undo during an in-flight write', () => {
    it('skips an action whose write fails and pops the previous one instead', async () => {
        const previous = editTextAction('el-old', 'old');
        const gate = deferred<boolean>();
        const mgr = new HistoryManager(
            makeEngine(() => gate.promise),
            'branch-b2',
            [previous],
        );

        const pushPromise = mgr.push(editTextAction('el-fail', 'nope'));
        const undoPromise = mgr.undo();
        gate.resolve(false); // the code write FAILS

        expect(await pushPromise).toBe(false);
        const result = await undoPromise;

        // undo skipped the never-landed action and popped `previous`.
        // (toEqual, not toBe — MobX deep-observes the stacks, so entries come
        // back as observable proxies of the original action.)
        expect(result?.redoEntry).toEqual(previous);
        // The failed action is on NEITHER stack: only `previous` is redoable.
        const firstRedo = await mgr.redo();
        expect(firstRedo?.redoEntry).toEqual(previous);
        expect(await mgr.redo()).toBeNull();
    });
});

describe('B4: transaction merge matches type + target identity', () => {
    it('two edit-text actions on different elements both survive', () => {
        const first = editTextAction('el-1', 'one');
        const second = editTextAction('el-2', 'two');
        let actions = updateTransactionActions([], first);
        actions = updateTransactionActions(actions, second);
        expect(actions).toEqual([first, second]);
    });

    it('a same-element edit-text still replaces the earlier one', () => {
        const first = editTextAction('el-1', 'one');
        const updated = editTextAction('el-1', 'one-final');
        let actions = updateTransactionActions([], first);
        actions = updateTransactionActions(actions, updated);
        expect(actions).toEqual([updated]);
    });

    it('both edits land as separate undo entries through a real transaction', async () => {
        const mgr = new HistoryManager(
            makeEngine(() => Promise.resolve(true)),
            'branch-b4',
        );
        void mgr.startTransaction();
        await mgr.push(editTextAction('el-1', 'one'));
        await mgr.push(editTextAction('el-2', 'two'));
        await mgr.commitTransaction();
        expect(mgr.length).toBe(2);
    });
});

describe('B3: redo of an image insert keeps semantic attributes', () => {
    it('transformRedoAction preserves src/alt on the re-cleaned element', () => {
        const redone = transformRedoAction(imageInsertAction());
        expect(redone.type).toBe('insert-element');
        if (redone.type !== 'insert-element') {
            return;
        }
        expect(redone.element.attributes.src).toBe('/assets/cat.png');
        expect(redone.element.attributes.alt).toBe('A cat');
        // Editor bookkeeping attributes are still (re)applied.
        expect(redone.element.attributes[EditorAttributes.DATA_WEBLAB_ID]).toBe('oid-img');
        expect(redone.element.attributes[EditorAttributes.DATA_WEBLAB_INSERTED]).toBe('true');
    });
});

describe('B13: hydrate merges instead of replacing', () => {
    it('prepends persisted entries under pre-hydrate actions and only runs once', async () => {
        const persisted = editTextAction('el-persisted', 'p');
        loadHistoryResult = { undoStack: [persisted], redoStack: [] };
        const live = editTextAction('el-live', 'l');
        const mgr = new HistoryManager(
            makeEngine(() => Promise.resolve(true)),
            'branch-b13',
            [live],
        );

        await mgr.hydrate();
        expect(mgr.length).toBe(2);

        // A second hydrate must not re-prepend the persisted entries.
        await mgr.hydrate();
        expect(mgr.length).toBe(2);

        // Undo order: the live (newer) action pops first, persisted underneath.
        // (toEqual — the stacks are MobX-observable, entries are proxies.)
        const first = await mgr.undo();
        expect(first?.redoEntry).toEqual(live);
        const second = await mgr.undo();
        expect(second?.redoEntry).toEqual(persisted);
    });
});

describe('history replay admission', () => {
    it('a refused approved-field edit preserves the existing redo stack', async () => {
        const prior = editTextAction('old', 'saved');
        const current = new HistoryManager(makeEngine(async () => true), 'field-admission', [], [prior]);
        let writes = 0;
        const action = { type: 'write-code' as const, diffs: [], cloudAttribute: { version: 1 } };
        expect(await current.pushImmediate(action, async () => { writes++; return false; }, () => false)).toBe(false);
        expect(writes).toBe(0);
        expect(current.canRedo).toBe(true);
        expect(current.canUndo).toBe(false);
        // A revocation can also arrive after admission but before the source write.
        expect(await current.pushImmediate(action, async () => { writes++; return false; }, () => true)).toBe(false);
        expect(writes).toBe(1);
        expect(current.canRedo).toBe(true);
        expect(current.canUndo).toBe(false);
    });

    it('checks admission after pending writes settle and before moving either stack', async () => {
        const write = deferred<boolean>();
        const current = new HistoryManager(makeEngine(() => write.promise), 'admission-pending');
        const pushed = current.push(editTextAction('new', 'saved'));
        let admitted = false;
        const undo = current.undo(() => { admitted = true; return false; });
        await Promise.resolve();
        expect(admitted).toBe(false);
        write.resolve(true);
        await pushed;
        expect(await undo).toBeNull();
        expect(admitted).toBe(true);
        expect(current.canUndo).toBe(true);
        expect(current.canRedo).toBe(false);
    });

    it('does not pop a newer action that arrives during asynchronous admission', async () => {
        const gate = deferred<boolean>();
        const entered = deferred<void>();
        const current = new HistoryManager(makeEngine(async () => true), 'admission-race',
            [editTextAction('old', 'older')]);
        const undo = current.undo(async () => { entered.resolve(); return gate.promise; });
        await entered.promise;
        await current.push(editTextAction('new', 'newer'));
        gate.resolve(true);
        expect(await undo).toBeNull();
        expect(current.length).toBe(2);
        expect(current.canRedo).toBe(false);
    });

    it('keeps denied redo intact so design mode can replay it later', async () => {
        const previous = editTextAction('old', 'saved');
        const current = new HistoryManager(makeEngine(async () => true), 'admission-redo', [], [previous]);
        expect(await current.redo(() => false)).toBeNull();
        expect(current.canRedo).toBe(true);
        expect(current.canUndo).toBe(false);
        expect((await current.redo())?.forward).toEqual(previous);
    });
});


describe('rejected text navigation eligibility', () => {
    it('admits only the exact settled text transaction without changing history', async () => {
        let writes = 0;
        const mgr = new HistoryManager(makeEngine(async () => { writes++; return true; }), 'branch-1', [editTextAction('old', 'saved')]);
        const text = editTextAction('heading', 'rejected');
        await mgr.startTransaction();
        await mgr.push(text);
        expect(mgr.canNavigateRejectedText(text.targets[0]!)).toBe(true);
        expect(mgr.canNavigateRejectedText({ ...text.targets[0]!, oid: 'other' })).toBe(false);
        expect(mgr.canNavigateRejectedText({ ...text.targets[0]!, branchId: 'other' })).toBe(false);
        const lease = mgr.beginDisposalPreparation();
        expect(mgr.canNavigateRejectedText(text.targets[0]!)).toBe(false);
        expect(mgr.canNavigateRejectedText(text.targets[0]!, lease)).toBe(true);
        expect(mgr.canNavigateRejectedText(text.targets[0]!, { owner: Symbol('other') })).toBe(false);
        mgr.cancelDisposalPreparation(lease);
        expect(mgr.length).toBe(1);
        expect(mgr.isTransactionOpen).toBe(true);
        expect(writes).toBe(0);
        await mgr.push(imageInsertAction());
        expect(mgr.canNavigateRejectedText(text.targets[0]!)).toBe(false);
        expect(mgr.length).toBe(1);
        expect(writes).toBe(0);
    });

    it('refuses an in-flight history write', async () => {
        const gate = deferred<boolean>();
        const mgr = new HistoryManager(makeEngine(() => gate.promise), 'branch-1');
        const text = editTextAction('heading', 'saving');
        await mgr.startTransaction();
        await mgr.push(text);
        const saving = mgr.commitTransaction();
        expect(mgr.canNavigateRejectedText(text.targets[0]!)).toBe(false);
        gate.resolve(true);
        await saving;
        expect(mgr.canNavigateRejectedText(text.targets[0]!)).toBe(true);
        expect(mgr.length).toBe(1);
    });
});
