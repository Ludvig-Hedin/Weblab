import { describe, expect, it, mock } from 'bun:test';
import type { CloudImageApproval, WriteCodeAction } from '@weblab/models/actions';
import { readContentImageTarget, replaceContentImageTarget } from '@weblab/parser/src/code-edit/content-image-target';
import type { EditorEngine } from '../engine';
import { CodeManager } from '../code';
import { HistoryManager } from '../history';
import { transformRedoAction, undoAction, updateTransactionActions } from '../history/helpers';
import { copyCloudImageBinding } from '../sandbox/cloud-image-approval';
import type { CloudImagePrepared, CloudImagePrepareTarget } from '../sandbox/cloud-source';
// Shared in the two reserved test files so history uses the same real CloudSource transport fixture.
import { fixture as sourceFixture, pin } from '../sandbox/cloud-imported-images.test';
import { ActionManager } from './index';

type PersistedImageHistory = { undoStack: WriteCodeAction[]; redoStack: WriteCodeAction[] };
let persistedHistory: PersistedImageHistory | null = null;
mock.module('../history/storage', () => ({ loadHistory: async () => persistedHistory, saveHistory: async () => undefined, clearHistory: async () => undefined }));

function expectFrozenPin(value: CloudImageApproval): void {
    const visit = (part: unknown) => {
        if (part === null || typeof part !== 'object') return;
        expect(Object.isFrozen(part)).toBe(true);
        for (const nested of Object.values(part)) visit(nested);
    };
    expect(value).toEqual(pin);
    visit(value);
}

async function fixture() {
    const f = await sourceFixture();
    const branch = { branch: { id: pin.branchId, runtime: { type: 'cloud', cloud: { sourceVersion: 1 } } },
        sandbox: { cloudSource: f.source }, codeEditor: f.fs, history: null as HistoryManager | null };
    const errors: string[] = [];
    // Match the real Engine class. A plain object is deep-proxied by CodeManager's
    // MobX setup, changing activeBranchData identity while the lookup closure stays plain.
    class ImageEngine {
        branches = { hasActiveBranch: true, activeBranchData: branch,
            getBranchDataById: (id: string) => id === pin.branchId ? branch : null,
            activeError: { addCodeApplicationError: (message: string) => { errors.push(message); } } };
        code: CodeManager | null = null;
        history: HistoryManager | null = null;
        posthog = { capture: () => undefined };
        isClosing = false;
    }
    const engine = new ImageEngine();
    const code = new CodeManager(engine as unknown as EditorEngine); engine.code = code;
    f.watchLocalWork(() => code.hasPendingWrites);
    const history = new HistoryManager(engine as unknown as EditorEngine, pin.branchId); branch.history = history; engine.history = history;
    const manager = new ActionManager(engine as unknown as EditorEngine);
    return { ...f, branch, engine, code, history, manager, errors, close: async () => { await history.dispose(); await f.source.stop(); } };
}

describe('imported image action/code/history integration', () => {
    it('refuses a replacement source owner after the initial image read', async () => {
        const f = await fixture();
        const originalEditor = f.branch.codeEditor;
        f.onRead(async () => { f.branch.codeEditor = { ...originalEditor } as typeof originalEditor; });
        try {
            expect(await f.manager.editApprovedImportedImage({ pin, field: 'alt', value: 'After', expectedRevision: 1, current: () => true })).toBe(false);
            expect(f.sent).toEqual([]);
            expect(f.history.canUndo).toBe(false);
        } finally { f.branch.codeEditor = originalEditor; await f.close(); }
    });

    it('refuses mixed image and CSS authority without a source write', async () => {
        const f = await fixture();
        const generated = replaceContentImageTarget(f.original, pin.binding.target, f.previous, { ...f.previous, alt: 'After' });
        const action: WriteCodeAction = { type: 'write-code', branchId: pin.branchId,
            diffs: [{ path: pin.path, original: f.original, generated }], cloudImage: { pin, field: 'alt' } };
        Reflect.set(action, 'cssModuleStyle', {});
        try {
            expect(await f.code.write(action)).toBe(false);
            expect(f.sent).toEqual([]);
            expect(f.content()).toBe(f.original);
        } finally { await f.close(); }
    });

    it.each(['close', 'branch', 'source'] as const)('refuses %s drift while the queued image writer awaits source bytes', async kind => {
        const f = await fixture();
        const originalSource = f.branch.sandbox.cloudSource;
        const generated = replaceContentImageTarget(f.original, pin.binding.target, f.previous, { ...f.previous, alt: 'After' });
        const action: WriteCodeAction = { type: 'write-code', branchId: pin.branchId,
            diffs: [{ path: pin.path, original: f.original, generated }], cloudImage: { pin, field: 'alt' } };
        f.onRead(async () => {
            expect(f.code.hasPendingWrites).toBe(true);
            await Promise.resolve();
            if (kind === 'close') f.engine.isClosing = true;
            if (kind === 'branch') f.engine.branches.activeBranchData = { ...f.branch };
            if (kind === 'source') f.branch.sandbox.cloudSource = { ...originalSource } as typeof originalSource;
        });
        try {
            expect(await f.code.write(action)).toBe(false);
            expect(f.sent).toEqual([]); expect(f.content()).toBe(f.original); expect(f.history.canUndo).toBe(false);
        } finally {
            f.engine.isClosing = false; f.engine.branches.activeBranchData = f.branch;
            f.branch.sandbox.cloudSource = originalSource; await f.close();
        }
    });
    it('uploads A then B and replays exact owner bytes with fresh CAS and the original approval', async () => {
        const f = await fixture();
        try {
            const targets: CloudImagePrepareTarget[] = [];
            const prepare = (image: CloudImagePrepared) => async (target: CloudImagePrepareTarget, current: () => boolean) => {
                targets.push(structuredClone(target)); expect(current()).toBe(true); expect(f.source.canWrite).toBe(false); return image;
            };
            const file = new File(['image'], 'image.png', { type: 'image/png' });
            expect(await f.manager.uploadApprovedImportedImage({ pin, expectedRevision: 1, current: () => true }, file, prepare(f.prepared))).toBe(true);
            const first = f.content();
            const bytes = new Uint8Array([4, 5, 6]);
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
            const secondImage: CloudImagePrepared = { attemptId: 'second' as CloudImagePrepared['attemptId'], hash, bytes, assetPath: `public/weblab-upload-${hash}.webp` };
            expect(await f.manager.uploadApprovedImportedImage({ pin, expectedRevision: 2, current: () => true }, file, prepare(secondImage))).toBe(true);
            const second = f.content();
            await f.manager.undo(); expect(f.content()).toBe(first);
            await f.manager.redo(); expect(f.content()).toBe(second);
            const stored = (f.history as unknown as { undoStack: WriteCodeAction[] }).undoStack;
            expect(stored).toHaveLength(2);
            for (const action of stored) expectFrozenPin(action.cloudImage!.pin);
            expect(f.sent.map(operation => operation.expectedRevision)).toEqual([1, 2, 3, 4]);
            expect(f.sent.map(operation => operation.image.kind)).toEqual(['upload', 'upload', 'values', 'values']);
            expect(f.sent.map(operation => operation.changes.length)).toEqual([2, 2, 1, 1]);
            expect(f.sent.slice(0, 2).map(operation => operation.operationId)).toEqual(targets.map(target => target.operationId));
            expect(new Set(f.sent.map(operation => operation.operationId)).size).toBe(4);
            for (const operation of f.sent) expect(operation.pin).toEqual({ version: 2, path: pin.path, generation: pin.generation,
                designRevision: pin.designRevision, fingerprint: pin.fingerprint, binding: copyCloudImageBinding(pin.binding) });
            expect(f.sent.map(operation => operation.changes[0]!.content)).toEqual([first, second, first, second]);
            expect(f.writes.every(changes => changes[0]!.path === pin.path)).toBe(true);
            expect(f.content()).toContain('heading: "Keep"'); expect(f.errors).toEqual([]);
        } finally { await f.close(); }
    });
    it('writes only the data owner, without looking up or retargeting the shared native image OID', async () => {
        const f = await fixture();
        try {
            Object.assign(f.fs, { getJsxElementMetadata: () => { throw Error('A shared renderer OID is not a source target'); } });
            expect(await f.manager.editApprovedImportedImage({ pin, field: 'alt', value: 'After', expectedRevision: 1, current: () => true })).toBe(true);
            // Inspect the stored entry, before inverse/redo helpers can make a fresh frozen copy.
            const stored = (f.history as unknown as { undoStack: WriteCodeAction[] }).undoStack[0]!.cloudImage!.pin;
            for (const part of [stored, stored.binding, stored.binding.target, stored.binding.allowedAssets,
                stored.binding.allowedAssets[0], stored.binding.renderMapping, stored.binding.renderMapping.renderer]) expect(Object.isFrozen(part)).toBe(true);
            expect(f.content()).toBe(f.original.replace('"Before"', '"After"'));
            await f.manager.undo(); expect(f.content()).toBe(f.original);
            await f.manager.redo(); expect(f.content()).toBe(f.original.replace('"Before"', '"After"'));
            expect(f.writes.flat().map(write => write.path)).toEqual([pin.path, pin.path, pin.path]);
        } finally { await f.close(); }
    });
    it('refuses renewed authority on undo and leaves the original history available', async () => {
        for (const changed of ['generation', 'designRevision', 'actor'] as const) {
            const f = await fixture();
            try {
                expect(await f.manager.editApprovedImportedImage({ pin, field: 'alt', value: 'After', expectedRevision: 1, current: () => true })).toBe(true);
                if (changed === 'actor') f.switchActor(); else f.contracts[0]![changed]++;
                await f.source.refreshCapabilities().catch(() => {});
                await f.manager.undo();
                expect(f.sent).toHaveLength(1); expect(f.history.canUndo).toBe(true);
                expect(f.content()).toContain('imageAlt: "After"');
            } finally { await f.close(); }
        }
    });
    it('refuses selection/session drift during the first async read without creating history', async () => {
        const f = await fixture(); let current = true;
        try {
            f.onRead(async () => { current = false; });
            expect(await f.manager.editApprovedImportedImage({ pin, field: 'alt', value: 'After', expectedRevision: 1, current: () => current })).toBe(false);
            expect(f.sent).toEqual([]); expect(f.history.canUndo).toBe(false); expect(f.content()).toBe(f.original);
        } finally { await f.close(); }
    });
    it('cancels only the captured preparation when selection changes while upload is awaited', async () => {
        const f = await fixture(); let current = true;
        try {
            expect(await f.manager.uploadApprovedImportedImage({ pin, expectedRevision: 1, current: () => current },
                new File(['image'], 'image.png', { type: 'image/png' }), async (_target, stillCurrent) => {
                    expect(stillCurrent()).toBe(true);
                    await Promise.resolve(); current = false;
                    expect(stillCurrent()).toBe(false); return f.prepared;
                })).toBe(false);
            expect(f.cancelled).toEqual([{ attemptId: f.prepared.attemptId, actorId: pin.actorId }]);
            expect(f.sent).toEqual([]); expect(f.history.canUndo).toBe(false);
        } finally { await f.close(); }
    });
    it('blocks image admission while an unrelated real CodeManager queue job is pending', async () => {
        const f = await fixture(); let release!: () => void;
        const blocked = new Promise<void>(resolve => { release = resolve; });
        // Hold the actual queue without inventing a source mutation or bypassing a production writer.
        const pending = (f.code as unknown as { enqueueWrite(run: () => Promise<void>): Promise<void> }).enqueueWrite(() => blocked);
        try {
            expect(f.code.hasPendingWrites).toBe(true); expect(f.source.hasLocalWork).toBe(true);
            expect(await f.manager.editApprovedImportedImage({ pin, field: 'alt', value: 'After', expectedRevision: 1, current: () => true })).toBe(false);
            expect(f.sent).toEqual([]); expect(f.history.canUndo).toBe(false);
            release(); await pending;
            expect(await f.manager.editApprovedImportedImage({ pin, field: 'alt', value: 'After', expectedRevision: 1, current: () => true })).toBe(true);
        } finally { release(); await pending; await f.close(); }
    });
    it('does not replay image history in Design mode', async () => {
        const f = await fixture();
        try {
            expect(await f.manager.editApprovedImportedImage({ pin, field: 'alt', value: 'After', expectedRevision: 1, current: () => true })).toBe(true);
            Object.assign(f.source.state.access!, { role: 'designer', canDesign: true });
            expect(f.source.isContentMode).toBe(false);
            await f.manager.undo();
            expect(f.sent).toHaveLength(1); expect(f.history.canUndo).toBe(true);
        } finally { await f.close(); }
    });
    it('refuses a forged history diff that changes an unrelated object property', async () => {
        const f = await fixture();
        try {
            const generated = replaceContentImageTarget(f.original, pin.binding.target, f.previous, { ...f.previous, alt: 'After' }).replace('Keep', 'Changed');
            const action: WriteCodeAction = { type: 'write-code', branchId: pin.branchId,
                diffs: [{ path: pin.path, original: f.original, generated }], cloudImage: { pin, field: 'alt' } };
            expect(await f.code.write(action)).toBe(false);
            expect(f.sent).toEqual([]); expect(f.content()).toBe(f.original);
            expect(f.errors.length).toBeGreaterThan(0);
        } finally { await f.close(); }
    });
    it('rejects a forged branch or owner path instead of using active selection as a fallback', async () => {
        const f = await fixture();
        try {
            for (const changed of [{ ...pin, branchId: 'other' }, { ...pin, path: 'src/content/security.ts' }]) {
                expect(await f.manager.editApprovedImportedImage({ pin: changed, field: 'alt', value: 'After', expectedRevision: 1, current: () => true })).toBe(false);
            }
            expect(f.sent).toEqual([]); expect(f.history.canUndo).toBe(false);
        } finally { await f.close(); }
    });
});

describe('immutable image history copies', () => {
    const before = 'export const aboutHero = { imageSrc: "/hero.webp", imageAlt: "Before" };';
    const after = replaceContentImageTarget(before, pin.binding.target, readContentImageTarget(before, pin.binding.target), { src: '/hero.webp', alt: 'After' });
    const action: WriteCodeAction = { type: 'write-code', branchId: pin.branchId, diffs: [{ path: pin.path, original: before, generated: after }], cloudImage: { pin, field: 'alt' } };
    it('deep-copies the complete pin through JSON recovery, inverse and redo', () => {
        const restored = JSON.parse(JSON.stringify(action)) as WriteCodeAction;
        for (const result of [undoAction(restored), transformRedoAction(restored)] as WriteCodeAction[]) {
            expect(result.cloudImage?.pin).toEqual(pin);
            expect(result.cloudImage?.pin).not.toBe(restored.cloudImage?.pin);
            expect(result.cloudImage?.pin.binding.allowedAssets).not.toBe(restored.cloudImage?.pin.binding.allowedAssets);
            expect(result.cloudImage?.pin.binding.renderMapping.renderer).not.toBe(restored.cloudImage?.pin.binding.renderMapping.renderer);
        }
        expect(undoAction(restored)).toMatchObject({ diffs: [{ path: pin.path, original: after, generated: before }] });
    });
    it('freezes both persisted stacks during actual HistoryManager hydration', async () => {
        const f = await fixture();
        try {
            persistedHistory = JSON.parse(JSON.stringify({ undoStack: [action], redoStack: [action] })) as PersistedImageHistory;
            expect(Object.isFrozen(persistedHistory.undoStack[0]!.cloudImage!.pin)).toBe(false);
            expect(Object.isFrozen(persistedHistory.redoStack[0]!.cloudImage!.pin)).toBe(false);
            await f.history.hydrate();
            const stored = f.history as unknown as { undoStack: WriteCodeAction[]; redoStack: WriteCodeAction[] };
            expect(stored.undoStack).toHaveLength(1); expect(stored.redoStack).toHaveLength(1);
            for (const entry of [...stored.undoStack, ...stored.redoStack]) expectFrozenPin(entry.cloudImage!.pin);
            expect(f.sent).toEqual([]);
        } finally { persistedHistory = null; await f.close(); }
    });
    it('never merges image operations, including About/Security using one native renderer OID', () => {
        const security: CloudImageApproval = { ...pin, path: 'src/content/security.ts', binding: { ...pin.binding, bindingId: 'security',
            target: { ...pin.binding.target, exportName: 'securityHero' }, renderMapping: { ...pin.binding.renderMapping, mappingId: 'security' } } };
        for (const nextPin of [pin, security, { ...pin, generation: 3 }]) {
            const next: WriteCodeAction = { ...action, cloudImage: { pin: nextPin, field: 'alt' } };
            expect(updateTransactionActions([action], next)).toEqual([action, next]);
        }
    });
});


