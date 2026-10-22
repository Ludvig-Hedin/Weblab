import { describe, expect, it } from 'bun:test';
import type { CloudTextApproval, EditTextAction } from '@weblab/models/actions';
import type { EditorEngine } from '../engine';
import { CodeManager } from './index';

const pin: CloudTextApproval = { version: 2, projectId: 'project', branchId: 'branch', actorId: 'actor',
    path: 'src/components/hero.tsx', bindingId: 'title', target: { kind: 'component-literal', exportName: 'Hero', oid: 'title' },
    generation: 1, designRevision: 1 };
const original = 'export function Hero() { return  <header className={styles.hero}><span data-oid="title">Before</span><span>Keep</span></header>; }';
const action: EditTextAction = { type: 'edit-text', targets: [{ branchId: 'branch', frameId: 'frame', domId: 'dom', oid: 'title' }],
    originalContent: 'Before', newContent: 'After', cloudText: pin };
function fixture(sourcePin = pin, initial = original) {
    let content = initial;
    let current = true;
    let beforeRead = async () => {};
    const writes: Array<{ path: string; content: string }> = [];
    const leases: Array<{ pin: CloudTextApproval; revision: number; candidate: string }> = [];
    const errors: string[] = [];
    const source = { canWrite: true, isContentMode: true, state: { profile: 'imported-next-v1', savedRevision: 1, localDraftChanges: false },
        getExternalRevision: () => 'external-1', isTextApprovalCurrent: () => current,
        withApprovedTextWrite: async (write: typeof leases[number], save: () => Promise<boolean>) => { leases.push(write); return save(); } };
    const codeEditor = { getJsxElementMetadata: async () => ({ path: sourcePin.renderMapping?.renderer.path ?? sourcePin.path }),
        readFile: async () => { await beforeRead(); return content; },
        writeCloudTextFile: async (path: string, value: string) => { writes.push({ path, content: value }); content = value; },
        writeFiles: async () => { throw new Error('Generic writer must not be used'); } };
    const branch = { branch: { id: 'branch', runtime: { type: 'cloud', cloud: { sourceVersion: 1 } } }, codeEditor, sandbox: { cloudSource: source } };
    const engine = { branches: { getBranchDataById: () => branch, activeError: { addCodeApplicationError: (message: string) => { errors.push(message); } } } };
    const manager = new CodeManager(engine as unknown as EditorEngine);
    return { manager, source, writes, leases, errors, content: () => content, revoke: () => { current = false; },
        onRead: (run: typeof beforeRead) => { beforeRead = run; } };
}
describe('pinned component text source writer', () => {
    it('uses exact replacement for save and inverse without formatting the surrounding component', async () => {
        const f = fixture();
        expect(await f.manager.write(action)).toBe(true);
        expect(f.content()).toBe(original.replace('>Before<', '>{"After"}<'));
        expect(f.leases[0]).toMatchObject({ pin, revision: 1, candidate: f.content() });
        expect(await f.manager.write({ ...action, originalContent: 'After', newContent: 'Before' })).toBe(true);
        expect(f.content()).toBe(original.replace('>Before<', '>{"Before"}<'));
        expect(f.errors).toEqual([]);
    });
    it('refuses source drift, revoked approval and unpinned imported edits without generic fallback', async () => {
        const f = fixture();
        expect(await f.manager.write({ ...action, originalContent: 'Wrong baseline' })).toBe(false);
        f.onRead(async () => { f.revoke(); });
        expect(await f.manager.write(action)).toBe(false);
        const unpinned = { ...action }; delete unpinned.cloudText;
        expect(await f.manager.write(unpinned)).toBe(false);
        expect(f.writes).toEqual([]);
        expect(f.content()).toBe(original);
    });
});


it('writes and reverses only the pinned FAQ owner leaf, keeping the renderer expression intact', async () => {
    const dataPin: CloudTextApproval = { ...pin, path: 'src/content/home-faq.ts',
        target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'audience', property: 'answer' },
        renderMapping: { version: 1, kind: 'keyed-prop-map', mappingId: 'faq',
            callsite: { path: 'src/components/home-faq.tsx', exportName: 'HomeFaq', oid: 'call' },
            renderer: { path: 'src/components/chat-faq.tsx', exportName: 'ChatFaq', oid: 'title' } } };
    const data = 'export const homeFaqItems = [{ id: "audience", question: "Why?", answer: "Before" }, { id: "pricing", question: "Cost?", answer: "Keep" }];';
    const f = fixture(dataPin, data);
    const edit: EditTextAction = { ...action, cloudText: dataPin };
    expect(await f.manager.write(edit)).toBe(true);
    expect(f.content()).toBe(data.replace('"Before"', '"After"'));
    expect(f.writes.map(write => write.path)).toEqual([dataPin.path]);
    expect(await f.manager.write({ ...edit, originalContent: 'After', newContent: 'Before' })).toBe(true);
    expect(f.content()).toBe(data);
    expect(f.leases.every(lease => lease.pin.renderMapping?.mappingId === 'faq')).toBe(true);
});
