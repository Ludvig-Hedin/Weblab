import { beforeEach, describe, expect, it, mock } from 'bun:test';

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
