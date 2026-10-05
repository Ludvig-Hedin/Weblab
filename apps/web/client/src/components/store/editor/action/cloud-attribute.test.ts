import { describe, expect, mock, test } from 'bun:test';
import type { Action, WriteCodeAction } from '@weblab/models/actions';
import { formatContent } from '@weblab/parser/src/prettier';
import type { EditorEngine } from '../engine';
import type { CloudAttributeField, CloudAttributeWrite } from '../sandbox/cloud-source';
import { HistoryManager } from '../history';
import { ActionManager } from './index';

mock.module('../history/storage', () => ({ loadHistory: async () => null, saveHistory: async () => undefined, clearHistory: async () => undefined }));

async function fixture() {
    let content = await formatContent('app/page.tsx', 'export default function Page(){return <main data-oid="main"><img data-oid="image" src="/one.png" alt="First image" className="rounded" /></main>}');
    const original = content;
    const writes: WriteCodeAction[] = [];
    const pins: CloudAttributeWrite[] = [];
    const source = {
        canWrite: true, canDesign: false, isContentMode: true, hasLocalWork: false,
        state: { savedRevision: 1, contracts: { actorId: 'customer' } },
        approvedAttributeBindings: [{ path: 'app/page.tsx', oid: 'image', generation: 1,
            fields: ['src', 'alt', 'className'] as CloudAttributeField[],
            allowedValues: { src: ['/one.png', '/two.png'] }, choices: { round: 'rounded', square: 'rounded-none' } }],
        canEditAttribute(path: string, oid: string, field: CloudAttributeField, value?: string) {
            const binding = this.approvedAttributeBindings.find((entry) => entry.path === path && entry.oid === oid);
            return this.canWrite && !!binding?.fields.includes(field) && (value === undefined || field === 'alt' ||
                (field === 'src' ? binding.allowedValues.src.includes(value) : field === 'className' && Object.values(binding.choices).includes(value)));
        },
        async withApprovedAttributeWrite(write: CloudAttributeWrite, save: () => Promise<boolean>) {
            if (write.actorId !== this.state.contracts.actorId || write.revision !== this.state.savedRevision ||
                !this.approvedAttributeBindings.some((binding) => binding.generation === write.generation && binding.oid === write.oid)) return false;
            pins.push({ ...write });
            return save();
        },
    };
    const branch = {
        branch: { id: 'branch', runtime: { type: 'cloud', cloud: { sourceVersion: 1 } } },
        sandbox: { cloudSource: source },
        codeEditor: { getJsxElementMetadata: async (_oid: string) => ({ path: 'app/page.tsx' }), readFile: async (_path: string) => content },
        history: null as HistoryManager | null,
    };
    const engine = {
        branches: { hasActiveBranch: true, activeBranchData: branch, getBranchDataById: (id: string) => id === 'branch' ? branch : null },
        code: { write: async (action: Action) => {
            if (action.type !== 'write-code' || action.diffs[0]?.original !== content) return false;
            writes.push(JSON.parse(JSON.stringify(action)) as WriteCodeAction);
            content = action.diffs[0]!.generated;
            source.state.savedRevision++;
            return true;
        } },
        posthog: { capture: () => undefined },
        history: null as HistoryManager | null,
    };
    const history = new HistoryManager(engine as unknown as EditorEngine, 'branch');
    branch.history = history; engine.history = history;
    const manager = new ActionManager(engine as unknown as EditorEngine);
    const edit = (field: CloudAttributeField, value: string) => manager.editApprovedAttribute({
        branchId: 'branch', path: 'app/page.tsx', oid: 'image', field, value,
        expectedRevision: source.state.savedRevision, expectedGeneration: 1,
    });
    return { source, branch, engine, manager, history, writes, pins, edit, original, content: () => content };
}

describe('approved cloud attributes use durable action history', () => {
    test('saves an approved image and replays its exact source with pinned actor and approval', async () => {
        const f = await fixture();
        expect(await f.edit('src', '/two.png')).toBe(true);
        const saved = f.content();
        expect(saved).toContain('src="/two.png"');
        await f.manager.undo();
        expect(f.content()).toBe(f.original);
        await f.manager.redo();
        expect(f.content()).toBe(saved);
        expect(f.pins.map((pin) => [pin.actorId, pin.generation, pin.field, pin.value])).toEqual([
            ['customer', 1, 'src', '/two.png'], ['customer', 1, 'src', '/one.png'], ['customer', 1, 'src', '/two.png'],
        ]);
    });

    test('reapproval does not rebind an old undo to the new contract generation', async () => {
        const f = await fixture();
        await f.edit('alt', 'Second image');
        f.source.approvedAttributeBindings[0]!.generation = 2;
        await f.manager.undo();
        expect(f.writes).toHaveLength(1);
        expect(f.history.canUndo).toBe(true);
    });

    test('role loss and actor changes refuse replay without clearing history', async () => {
        const f = await fixture();
        await f.edit('alt', 'Second image');
        f.source.canWrite = false;
        await f.manager.undo();
        f.source.canWrite = true;
        f.source.state.contracts.actorId = 'other';
        await f.manager.undo();
        expect(f.writes).toHaveLength(1);
        expect(f.history.canUndo).toBe(true);
    });

    test('named class choices save but arbitrary classes and image URLs do not', async () => {
        const f = await fixture();
        expect(await f.edit('className', 'absolute inset-0')).toBe(false);
        expect(await f.edit('src', '/not-approved.png')).toBe(false);
        expect(f.writes).toHaveLength(0);
        expect(await f.edit('className', 'rounded-none')).toBe(true);
        expect(f.content()).toContain('className="rounded-none"');
    });

    test('a moved OID or stale panel revision is rejected before history admission', async () => {
        const f = await fixture();
        f.branch.codeEditor.getJsxElementMetadata = async () => ({ path: 'app/moved/page.tsx' });
        expect(await f.edit('alt', 'Second image')).toBe(false);
        f.branch.codeEditor.getJsxElementMetadata = async () => {
            f.source.state.savedRevision++;
            return { path: 'app/page.tsx' };
        };
        expect(await f.edit('alt', 'Second image')).toBe(false);
        expect(f.writes).toHaveLength(0);
        expect(f.history.canUndo).toBe(false);
    });

    test('tagged history still rejects unrelated bytes instead of admitting generic code', async () => {
        const f = await fixture();
        const forged: WriteCodeAction & { cloudAttribute: object } = {
            type: 'write-code', branchId: 'branch', diffs: [{ path: 'app/page.tsx', original: f.original,
                generated: f.original.replace('alt="First image"', 'alt="Forged"').replace('className="rounded"', 'className="absolute"') }],
            cloudAttribute: { version: 1, actorId: 'customer', branchId: 'branch', path: 'app/page.tsx', oid: 'image', field: 'alt', generation: 1 },
        };
        const history = new HistoryManager(f.engine as unknown as EditorEngine, 'branch', [], [forged]);
        f.engine.history = history; f.branch.history = history;
        await f.manager.redo();
        expect(f.writes).toHaveLength(0);
        expect(history.canRedo).toBe(true);
    });
});


describe('prepared customer image cleanup', () => {
    test('cancels an unchanged image preparation but retains a possibly sent commit', async () => {
        const originalFetch = globalThis.fetch;
        try {
            for (const unchanged of [true, false]) {
                const f = await fixture();
                const cancellations: string[] = [];
                let commits = 0;
                Object.assign(f.engine, { activeSandbox: { cloudSource: f.source } });
                Object.assign(f.source, {
                    scope: { projectId: 'project', branchId: 'branch' },
                    cancelImagePreparation: async (id: string) => { cancellations.push(id); },
                    withImageUpload: async (_pin: unknown, _revision: number, run: (lease: object) => Promise<boolean>) => run({
                        current: () => true,
                        commit: async () => { commits++; throw new Error('Connection lost after send'); },
                    }),
                });
                globalThis.fetch = Object.assign(async () => Response.json({
                    attemptId: 'attempt', assetPath: unchanged ? 'public/one.png' : 'public/two.png',
                    hash: 'a'.repeat(64), bytes: btoa('image'),
                }), { preconnect: originalFetch.preconnect }) as typeof fetch;
                const result = await f.manager.uploadApprovedImage({
                    branchId: 'branch', path: 'app/page.tsx', oid: 'image', expectedRevision: 1, expectedGeneration: 1,
                }, new File(['image'], 'image.png', { type: 'image/png' }));
                expect(result).toBe(unchanged);
                expect(cancellations).toEqual(unchanged ? ['attempt'] : []);
                expect(commits).toBe(unchanged ? 0 : 1);
            }
        } finally { globalThis.fetch = originalFetch; }
    });
});
