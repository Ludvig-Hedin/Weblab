import { describe, expect, it } from 'bun:test';

import type { UpdateStyleAction } from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';

import type { EditorEngine } from '../engine';
import { ActionManager } from './index';

function styleAction(from: string, to: string): UpdateStyleAction {
    return {
        type: 'update-style',
        targets: [{
            frameId: 'frame', branchId: 'branch', domId: 'dom', oid: null,
            breakpoint: undefined,
            change: {
                original: { color: { value: from, type: StyleChangeType.Value } },
                updated: { color: { value: to, type: StyleChangeType.Value } },
            },
        }],
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

function setup() {
    const painted: string[] = [];
    const saves: Array<ReturnType<typeof deferred<boolean>>> = [];
    const engine = {
        framework: 'nextjs',
        branches: { getStyleWriterForBranch: () => 'tailwind' },
        frames: {
            getAll: () => [],
            get: () => ({
                view: {
                    updateStyle: async (_domId: string, change: UpdateStyleAction['targets'][number]['change']) => {
                        painted.push(change.updated.color?.value ?? '');
                        return null;
                    },
                },
            }),
        },
        elements: { selected: [] },
        theme: { getColorByName: () => undefined },
        style: { recordOverrideForOid: () => undefined },
        breakpoints: { activeId: 'desktop' },
        history: {
            isInTransaction: false,
            isCommitPending: false,
            push: () => {
                const save = deferred<boolean>();
                saves.push(save);
                return save.promise;
            },
        },
    } as unknown as EditorEngine;
    return { manager: new ActionManager(engine), painted, saves };
}

describe('optimistic style edits', () => {
    it('paints the frame before the source save finishes', async () => {
        const { manager, painted, saves } = setup();
        let applied = false;
        const run = manager.run(styleAction('red', 'blue'), () => { applied = true; });
        await Promise.resolve();
        expect(painted).toEqual(['blue']);
        // The override map and panel mirror wait for the save.
        expect(applied).toBe(false);
        saves[0]!.resolve(true);
        expect(await run).toBe(true);
        expect(applied).toBe(true);
        expect(painted).toEqual(['blue']);
    });

    it('restores the original value when the save fails', async () => {
        const { manager, painted, saves } = setup();
        const run = manager.run(styleAction('red', 'blue'));
        await Promise.resolve();
        saves[0]!.resolve(false);
        expect(await run).toBe(false);
        expect(painted).toEqual(['blue', 'red']);
    });

    it('makes undo wait for an edit that is still saving', async () => {
        const { manager, saves } = setup();
        let saved = false;
        const undoSaw: boolean[] = [];
        (manager as unknown as { editorEngine: EditorEngine }).editorEngine.history.undo =
            async () => { undoSaw.push(saved); return null; };
        const run = manager.run(styleAction('red', 'blue'));
        const undo = manager.undo();
        await Promise.resolve();
        expect(undoSaw).toEqual([]);
        saved = true;
        saves[0]!.resolve(true);
        await Promise.all([run, undo]);
        expect(undoSaw).toEqual([true]);
    });

    it('keeps a newer preview when an older save fails', async () => {
        const { manager, painted, saves } = setup();
        const first = manager.run(styleAction('red', 'blue'));
        const second = manager.run(styleAction('blue', 'green'));
        await Promise.resolve();
        saves[0]!.resolve(false);
        expect(await first).toBe(false);
        saves[1]!.resolve(true);
        expect(await second).toBe(true);
        expect(painted).toEqual(['blue', 'green']);
    });
});
