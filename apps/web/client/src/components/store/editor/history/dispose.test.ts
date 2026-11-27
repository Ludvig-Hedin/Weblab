import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { observable } from 'mobx';

import type { Action } from '@weblab/models/actions';

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
                expect(history.isInTransaction).toBe(true);
                writable = true;
                await history.dispose();
                expect(writes).toHaveLength(2);
            }
        });
    }
});
