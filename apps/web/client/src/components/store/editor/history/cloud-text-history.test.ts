import { describe, expect, it } from 'bun:test';
import type { CloudTextApproval, EditTextAction } from '@weblab/models/actions';
import { transformRedoAction, undoAction, updateTransactionActions } from './helpers';

const pin: CloudTextApproval = { version: 2, projectId: 'project', branchId: 'branch', actorId: 'actor',
    path: 'src/components/hero.tsx', bindingId: 'hero-title', target: { kind: 'component-literal', exportName: 'Hero', oid: 'title' },
    generation: 3, designRevision: 2 };
const action: EditTextAction = { type: 'edit-text', targets: [{ branchId: 'branch', frameId: 'frame', domId: 'dom', oid: 'title' }],
    originalContent: 'Before', newContent: 'After', cloudText: pin };
describe('component text history identity', () => {
    it('keeps original approval through inverse, serialized history and redo', () => {
        const restored = JSON.parse(JSON.stringify(action)) as EditTextAction;
        expect(undoAction(restored)).toMatchObject({ originalContent: 'After', newContent: 'Before', cloudText: pin });
        const redo = transformRedoAction(restored) as EditTextAction;
        expect(redo).toEqual(action);
        expect(redo.cloudText).not.toBe(restored.cloudText);
        expect(redo.cloudText?.target).not.toBe(restored.cloudText?.target);
    });
    it('merges typing only under the same immutable authority, never across renewed approvals', () => {
        const next = { ...action, newContent: 'Final' };
        expect(updateTransactionActions([action], next)).toEqual([next]);
        for (const changed of [{ ...pin, actorId: 'other' }, { ...pin, generation: 4 }, { ...pin, designRevision: 4 },
            { ...pin, bindingId: 'renewed' }, { ...pin, target: { ...pin.target, exportName: 'Other' } }]) {
            const separate = { ...next, cloudText: changed };
            expect(updateTransactionActions([action], separate)).toEqual([action, separate]);
        }
        const unpinned = { ...next }; delete unpinned.cloudText;
        expect(updateTransactionActions([action], unpinned)).toEqual([action, unpinned]);
    });
});


it('keeps FAQ records and fields separate under the same renderer OID and clones the whole mapping', () => {
    const dataPin: CloudTextApproval = { ...pin, path: 'src/content/home-faq.ts',
        target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'audience', property: 'answer' },
        renderMapping: { version: 1, kind: 'keyed-prop-map', mappingId: 'faq',
            callsite: { path: 'src/components/home-faq.tsx', exportName: 'HomeFaq', oid: 'call' },
            renderer: { path: 'src/components/chat-faq.tsx', exportName: 'ChatFaq', oid: 'title' } } };
    const first: EditTextAction = { ...action, cloudText: dataPin };
    const second: EditTextAction = { ...first, cloudText: { ...dataPin,
        target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'pricing', property: 'answer' } } };
    expect(updateTransactionActions([first], second)).toEqual([first, second]);
    const question: EditTextAction = { ...first, cloudText: { ...dataPin,
        target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'audience', property: 'question' } } };
    expect(updateTransactionActions([first], question)).toEqual([first, question]);
    const restored = JSON.parse(JSON.stringify(first)) as EditTextAction;
    const redo = transformRedoAction(restored) as EditTextAction;
    expect(undoAction(restored)).toMatchObject({ cloudText: dataPin, originalContent: 'After' });
    expect(redo.cloudText).toEqual(dataPin);
    expect(redo.cloudText?.renderMapping?.renderer).not.toBe(restored.cloudText?.renderMapping?.renderer);
});
