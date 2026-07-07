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
