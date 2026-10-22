import { describe, expect, test } from 'bun:test';

import type { Action, CloudTextApproval, EditTextAction } from '@weblab/models/actions';
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


function faqPreviewFixture() {
    const pin: CloudTextApproval = { version: 2, projectId: 'project', branchId: 'branch', actorId: 'actor',
        path: 'src/content/home-faq.ts', bindingId: 'audience-answer', generation: 1, designRevision: 1,
        target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'audience', property: 'answer' },
        renderMapping: { version: 1, kind: 'keyed-prop-map', mappingId: 'faq',
            callsite: { path: 'src/components/home-faq.tsx', exportName: 'HomeFaq', oid: 'call' },
            renderer: { path: 'src/components/chat-faq.tsx', exportName: 'ChatFaq', oid: 'answer' } } };
    const edited: string[] = [];
    const updated: string[] = [];
    const values: string[] = [];
    const source = { isTextApprovalCurrent: () => true, getSourceVersion: () => 'one', getExternalRevision: () => 'one' };
    const branch = { sandbox: { cloudSource: source }, codeEditor: {
        getJsxElementMetadata: async () => ({ path: pin.renderMapping!.renderer.path }),
        readFile: async () => 'export const homeFaqItems = [{ id: "audience", question: "Why?", answer: "Before" }, { id: "pricing", question: "Cost?", answer: "Keep" }];',
    } };
    const frames = ['desktop', 'phone'].map(id => {
        const elements = ['audience', 'pricing'].map(itemId => ({ domId: `${id}-${itemId}`, oid: 'answer',
            branchId: 'branch', frameId: id, instanceId: itemId, contentIdentity: { mappingId: 'faq', itemId } }));
        return { frame: { id, branchId: 'branch' }, elements, view: {
            getElementByDomId: async (domId: string) => elements.find(el => el.domId === domId),
            editText: async () => { throw new Error('Legacy text bridge must not run for approved text'); },
            editPlainTextV1: async (domId: string, value: string) => {
                edited.push(domId); values.push(value);
                return { domEl: elements.find(el => el.domId === domId)!, newMap: new Map(), textRenderMode: 'plain-string-v1' };
            },
        } };
    });
    const engine = { branches: { getBranchDataById: () => branch },
        frames: { getAll: () => frames, get: (id: string) => frames.find(frame => frame.frame.id === id) },
        ast: { updateMap: (_frame: string, _map: unknown, domId: string) => { updated.push(domId); }, mappings: { getMapping: (id: string) => new Map(frames.find(frame => frame.frame.id === id)!.elements.map(el => [el.domId, el])) } } };
    return { pin, frames, edited, updated, values, manager: new ActionManager(engine as unknown as EditorEngine) };
}

describe('keyed FAQ preview identity', () => {
    test('updates only one record across responsive frames with shared renderer OIDs', async () => {
        const f = faqPreviewFixture();
        await f.manager.previewApprovedText(f.pin, 'After');
        expect(f.edited.sort()).toEqual(['desktop-audience', 'phone-audience']);
    });
    test('refuses duplicate matching records within a frame before updating either one', async () => {
        const f = faqPreviewFixture();
        const desktop = f.frames[0]!;
        desktop.elements.push({ ...desktop.elements[0]!, domId: 'duplicate' });
        expect(await f.manager.approvedTextElements(f.pin, 'desktop')).toBeNull();
        await f.manager.previewApprovedText(f.pin, 'After');
        expect(f.edited).toEqual(['phone-audience']);
    });
});


describe('approved preview response contract', () => {
    test('sends the exact multiline value to every matching responsive copy', async () => {
        const f = faqPreviewFixture();
        const value = ' First\n\n\nSecond\t ';
        await f.manager.previewApprovedText(f.pin, value);
        expect(f.values).toEqual([value, value]);
        expect(f.updated.sort()).toEqual(['desktop-audience', 'phone-audience']);
    });
    test('wrong response mode or identity never updates the AST', async () => {
        for (const field of ['mode', 'item', 'dom', 'frame', 'branch', 'instance']) {
            const f = faqPreviewFixture();
            const desktop = f.frames[0]!;
            const original = desktop.view.editPlainTextV1;
            desktop.view.editPlainTextV1 = async (domId, value) => {
                const result = await original(domId, value);
                if (field === 'mode') result.textRenderMode = 'legacy';
                if (field === 'item') result.domEl = { ...result.domEl, contentIdentity: { mappingId: 'faq', itemId: 'pricing' } };
                if (field === 'dom') result.domEl = { ...result.domEl, domId: 'other' };
                if (field === 'frame') result.domEl = { ...result.domEl, frameId: 'other' };
                if (field === 'branch') result.domEl = { ...result.domEl, branchId: 'other' };
                if (field === 'instance') result.domEl = { ...result.domEl, instanceId: 'other' };
                return result;
            };
            await f.manager.previewApprovedText(f.pin, 'After');
            expect(f.updated).toEqual(['phone-audience']);
        }
    });
    test('an older frame does not receive a legacy fallback edit', async () => {
        const f = faqPreviewFixture();
        Reflect.deleteProperty(f.frames[0]!.view, 'editPlainTextV1');
        await f.manager.previewApprovedText(f.pin, 'After');
        expect(f.edited).toEqual(['phone-audience']);
        expect(f.updated).toEqual(['phone-audience']);
    });
});
