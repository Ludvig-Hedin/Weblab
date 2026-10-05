import { describe, expect, test } from 'bun:test';

import type { Action, EditTextAction } from '@weblab/models/actions';
import type { EditorEngine } from '../engine';
import { HistoryManager } from '../history';
import { ActionManager } from './index';

const text: EditTextAction = {
    type: 'edit-text',
    targets: [{ oid: 'title', domId: 'dom', branchId: 'branch', frameId: 'frame' }],
    originalContent: 'Before', newContent: 'After',
};

function fixture(action: Action = text, redo = false) {
    const writes: Action[] = [];
    const source = {
        canWrite: true, canDesign: false, isContentMode: true,
        approvedTextBindings: [{ oid: 'title', path: 'app/page.tsx', generation: 1 }],
        getSourceVersion: () => 'revision-1',
        canEditText: (path: string, oid: string) => source.canWrite &&
            source.approvedTextBindings.some((binding) => binding.path === path && binding.oid === oid),
    };
    const branch = {
        branch: { id: 'branch', runtime: { type: 'cloud', cloud: { sourceVersion: 1 } } },
        sandbox: { cloudSource: source },
        codeEditor: { getJsxElementMetadata: async (_oid: string) => ({ path: 'app/page.tsx' }) },
        history: null as HistoryManager | null,
    };
    const engine = {
        branches: { hasActiveBranch: true, activeBranchData: branch },
        code: { write: async (candidate: Action) => {
            writes.push(candidate);
            // Stop before preview dispatch; successful source replay is covered by
            // the existing history/source tests. A refused write preserves history.
            return false;
        } },
        posthog: { capture: () => undefined },
        history: null as HistoryManager | null,
    };
    const history = new HistoryManager(engine as unknown as EditorEngine, 'branch',
        redo ? [] : [action], redo ? [action] : []);
    branch.history = history;
    engine.history = history;
    const manager = new ActionManager(engine as unknown as EditorEngine);
    return { source, branch, history, manager, writes };
}

describe('cloud Build history admission', () => {
    for (const direction of ['undo', 'redo'] as const) {
        test(`${direction} leaves a locked design action untouched without sending source`, async () => {
            const current = fixture({ type: 'update-style', targets: [] }, direction === 'redo');
            await current.manager[direction]();
            expect(current.writes).toEqual([]);
            expect(direction === 'undo' ? current.history.canUndo : current.history.canRedo).toBe(true);
        });

        test(`${direction} admits approved text and preserves source-failure rollback`, async () => {
            const current = fixture(text, direction === 'redo');
            await current.manager[direction]();
            expect(current.writes).toHaveLength(1);
            expect(current.writes[0]).toMatchObject({
                type: 'edit-text', newContent: direction === 'undo' ? 'Before' : 'After',
            });
            expect(direction === 'undo' ? current.history.canUndo : current.history.canRedo).toBe(true);
        });
    }

    test('rejects a target whose source path no longer matches its approval', async () => {
        const current = fixture();
        current.branch.codeEditor.getJsxElementMetadata = async () => ({ path: 'app/other/page.tsx' });
        await current.manager.undo();
        expect(current.writes).toEqual([]);
        expect(current.history.canUndo).toBe(true);
    });

    test('rechecks approval generation after asynchronous source lookup', async () => {
        const current = fixture();
        current.branch.codeEditor.getJsxElementMetadata = async () => {
            current.source.approvedTextBindings = [{ oid: 'title', path: 'app/page.tsx', generation: 2 }];
            return { path: 'app/page.tsx' };
        };
        await current.manager.undo();
        expect(current.writes).toEqual([]);
        expect(current.history.canUndo).toBe(true);
    });

    test('rechecks role loss after asynchronous source lookup', async () => {
        const current = fixture();
        current.branch.codeEditor.getJsxElementMetadata = async () => {
            current.source.canWrite = false;
            return { path: 'app/page.tsx' };
        };
        await current.manager.undo();
        expect(current.writes).toEqual([]);
        expect(current.history.canUndo).toBe(true);
    });

    test('rejects an unapproved rich-text slot even when the root is approved', async () => {
        const current = fixture({ ...text, textSlots: [{ oid: 'locked-child', index: 0, oldText: 'a', newText: 'b' }] });
        await current.manager.undo();
        expect(current.writes).toEqual([]);
        expect(current.history.canUndo).toBe(true);
    });

    test('keeps native design replay available without content contracts', async () => {
        const current = fixture({ type: 'update-style', targets: [] });
        current.branch.branch.runtime.cloud.sourceVersion = 0;
        await current.manager.undo();
        expect(current.writes).toHaveLength(1);
    });
});
