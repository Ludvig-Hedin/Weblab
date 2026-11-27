import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { observable } from 'mobx';

import { StyleChangeType } from '@weblab/models/style';
import type { Action, UpdateStyleAction } from '@weblab/models/actions';

import { HistoryManager } from './index';

// Track storage calls without touching IndexedDB/localforage.
const clearHistoryCalls: string[] = [];
const saveHistoryCalls: Array<{ branchId: string; undo: Action[]; redo: Action[] }> = [];

void mock.module('./storage', () => ({
    loadHistory: async () => null,
    saveHistory: async (branchId: string, undo: Action[], redo: Action[]) => {
        saveHistoryCalls.push({ branchId, undo, redo });
    },
    clearHistory: async (branchId: string) => {
        clearHistoryCalls.push(branchId);
    },
}));

const stubEngine = {
    code: { hasPendingWrites: false, waitForPendingWrites: async () => undefined },
} as unknown as ConstructorParameters<typeof HistoryManager>[0];
const sampleAction = (): Action => ({ type: 'update-style', targets: [] });

describe('HistoryManager teardown: dispose() vs clear()', () => {
    beforeEach(() => {
        clearHistoryCalls.length = 0;
        saveHistoryCalls.length = 0;
    });

    it('dispose() empties in-memory stacks WITHOUT deleting persisted history', async () => {
        const mgr = new HistoryManager(stubEngine, 'branch-1', [sampleAction()], [sampleAction()]);
        expect(mgr.canUndo).toBe(true);

        await mgr.dispose();

        // Persisted history is preserved so re-opening the project can hydrate it.
        expect(clearHistoryCalls).toEqual([]);
        // In-memory stacks are dropped (the manager is being torn down).
        expect(mgr.canUndo).toBe(false);
        expect(mgr.canRedo).toBe(false);
    });

    it('clear() empties in-memory stacks AND deletes persisted history for the branch', async () => {
        const mgr = new HistoryManager(stubEngine, 'branch-2', [sampleAction()], [sampleAction()]);

        mgr.clear();
        // Storage writes are serialized on a promise chain.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(clearHistoryCalls).toEqual(['branch-2']);
        expect(mgr.canUndo).toBe(false);
        expect(mgr.canRedo).toBe(false);
    });
});


describe('HistoryManager new gesture source baseline', () => {
    function sourceFixture() {
        const revisions = { own: '0', external: '0', version: '1' };
        const engine = observable({ code: { hasPendingWrites: false, waitForPendingWrites: async () => undefined }, action: { hasPendingRebases: false, hasPendingStylePreflights: false }, text: { isFinalizing: false } });
        const history = new HistoryManager(engine as unknown as ConstructorParameters<typeof HistoryManager>[0], 'baseline-test', [sampleAction()]);
        history.setSourceVersion(() => revisions.version, () => revisions.external, () => revisions.own);
        return { revisions, engine, history };
    }

    it('adopts completed startup own writes before a new text gesture', async () => {
        const { revisions, history } = sourceFixture();
        revisions.own = '2'; revisions.version = '3';
        await history.startTransaction();
        expect(history.canUndo).toBe(false);
        const lease = history.beginDisposalPreparation();
        await expect(history.flushForDisposal(lease)).resolves.toBeDefined();
        history.cancelDisposalPreparation(lease);
    });

    it('does not adopt external changes or a retained failed text session', async () => {
        for (const failure of ['external', 'finalizing', 'pending', 'transaction'] as const) {
            const { revisions, engine, history } = sourceFixture();
            if (failure === 'transaction') await history.startTransaction();
            revisions.own = '2'; revisions.version = '3';
            if (failure === 'external') revisions.external = '1';
            if (failure === 'finalizing') engine.text.isFinalizing = true;
            if (failure === 'pending') engine.code.hasPendingWrites = true;
            await history.startTransaction();
            const lease = history.beginDisposalPreparation();
            await expect(history.flushForDisposal(lease)).rejects.toThrow('source changed');
            history.cancelDisposalPreparation(lease);
        }
    });
});

describe('released gesture during close', () => {
    it.each(['retry close', 'resume editing'])('retries released resizes in order on %s', async recovery => {
        const attempts: string[] = [];
        const valueOf = (action: Action) => {
            if (action.type !== 'update-style') throw new Error('Expected resize');
            return action.targets[0]!.change.updated.width!.value;
        };
        const resize = (value: string): UpdateStyleAction => ({
            type: 'update-style',
            targets: [{ oid: 'box', frameId: 'frame', domId: 'box', branchId: 'released',
                change: { original: {}, updated: { width: { type: StyleChangeType.Value, value } } } }],
        });
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const engine = {
            code: { write: async (action: Action) => {
                attempts.push(valueOf(action));
                return attempts.length > 1;
            }, waitForPendingWrites: async () => undefined },
            posthog: { capture: () => undefined },
            action: { waitForQueuedStyleDispatches: async () => undefined, finishQueuedStyleAction: async () => undefined },
        } as unknown as ConstructorParameters<typeof HistoryManager>[0];
        const history = new HistoryManager(engine, 'released');
        const released = ['13px', '27px'].map(value => {
            void history.startTransaction();
            const sample = history.runStyleInGesture(async queue => {
                if (value === '13px') await gate;
                return queue(resize(value));
            });
            return Promise.all([sample, history.commitTransaction()]);
        });
        void history.startTransaction();
        let releaseLast!: () => void;
        const lastGate = new Promise<void>(resolve => { releaseLast = resolve; });
        const lastSample = history.runStyleInGesture(async queue => {
            await lastGate;
            return queue(resize('39px'));
        });
        const close = history.dispose();
        release();
        await Promise.all(released);
        await expect(close).rejects.toThrow('could not be saved');
        const values = ['13px', '27px', '39px'];
        if (recovery === 'resume editing') {
            void history.startTransaction();
            await history.runStyleInGesture(async queue => queue(resize('51px')));
            void history.commitTransaction();
            values.push('51px');
        }
        const retry = history.dispose();
        releaseLast();
        expect(await lastSample).toBe(true);
        await retry;
        expect(attempts).toEqual(['13px', ...values]);
        expect(saveHistoryCalls.at(-1)?.undo.map(valueOf)).toEqual(values);
    });

    it.each(['refuse', 'throw'])('retains a released gesture through repeated %s on resume and close', async failure => {
        const attempts: string[] = [];
        const resize = (value: string): UpdateStyleAction => ({
            type: 'update-style', targets: [{ oid: 'box', frameId: 'frame', domId: 'box', branchId: 'released',
                change: { original: {}, updated: { width: { type: StyleChangeType.Value, value } } } }],
        });
        const engine = {
            code: { write: async (action: UpdateStyleAction) => {
                attempts.push(action.targets[0]!.change.updated.width!.value);
                if (attempts.length >= 4) return true;
                if (failure === 'throw') throw new Error('could not be saved');
                return false;
            }, waitForPendingWrites: async () => undefined },
            action: { waitForQueuedStyleDispatches: async () => undefined, finishQueuedStyleAction: async () => undefined },
            posthog: { capture: () => undefined },
        } as unknown as ConstructorParameters<typeof HistoryManager>[0];
        const history = new HistoryManager(engine, 'released');
        await history.startTransaction();
        await history.push(resize('13px'));
        await expect(history.dispose()).rejects.toThrow('could not be saved');
        await history.startTransaction();
        expect(attempts).toEqual(['13px', '13px']);
        await history.push(resize('27px'));
        await expect(history.dispose()).rejects.toThrow('could not be saved');
        expect(history.length).toBe(0);
        await history.dispose();
        expect(attempts).toEqual(['13px', '13px', '13px', '13px', '27px']);
        expect(saveHistoryCalls.at(-1)?.undo).toHaveLength(2);
    });

    for (const saved of [true, false]) {
        it(`drains the admitted sample and ${saved ? 'closes after save' : 'refuses close after failure'}`, async () => {
            const writes: Action[] = [];
            let writable = saved;
            const engine = {
                code: { write: async (entry: Action) => { writes.push(entry); return writable; },
                    waitForPendingWrites: async () => undefined },
                posthog: { capture: () => undefined },
                action: { waitForQueuedStyleDispatches: async () => undefined, finishQueuedStyleAction: async () => undefined },
            } as unknown as ConstructorParameters<typeof HistoryManager>[0];
            const history = new HistoryManager(engine, 'released');
            let release!: () => void;
            const gate = new Promise<void>(done => { release = done; });
            await history.startTransaction();
            const sample = history.runStyleInGesture(async queue => {
                await gate;
                return queue({ type: 'update-style', targets: [] });
            });
            const committed = history.commitTransaction();
            const close = history.dispose();
            release();
            expect(await sample).toBe(true);
            await committed;
            if (saved) await close;
            else await expect(close).rejects.toThrow('could not be saved');
            expect(writes).toHaveLength(1);
            if (!saved) {
                expect(history.isInTransaction).toBe(false);
                expect(history.hasRetainedActions).toBe(true);
                writable = true;
                await history.dispose();
                expect(writes).toHaveLength(2);
            }
        });
    }
});
