import { describe, expect, it } from 'bun:test';

import type { UpdateStyleAction } from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';

import type { EditorEngine } from '../engine';
import { ActionManager } from './index';

describe('static HTML style safety', () => {
    it('refuses a style action before history can queue it in a transaction', async () => {
        let queued = 0;
        const manager = new ActionManager({
            framework: 'static-html',
            history: { push: () => { queued += 1; return Promise.resolve(true); } },
        } as unknown as EditorEngine);

        expect(await manager.run({ type: 'update-style', targets: [] })).toBe(false);
        expect(queued).toBe(0);
    });

    it('refuses direct style actions before touching a preview frame', async () => {
        let previewReads = 0;
        const manager = new ActionManager({
            framework: 'static-html',
            elements: {
                get selected() {
                    previewReads += 1;
                    return [];
                },
            },
        } as unknown as EditorEngine);

        await manager.updateStyle({ type: 'update-style', targets: [] });

        expect(previewReads).toBe(0);
    });
});

describe('unsupported local style safety', () => {
    it('rejects a local branch without a wired style writer before history or preview', async () => {
        let queued = 0;
        const manager = new ActionManager({
            framework: 'nextjs',
            branches: { getStyleWriterForBranch: () => 'none' },
            history: { push: async () => { queued += 1; return true; } },
        } as unknown as EditorEngine);
        const action: UpdateStyleAction = {
            type: 'update-style',
            targets: [{
                frameId: 'frame', branchId: 'branch', domId: 'dom', oid: 'oid',
                breakpoint: undefined,
                change: { original: {}, updated: {} },
            }],
        };
        expect(await manager.run(action)).toBe(false);
        expect(queued).toBe(0);
    });

    it('rejects a breakpoint font stack before queuing a source action', async () => {
        let queued = 0;
        const manager = new ActionManager({
            framework: 'nextjs',
            branches: { getStyleWriterForBranch: () => 'tailwind' },
            frames: { getAll: () => [
                { frame: { branchId: 'branch', breakpoint: { width: 390 } } },
                { frame: { branchId: 'branch', breakpoint: { width: 1440 } } },
            ] },
            history: { push: async () => { queued += 1; return true; } },
        } as unknown as EditorEngine);
        expect(await manager.run({ type: 'update-style', targets: [{
            frameId: 'frame', branchId: 'branch', domId: 'dom', oid: 'oid',
            breakpoint: { id: 'desktop', name: 'Desktop', minWidth: 1440 },
            change: { original: {}, updated: {
                fontFamily: { value: 'inter', type: StyleChangeType.Value },
            } },
        }] })).toBe(false);
        expect(queued).toBe(0);
    });
});

describe('queued style dispatch', () => {
    it('waits for an earlier transaction commit before pushing a direct style edit', async () => {
        const events: string[] = [];
        const manager = new ActionManager({
            framework: 'nextjs',
            history: {
                isCommitPending: true,
                isInTransaction: false,
                waitForCommit: async () => { events.push('commit'); },
                push: async () => { events.push('push'); return false; },
            },
            // A direct edit previews at once; an empty action touches no frame.
            elements: { selected: [] },
        } as unknown as EditorEngine);

        expect(await manager.run({ type: 'update-style', targets: [] })).toBe(false);
        expect(events).toEqual(['commit', 'push']);
    });

    it('waits for preview and mirror completion before a transaction can commit', async () => {
        let finishPreview: ((value: null) => void) | undefined;
        const preview = new Promise<null>((resolve) => { finishPreview = resolve; });
        const events: string[] = [];
        const manager = new ActionManager({
            framework: 'nextjs',
            history: { isInTransaction: true, push: async () => true },
            elements: { selected: [] },
            theme: { getColorByName: () => null },
            frames: {
                get: () => ({ view: { updateStyle: () => preview } }),
                getAll: () => [],
            },
        } as unknown as EditorEngine);
        const action: UpdateStyleAction = {
            type: 'update-style',
            targets: [{
                frameId: 'frame', branchId: 'branch', domId: 'dom', oid: 'oid',
                breakpoint: undefined,
                change: {
                    original: { opacity: { type: StyleChangeType.Value, value: '1' } },
                    updated: { opacity: { type: StyleChangeType.Value, value: '0.5' } },
                },
            }],
        };

        const run = manager.run(action, () => { events.push('applied'); });
        const wait = manager.waitForQueuedStyleDispatches().then(() => { events.push('wait'); });
        await Promise.resolve();
        expect(events).toEqual([]);

        finishPreview?.(null);
        await Promise.all([run, wait]);
        expect(events).toEqual(['applied', 'wait']);
    });
});
