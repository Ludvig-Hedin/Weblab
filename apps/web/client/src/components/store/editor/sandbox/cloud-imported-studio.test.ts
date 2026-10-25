import { describe, expect, it } from 'bun:test';
import { getFunctionName, type FunctionReference } from 'convex/server';
import type { CodeFileSystem, DurableSourceFile } from '@weblab/file-system';
import type { CloudEditorAccess, CloudEditorClient, CloudImportedStudioOperation, CloudSemanticRequest } from '@/lib/cloud-editor/api';
import { CloudSource } from './cloud-source';
import { cloudRecoveryOperation, storedCloudRecoveryRecord, type CloudRecoveryRecord, type CloudRecoveryStore } from './cloud-recovery';

type Request = Extract<CloudSemanticRequest, { transportVersion: 2 }>;
type WireOperation = Omit<CloudImportedStudioOperation, 'changes'>;
const scope = { projectId: 'project', branchId: 'branch' } as CloudSource['scope'];
const actorId = 'actor' as CloudEditorAccess['actorId'];
const request: Request = { transport: 'studio', transportVersion: 2, actorId, expectedRevision: 4,
    expectedGeneration: 3, expectedPreparationId: 'preparation' as Request['expectedPreparationId'],
    expectedDesignRevision: 2, expectedRecipeFingerprint: 'a'.repeat(64),
    operation: { kind: 'createPage', templateId: 'basic-page-v1', slug: 'story' } };

async function fixture(agency = false) {
    let actor = actorId, revision = 4, enabled = true, allowed = true, localWork = false, ownerCurrent = true;
    let record: CloudRecoveryRecord | null = null, lostAck = false, reloads = 0;
    let afterSave = async (_record: CloudRecoveryRecord) => {};
    const sent: WireOperation[] = [], endpoints: string[] = [], hydrated: DurableSourceFile[][] = [];
    const receipts = new Map<string, { revision: number; currentRevision: number }>();
    const recovery: CloudRecoveryStore = {
        load: async key => storedCloudRecoveryRecord(record, key),
        save: async (key, next) => {
            const checked = storedCloudRecoveryRecord(next, key)!;
            if (record && record.operation.operationId !== checked.operation.operationId) throw Error('Another operation owns recovery');
            record = structuredClone(checked); await afterSave(record);
        },
        remove: async (_key, operationId) => {
            if (record?.operation.operationId !== operationId) throw Error('Recovery ownership changed');
            record = null;
        },
    };
    const fs = { setDurableCommitHandler: () => {}, setDurableRecoveryHandler: () => {}, setDurableCacheErrorHandler: () => {},
        hydrateDurableSnapshot: async (files: DurableSourceFile[]) => { hydrated.push(structuredClone(files)); },
    } as unknown as CodeFileSystem;
    const sourceText = 'export const unchanged = "Keep";';
    const sourceBytes = new TextEncoder().encode(sourceText);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', sourceBytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    const status = () => ({ actorId: actor, revision, profile: 'imported-next-v1',
        importedAuthority: { preparationId: 'preparation', designRevision: 2 }, status: 'stopped', enabled,
        appliedRevision: null, previewUrl: null, previewToken: null, expiresAt: null, error: null });
    const client = {
        query: async (ref: FunctionReference<'query'>) => {
            switch (getFunctionName(ref)) {
                case 'cloudEditorAccess:access': return { actorId: actor, role: allowed ? agency ? 'designer' : 'content' : null, canDesign: agency && allowed,
                    canEditContent: allowed, canEditImportedText: allowed, canEditImportedStudio: allowed,
                    canApproveImportedStudio: agency && allowed, canManage: false, canPublish: false };
                case 'cloudEditorText:contracts': return { actorId: actor, revision, designRevision: 2, contracts: [] };
                case 'cloudEditor:snapshot': return { ...status(), files: [{ path: 'src/content/unchanged.ts', kind: 'file', text: sourceText,
                    storageId: null, hash, bytes: sourceBytes.length }] };
                default: return status();
            }
        },
        action: async (ref: FunctionReference<'action'>, operation: WireOperation) => {
            endpoints.push(getFunctionName(ref)); sent.push(structuredClone(operation));
            if (getFunctionName(ref) === 'cloudEditorImportedStudioActions:reapprove') {
                if (lostAck) throw Error('Approval reply lost after commit');
                return { generation: 4, recipeFingerprint: request.expectedRecipeFingerprint, active: true, revision };
            }
            expect(getFunctionName(ref)).toBe('cloudEditorImportedStudioActions:commit');
            expect(operation.transport).toBe('studio'); expect(operation.transportVersion).toBe(2);
            expect('changes' in operation).toBe(false);
            if (!allowed || !enabled) throw Object.assign(Error('Approval unavailable'), { data: 'CLOUD_IMPORTED_STUDIO_DISABLED' });
            let receipt = receipts.get(operation.operationId);
            if (!receipt) {
                expect(operation.expectedRevision).toBe(revision);
                revision++; receipt = { revision, currentRevision: revision }; receipts.set(operation.operationId, receipt);
            }
            if (lostAck) throw Error('Reply lost after commit');
            return receipt;
        },
    } as unknown as CloudEditorClient;
    const createSource = () => new CloudSource(client, { ...scope }, fs, { recoveryStore: recovery,
        owner: { signal: new AbortController().signal, isCurrent: () => ownerCurrent },
        hasLocalWork: () => localWork, requestReload: () => { reloads++; } });
    const source = createSource(); await source.start(); expect(source.canWrite).toBe(true);
    return { source, createSource, sent, endpoints, hydrated, record: () => record, reloads: () => reloads,
        onSave: (callback: typeof afterSave) => { afterSave = callback; }, loseAck: (value: boolean) => { lostAck = value; },
        revoke: () => { allowed = false; enabled = false; }, restore: () => { allowed = true; enabled = true; }, localWork: (value: boolean) => { localWork = value; },
        switchActor: () => { actor = 'other' as typeof actor; }, changeScopeOwner: () => { ownerCurrent = false; } };
}

describe('imported Studio durable source', () => {
    it('dispatches the exact v2 approval pins and requires a document reload without replacing the open files', async () => {
        const f = await fixture();
        try {
            const before = structuredClone(f.hydrated);
            await f.source.commitSemantic(request, () => true);
            expect(f.sent).toHaveLength(1);
            expect(f.sent[0]).toEqual({ ...request, ...scope, operationId: expect.any(String) });
            expect(f.sent[0]!.operationId).toMatch(/^[a-zA-Z0-9_-]{16,80}$/);
            expect(f.endpoints).toEqual(['cloudEditorImportedStudioActions:commit']);
            expect(f.record()).toBeNull(); expect(f.source.state.savedRevision).toBe(5);
            expect(f.source.state.needsReload).toBe(true); expect(f.source.canWrite).toBe(false);
            expect(f.hydrated).toEqual(before); expect(f.reloads()).toBe(0);
            await f.source.reloadSavedSource(); expect(f.reloads()).toBe(1); expect(f.hydrated).toEqual(before);
        } finally { await f.source.stop(); }
    });
    it('keeps an independent session guard true during its own pending save and excludes a second semantic operation', async () => {
        const f = await fixture(); let observed = false;
        try {
            f.onSave(async () => {
                observed = true; expect(f.source.state.pending).toBe(true); expect(f.source.canWrite).toBe(false);
                await expect(f.source.commitSemantic(request, () => true)).rejects.toThrow('Finish the current edit');
            });
            await f.source.commitSemantic(request, () => true);
            expect(observed).toBe(true); expect(f.sent).toHaveLength(1); expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
    it('isolates the accepted structured operation from caller changes while recovery storage is awaiting', async () => {
        const f = await fixture(), candidate = structuredClone(request);
        let saved: CloudRecoveryRecord | null = null;
        try {
            f.onSave(async record => {
                saved = structuredClone(record); await Promise.resolve();
                if (candidate.operation.kind === 'createPage') candidate.operation.slug = 'changed-after-save';
                candidate.expectedGeneration = 99;
            });
            await f.source.commitSemantic(candidate, () => true);
            expect(f.sent[0]).toMatchObject({ operation: request.operation, expectedGeneration: request.expectedGeneration });
            expect<unknown>(saved).toMatchObject({ operation: { ...f.sent[0], changes: [] } });
        } finally { await f.source.stop(); }
    });
    it('retains a rejected journal when the captured session changes during asynchronous storage before first dispatch', async () => {
        const f = await fixture(); let current = true;
        try {
            f.onSave(async () => { await Promise.resolve(); current = false; });
            await expect(f.source.commitSemantic(request, () => current)).rejects.toThrow('approval changed');
            expect(f.sent).toHaveLength(0); expect(f.record()?.disposition).toBe('rejected');
            expect(f.record()?.ambiguous).toBe(false); expect(f.source.canRetrySave).toBe(false);
            expect<unknown>(cloudRecoveryOperation(f.record()!)).toMatchObject({ ...request, ...scope, changes: [] });
        } finally { await f.source.stop(); }
    });
    it('requires current gates and role before retrying the unchanged original receipt', async () => {
        const f = await fixture(); let current = true;
        try {
            f.loseAck(true);
            await expect(f.source.commitSemantic(request, () => current)).rejects.toThrow('Reply lost');
            expect(f.sent).toHaveLength(2); expect(f.sent[1]).toEqual(f.sent[0]);
            const original = structuredClone(f.record()!);
            expect(original.ambiguous).toBe(true);
            f.revoke(); current = false; await f.source.refreshCapabilities(); await f.source.refreshStatus();
            f.loseAck(false);
            expect(f.source.canRetrySave).toBe(false);
            await expect(f.source.retryPending()).rejects.toThrow('original project permission');
            expect(f.sent).toHaveLength(2); expect(f.record()?.ambiguous).toBe(true);
            f.restore(); await f.source.refreshCapabilities();
            await f.source.retryPending();
            expect(f.sent).toHaveLength(3); expect(f.sent[2]).toEqual(f.sent[0]);
            expect(f.sent[2]!.expectedRevision).toBe(4); expect(f.sent[2]!.expectedGeneration).toBe(3);
            expect(f.record()).toBeNull(); expect(f.source.state.savedRevision).toBe(5); expect(f.source.state.needsReload).toBe(true);
        } finally { await f.source.stop(); }
    });
    it('keeps an uncertain receipt when server authority is revoked before capabilities refresh', async () => {
        const f = await fixture();
        try {
            f.loseAck(true); await expect(f.source.commitSemantic(request)).rejects.toThrow('Reply lost');
            const original = structuredClone(f.sent[0]);
            f.revoke(); f.loseAck(false);
            await expect(f.source.retryPending()).rejects.toThrow('Approval unavailable');
            expect(f.sent.at(-1)).toEqual(original);
            expect(f.record()?.ambiguous).toBe(true); expect(f.record()?.disposition).toBe('pending');
            expect(f.source.state.saveAcknowledged).toBe(false);
            f.restore(); await f.source.retryPending();
            expect(f.sent.at(-1)).toEqual(original); expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
    it('restores the same uncertain operation in a new controller without repinning to the newer snapshot', async () => {
        const f = await fixture(); let reopened: CloudSource | undefined;
        try {
            f.loseAck(true); await expect(f.source.commitSemantic(request, () => true)).rejects.toThrow();
            const original = structuredClone(f.sent[0]); await f.source.stop();
            f.loseAck(false); reopened = f.createSource(); await reopened.start();
            expect(reopened.canRetrySave).toBe(true); await reopened.retryPending();
            expect(f.sent.at(-1)).toEqual(original); expect(f.record()).toBeNull();
            expect(reopened.state.needsReload).toBe(true);
        } finally { await reopened?.stop(); await f.source.stop(); }
    });
    it.each(['actor', 'scope'] as const)('refuses dispatch when the source %s changes during recovery storage', async kind => {
        const f = await fixture();
        try {
            f.onSave(async () => {
                if (kind === 'scope') f.changeScopeOwner();
                else { f.switchActor(); await f.source.refreshCapabilities().catch(() => {}); }
            });
            await expect(f.source.commitSemantic(request, () => true)).rejects.toThrow();
            expect(f.sent).toHaveLength(0); expect(f.record()?.actorId).toBe(actorId);
            expect(f.record()?.operation.branchId).toBe(scope.branchId);
        } finally { await f.source.stop(); }
    });
    it('refuses local drafts, a wrong actor and legacy Studio requests without journaling or falling back', async () => {
        const f = await fixture();
        try {
            f.localWork(true); await expect(f.source.commitSemantic(request)).rejects.toThrow('Finish the current edit'); f.localWork(false);
            await expect(f.source.commitSemantic({ ...request, actorId: 'other' as typeof actorId })).rejects.toThrow('Finish the current edit');
            await expect(f.source.commitSemantic({ transport: 'studio', actorId, expectedRevision: 4, expectedGeneration: 3,
                operation: { kind: 'createPage', slug: 'story' } })).rejects.toThrow('current agency approval');
            expect(f.sent).toHaveLength(0); expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
});

describe('imported Studio recovery protocol', () => {
    const key = { ...scope, actorId };
    function record(): CloudRecoveryRecord { return { version: 2, actorId, ambiguous: true, disposition: 'pending', createdAt: Date.now(),
        operation: { ...request, ...scope, changes: [], operationId: 'studio_recovery_operation_1' } }; }
    it('preserves every authority pin and accepts only the recorded account and scope', () => {
        const saved = record(); expect(storedCloudRecoveryRecord(saved, key)).toEqual(saved);
        expect<unknown>(cloudRecoveryOperation(saved)).toEqual(saved.operation);
        for (const wrong of [{ ...key, actorId: 'other' }, { ...key, projectId: 'other' as typeof scope.projectId }, { ...key, branchId: 'other' as typeof scope.branchId }])
            expect(() => storedCloudRecoveryRecord(saved, wrong)).toThrow();
    });
    it.each(['preparation', 'epoch', 'fingerprint', 'generation', 'operation', 'changes', 'version', 'legacy'] as const)('rejects malformed %s without choosing the v1 endpoint', kind => {
        const saved = record(), operation = saved.operation;
        if (kind === 'preparation') operation.expectedPreparationId = 'preparation\n';
        if (kind === 'epoch') operation.expectedDesignRevision = 5;
        if (kind === 'fingerprint') operation.expectedRecipeFingerprint = 'a'.repeat(64) + '\n';
        if (kind === 'generation') operation.expectedGeneration = -1;
        if (kind === 'operation') operation.operation = { kind: 'install' } as typeof operation.operation;
        if (kind === 'changes') operation.changes = [{ path: 'src/app/page.tsx', content: 'untrusted' }];
        if (kind === 'version') operation.transportVersion = 3;
        if (kind === 'legacy') operation.transportVersion = 1;
        expect(cloudRecoveryOperation(saved)).toBeNull();
        expect(() => storedCloudRecoveryRecord(saved, key)).toThrow();
    });
});


describe('imported Studio uncertain approval', () => {
    it('blocks further edits after an unconfirmed agency approval without inventing a source receipt', async () => {
        const f = await fixture(true);
        try {
            f.loseAck(true);
            const { transport: _transport, transportVersion: _version, operation: _operation, ...pin } = request;
            await expect(f.source.updateImportedStudioApproval({ ...scope, ...pin }, 'reapprove', () => true)).rejects.toThrow('Approval reply lost');
            expect(f.source.state.needsReload).toBe(true);
            expect(f.source.state.saveAcknowledged).toBe(false);
            expect(f.source.state.pending).toBe(false);
            expect(f.source.canWrite).toBe(false);
            expect(f.record()).toBeNull();
        } finally { f.source.stop(); }
    });
    it('does not claim an unknown write when the initiating approval guard already changed', async () => {
        const f = await fixture(true);
        try {
            const { transport: _transport, transportVersion: _version, operation: _operation, ...pin } = request;
            await expect(f.source.updateImportedStudioApproval({ ...scope, ...pin }, 'reapprove', () => false)).rejects.toThrow();
            expect(f.sent).toHaveLength(0); expect(f.source.state.needsReload).toBe(false);
            expect(f.source.canWrite).toBe(true);
        } finally { f.source.stop(); }
    });
});
