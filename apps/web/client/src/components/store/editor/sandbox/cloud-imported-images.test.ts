import { describe, expect, it } from 'bun:test';
import { getFunctionName, type FunctionReference } from 'convex/server';
import type { CodeFileSystem, DurableCommitHandler, DurableSourceFile } from '@weblab/file-system';
import type { CloudImageApproval } from '@weblab/models/actions';
import type { CloudEditorClient, CloudImageV2Contracts, CloudImageV2Operation } from '@/lib/cloud-editor/api';
import { replaceContentImageTarget } from '@weblab/parser/src/code-edit/content-image-target';
import { CloudSource, type CloudImagePrepared } from './cloud-source';
import { copyCloudImageBinding } from './cloud-image-approval';
import { cloudRecoveryOperation, type CloudRecoveryRecord, type CloudRecoveryStore } from './cloud-recovery';

const path = 'src/content/about.ts';
const original = 'export const aboutHero = { imageSrc: "/hero.webp", imageAlt: "Before", heading: "Keep" } as const;';
const previous = { src: '/hero.webp', alt: 'Before' };
const asset = { path: 'public/hero.webp', hash: 'a'.repeat(64), bytes: 8 };
export const pin: CloudImageApproval = { version: 2, projectId: 'project', branchId: 'branch', actorId: 'actor', path,
    generation: 2, designRevision: 1, fingerprint: 'b'.repeat(64), binding: { bindingId: 'about',
        target: { kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' },
        fields: ['alt', 'src'], allowImageUploads: true, originalAsset: asset, allowedAssets: [asset], aspectRatio: { width: 16, height: 9 },
        renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about',
            callsite: { path: 'src/app/about/page.tsx', exportName: 'AboutPage', oid: 'about-call' },
            renderer: { path: 'src/components/page-hero.tsx', exportName: 'PageHero', oid: 'shared-image' } } } };
async function hash(bytes: Uint8Array) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function fixture() {
    const scope = { projectId: 'project', branchId: 'branch' } as CloudSource['scope'];
    let actorId = 'actor' as CloudImageV2Contracts['actorId'], revision = 1, content = original;
    let handler!: DurableCommitHandler;
    let record: CloudRecoveryRecord | null = null, lostAck = false, localWork = false;
    let beforeRead = async () => {}, beforeDurable = async () => {}, otherLocalWork = () => false;
    let afterRecoverySave = async (_record: CloudRecoveryRecord) => {};
    const sent: CloudImageV2Operation[] = [], writes: Array<Array<{ path: string; content: string | Uint8Array }>> = [];
    const cancelled: Array<{ attemptId: string; actorId: string }> = [];
    const receipts = new Map<string, { revision: number; currentRevision: number }>();
    const contracts: CloudImageV2Contracts['contracts'] = [{ version: 2, path, generation: 2, designRevision: 1,
        active: true, current: true, fingerprint: pin.fingerprint, bindings: [copyCloudImageBinding(pin.binding)] }];
    const recovery: CloudRecoveryStore = { load: async () => record, save: async (_key, next) => { record = structuredClone(next); await afterRecoverySave(record); }, remove: async () => { record = null; } };
    const fs = { setDurableCommitHandler: (next: DurableCommitHandler) => { handler = next; }, setDurableRecoveryHandler: () => {}, setDurableCacheErrorHandler: () => {},
        hydrateDurableSnapshot: async (files: DurableSourceFile[]) => { const file = files.find(file => file.path === path); if (typeof file?.content === 'string') content = file.content; },
        readFile: async (requested: string) => { await beforeRead(); return requested === path ? content : null; },
        writeCloudImageFiles: async (owner: string, candidate: string, image?: { path: string; bytes: Uint8Array }) => {
            const changes = [{ path: owner, content: candidate } as { path: string; content: string | Uint8Array }, ...(image ? [{ path: image.path, content: image.bytes }] : [])];
            writes.push(changes); await beforeDurable(); await handler(changes); content = candidate;
        } } as unknown as CodeFileSystem;
    const status = () => ({ actorId, revision, profile: 'imported-next-v1', importedAuthority: { preparationId: 'preparation', designRevision: 1 },
        status: 'stopped', enabled: true, appliedRevision: null, previewUrl: null, previewToken: null, expiresAt: null, error: null });
    const client = { query: async (ref: FunctionReference<'query'>) => {
        switch (getFunctionName(ref)) {
            case 'cloudEditorAccess:access': return { actorId, role: 'content', canDesign: false, canEditContent: true, canManage: false, canPublish: false, canEditImportedText: true, canEditImportedImages: true };
            case 'cloudEditorText:contracts': return { actorId, revision, designRevision: 1, contracts: [] };
            case 'cloudEditorContentImages:imageContracts': return { actorId, revision, designRevision: 1, contracts: structuredClone(contracts) };
            case 'cloudEditor:snapshot': return { ...status(), files: [{ path, kind: 'file', text: original, storageId: null, bytes: new TextEncoder().encode(original).length, hash: await hash(new TextEncoder().encode(original)) }] };
            default: return status();
        }
    }, mutation: async (ref: FunctionReference<'mutation'>, input: { attemptId: string; actorId: string }) => {
        expect(getFunctionName(ref)).toBe('cloudEditorContentImages:cancelPreparationV2'); cancelled.push(input);
    }, action: async (ref: FunctionReference<'action'>, operation: CloudImageV2Operation) => {
        expect(getFunctionName(ref)).toBe('cloudEditorContentImageActions:commitV2'); sent.push(structuredClone(operation));
        let receipt = receipts.get(operation.operationId);
        if (!receipt) { expect(operation.expectedRevision).toBe(revision); revision++; receipt = { revision, currentRevision: revision }; receipts.set(operation.operationId, receipt); }
        if (lostAck) throw new Error('Reply lost after commit');
        return receipt;
    } } as unknown as CloudEditorClient;
    const source = new CloudSource(client, scope, fs, { recoveryStore: recovery, hasLocalWork: () => localWork || otherLocalWork() });
    await source.start();
    expect(source.canWrite).toBe(true);
    const bytes = new Uint8Array([1, 2, 3]), digest = await hash(bytes);
    const prepared: CloudImagePrepared = { attemptId: 'attempt' as CloudImagePrepared['attemptId'], assetPath: `public/weblab-upload-${digest}.webp`, hash: digest, bytes };
    const candidate = replaceContentImageTarget(original, pin.binding.target, previous, { ...previous, src: prepared.assetPath.slice(6) });
    return { source, fs, contracts, sent, writes, cancelled, prepared, candidate, original, previous, record: () => record, content: () => content,
        loseAck: (value: boolean) => { lostAck = value; }, localWork: (value: boolean) => { localWork = value; },
        onRead: (run: typeof beforeRead) => { beforeRead = run; }, onDurable: (run: typeof beforeDurable) => { beforeDurable = run; },
        onRecoverySave: (run: typeof afterRecoverySave) => { afterRecoverySave = run; },
        watchLocalWork: (read: () => boolean) => { otherLocalWork = read; },
        switchActor: () => { actorId = 'other' as typeof actorId; } };
}

describe('imported image durable source', () => {
    it('keeps an independent selection guard valid while its own durable save is pending', async () => {
        const f = await fixture(); let pendingObserved = false;
        const current = () => true;
        try {
            f.onRecoverySave(async () => {
                pendingObserved = f.source.state.pending;
                expect(pendingObserved).toBe(true); expect(current()).toBe(true);
                expect(f.source.canWrite).toBe(false);
            });
            expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true, current },
                lease => lease.commit(f.candidate, f.prepared))).toBe(true);
            expect(pendingObserved).toBe(true); expect(f.sent).toHaveLength(1); expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
    it('rejects selection drift during recovery storage before the first dispatch and retains the rejected journal', async () => {
        const f = await fixture(); let current = true;
        try {
            f.onRecoverySave(async () => { await Promise.resolve(); current = false; });
            expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true, current: () => current },
                lease => lease.commit(f.candidate, f.prepared))).toBe(false);
            expect(f.sent).toHaveLength(0); expect(f.content()).toBe(original);
            expect(f.record()?.disposition).toBe('rejected');
            expect<unknown>(cloudRecoveryOperation(f.record()!)).toMatchObject({ expectedRevision: 1, pin: { generation: pin.generation, fingerprint: pin.fingerprint } });
            expect(f.source.canRetrySave).toBe(false);
        } finally { await f.source.stop(); }
    });
    it('reconciles the exact receipt after a lost reply even when selection changes during recovery storage', async () => {
        const f = await fixture(); let current = true;
        try {
            f.loseAck(true);
            f.onRecoverySave(async () => {
                if (f.sent.length === 1) { await Promise.resolve(); current = false; f.loseAck(false); }
            });
            expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true, current: () => current },
                lease => lease.commit(f.candidate, f.prepared))).toBe(true);
            expect(current).toBe(false); expect(f.sent).toHaveLength(2);
            expect<unknown>(f.sent[1]).toEqual(f.sent[0]);
            expect(f.source.state.savedRevision).toBe(2); expect(f.content()).toBe(f.candidate); expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
    it('holds an exclusive lease and commits owner plus binary with the reservation operation ID', async () => {
        const f = await fixture();
        try {
            let operationId = '';
            expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true }, async lease => {
                operationId = lease.operationId;
                expect(lease.current()).toBe(true); expect(f.source.canWrite).toBe(false);
                expect(await f.source.withApprovedImageWrite({ pin, field: 'alt', revision: 1, previous }, async () => { throw Error('Second lease'); })).toBe(false);
                return lease.commit(f.candidate, f.prepared);
            })).toBe(true);
            expect(f.sent).toHaveLength(1);
            expect<unknown>(f.sent[0]).toMatchObject({ transport: 'content-image', transportVersion: 2, operationId, expectedRevision: 1,
                actorId: pin.actorId, pin: { path, fingerprint: pin.fingerprint, binding: copyCloudImageBinding(pin.binding) }, previous, image: { kind: 'upload', attemptId: 'attempt' } });
            expect(f.sent[0]!.changes).toEqual([{ path, content: f.candidate }, { path: f.prepared.assetPath, content: Uint8Array.from(f.prepared.bytes).buffer }]);
            expect(f.content()).toBe(f.candidate); expect(f.record()).toBeNull(); expect(f.source.canWrite).toBe(true);
        } finally { await f.source.stop(); }
    });
    it('keeps the full original pin and operation after a lost acknowledgment, even after reapproval', async () => {
        const f = await fixture();
        try {
            f.loseAck(true);
            expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true }, lease => lease.commit(f.candidate, f.prepared))).toBe(false);
            expect(f.sent).toHaveLength(2); expect<unknown>(f.sent[1]).toEqual(f.sent[0]);
            expect<unknown>(cloudRecoveryOperation(f.record()!)).toEqual(f.sent[0]);
            f.contracts[0]!.generation = 9;
            await f.source.refreshCapabilities();
            f.loseAck(false); await f.source.retryPending();
            expect<unknown>(f.sent[2]).toEqual(f.sent[0]); expect(f.record()).toBeNull();
            expect(f.source.state.savedRevision).toBe(2);
        } finally { await f.source.stop(); }
    });
    it('matches About and Security by mapping identity even when the renderer OID is shared', async () => {
        const f = await fixture();
        try {
            const security = structuredClone(f.contracts[0]!);
            security.path = 'src/content/security.ts'; security.bindings[0]!.bindingId = 'security';
            security.bindings[0]!.renderMapping.mappingId = 'security'; security.bindings[0]!.target.exportName = 'securityHero';
            f.contracts.push(security); await f.source.refreshCapabilities();
            const selected = (mappingId: string) => f.source.resolveRenderedImageApproval({ branchId: 'branch', oid: 'shared-image', contentIdentity: { mappingId, itemId: 'single' } });
            expect(selected('about')?.path).toBe(path); expect(selected('security')?.path).toBe(security.path);
            expect(selected('unknown')).toBeNull();
            expect(f.source.resolveRenderedImageApproval({ branchId: 'branch', oid: 'shared-image' })).toBeNull();
        } finally { await f.source.stop(); }
    });
    it('rejects changed actor, scope, epoch, generation, fingerprint and nested binding authority', async () => {
        const f = await fixture();
        try {
            const variants: CloudImageApproval[] = [
                { ...pin, actorId: 'other' }, { ...pin, projectId: 'other' }, { ...pin, branchId: 'other' },
                { ...pin, designRevision: 4 }, { ...pin, generation: 3 }, { ...pin, fingerprint: 'c'.repeat(64) },
                { ...pin, binding: { ...pin.binding, fields: ['alt'] } },
                { ...pin, binding: { ...pin.binding, renderMapping: { ...pin.binding.renderMapping, mappingId: 'security' } } },
            ];
            for (const changed of variants) {
                expect(f.source.isImageApprovalCurrent(changed)).toBe(false);
                expect(await f.source.withApprovedImageWrite({ pin: changed, field: 'alt', revision: 1, previous }, async () => { throw Error('Invalid authority'); })).toBe(false);
            }
            f.localWork(true);
            expect(await f.source.withApprovedImageWrite({ pin, field: 'alt', revision: 1, previous }, async () => true)).toBe(false);
            f.localWork(false);
            expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true }, async lease => {
                f.switchActor(); await f.source.refreshCapabilities().catch(() => {});
                expect(lease.current()).toBe(false); return lease.commit(f.candidate, f.prepared);
            })).toBe(false);
            expect(f.sent).toEqual([]); expect(f.writes).toEqual([]);
        } finally { await f.source.stop(); }
    });
    it('refuses unrelated owner edits or mismatched uploaded bytes before any durable write', async () => {
        const f = await fixture();
        try {
            for (const [candidate, prepared] of [[f.candidate.replace('Keep', 'Changed'), f.prepared],
                [f.candidate, { ...f.prepared, bytes: new Uint8Array([9]) }]] as const) {
                expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true }, lease => lease.commit(candidate, prepared))).toBe(false);
            }
            expect(f.sent).toEqual([]); expect(f.writes).toEqual([]);
        } finally { await f.source.stop(); }
    });
    it('rechecks the ephemeral selection/session guard immediately before building the durable operation', async () => {
        const f = await fixture(); let current = true;
        try {
            f.onDurable(async () => { current = false; });
            expect(await f.source.withApprovedImageWrite({ pin, field: 'src', revision: 1, previous, upload: true, current: () => current },
                lease => lease.commit(f.candidate, f.prepared))).toBe(false);
            expect(f.sent).toEqual([]); expect(f.content()).toBe(original);
        } finally { await f.source.stop(); }
    });
});
