import { describe, expect, it } from 'bun:test';
import { getFunctionName, type FunctionReference } from 'convex/server';
import type { CodeFileSystem, DurableCommitHandler, DurableSourceFile } from '@weblab/file-system';
import type { CloudEditorClient, CloudEditorContracts, CloudImageOperation } from '@/lib/cloud-editor/api';
import { CloudSource } from './cloud-source';
import type { CloudRecoveryRecord, CloudRecoveryStore } from './cloud-recovery';
import { cloudRecoveryOperation, storedCloudRecoveryRecord } from './cloud-recovery';
const bytes = new Uint8Array([1, 2, 3]);
async function fixture() {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const assetPath = `public/weblab-upload-${hash}.webp`;
    const scope = { projectId: 'project', branchId: 'branch' } as CloudSource['scope'];
    const actorId = 'actor' as CloudEditorContracts['actorId'];
    let contracts: CloudEditorContracts = { actorId, revision: 1, contracts: [{ path: 'app/page.tsx', generation: 2, active: true, fingerprint: 'original',
        bindings: [{ oid: 'image', fields: ['src'], allowImageUploads: true, allowedValues: { src: ['/old.png'] } }] }] };
    let handler!: DurableCommitHandler;
    let hydrated = 0;
    let draft = false;
    let record: CloudRecoveryRecord | null = null;
    let reject = false;
    let failRefresh = false;
    const sent: CloudImageOperation[] = [];
    const recovery: CloudRecoveryStore = { load: async () => record, save: async (_key, next) => { record = structuredClone(next); }, remove: async () => { record = null; } };
    const fs = { setDurableCommitHandler: (next: DurableCommitHandler) => { handler = next; }, setDurableRecoveryHandler: () => {}, setDurableCacheErrorHandler: () => {},
        hydrateDurableSnapshot: async (_files: DurableSourceFile[]) => { hydrated++; },
        writeFiles: async (files: Array<{ path: string; content: string | Uint8Array }>) => handler(files) } as unknown as CodeFileSystem;
    const client = { query: async (ref: FunctionReference<'query'>) => {
        switch (getFunctionName(ref)) {
            case 'cloudEditorAccess:access': return { role: 'content', canDesign: false, canEditContent: true, canManage: false, canPublish: false };
            case 'cloudEditorContent:contracts': if (failRefresh && contracts.revision > 1) throw new Error('Read unavailable'); return structuredClone(contracts);
            case 'cloudEditor:snapshot': return { actorId, revision: 1, files: [{ path: 'app/page.tsx', kind: 'file', text: 'old', storageId: null, bytes: 3, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('old'))), b => b.toString(16).padStart(2, '0')).join('') }] };
            default: return { revision: contracts.revision, status: 'stopped', enabled: true, appliedRevision: null, previewUrl: null, previewToken: null, expiresAt: null, error: null };
        }
    }, action: async (ref: FunctionReference<'action'>, operation: CloudImageOperation) => {
        expect(getFunctionName(ref)).toBe('cloudEditorContentImageActions:commit'); sent.push(structuredClone(operation));
        if (reject) throw Object.assign(new Error('Conflict'), { data: 'CLOUD_CONFLICT' });
        contracts = { ...contracts, revision: 2, contracts: [{ ...contracts.contracts[0]!, bindings: [{ oid: 'image', fields: ['src'], allowImageUploads: true, allowedValues: { src: ['/old.png', assetPath.slice(6)] } }] }] };
        return { revision: 2, currentRevision: 2 };
    } } as unknown as CloudEditorClient;
    const source = new CloudSource(client, scope, fs, { recoveryStore: recovery, hasLocalWork: () => draft });
    await source.start();
    return { source, sent, hash, assetPath, failRefresh: () => { failRefresh = true; }, record: () => record, hydrated: () => hydrated,
        draft: (value: boolean) => { draft = value; }, reject: () => { reject = true; }, revoke: async () => { contracts.contracts[0]!.generation++; await source.refreshCapabilities(); },
        pin: { actorId, branchId: scope.branchId, path: 'app/page.tsx', oid: 'image', field: 'src' as const, generation: 2 },
        prepared: { attemptId: 'attempt' as CloudImageOperation['image']['attemptId'], assetPath, hash, bytes } };
}
describe('cloud image durable operation', () => {
    it('blocks other edits during preparation and commits source plus binary through the pinned endpoint', async () => {
        const f = await fixture();
        try {
            expect(await f.source.withImageUpload(f.pin, 1, async lease => {
                expect(lease.current()).toBe(true); expect(f.source.canWrite).toBe(false); expect(f.source.hasLocalWork).toBe(true);
                return lease.commit(f.prepared, 'new');
            })).toBe(true);
            expect(f.sent).toHaveLength(1); expect(f.sent[0]?.transport).toBe('content-image');
            expect(f.sent[0]?.changes).toHaveLength(2); expect(f.source.canWrite).toBe(true);
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'src', f.assetPath.slice(6))).toBe(true);
            expect(f.hydrated()).toBe(1); expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
    it('does not start on top of another draft and refuses revoked approval before commit', async () => {
        const f = await fixture();
        try {
            f.draft(true);
            expect(await f.source.withImageUpload(f.pin, 1, async () => { throw new Error('Should not run'); })).toBe(false);
            f.draft(false);
            expect(await f.source.withImageUpload(f.pin, 1, async lease => {
                await f.revoke(); expect(lease.current()).toBe(false); return lease.commit(f.prepared, 'new');
            })).toBe(false);
            expect(f.sent).toHaveLength(0); expect(f.hydrated()).toBe(1);
        } finally { await f.source.stop(); }
    });
    it('retains exact source, image bytes and target in a failed-save journal', async () => {
        const f = await fixture();
        try {
            f.reject();
            expect(await f.source.withImageUpload(f.pin, 1, lease => lease.commit(f.prepared, 'new'))).toBe(false);
            const record = f.record()!;
            expect(record.operation.transport).toBe('content-image');
            expect(record.operation.image?.oid).toBe('image');
            const key = { ...f.source.scope, actorId: f.pin.actorId };
            expect(storedCloudRecoveryRecord(record, key)).toEqual(record);
            expect(cloudRecoveryOperation(record)?.transport).toBe('content-image');
            record.operation.image!.generation = 0;
            expect(cloudRecoveryOperation(record)).toBeNull();
            expect(f.hydrated()).toBe(1); expect(f.source.canWrite).toBe(false);
        } finally { await f.source.stop(); }
    });
});

it('keeps an image receipt successful when its following permission refresh fails', async () => {
    const f = await fixture();
    try {
        f.failRefresh();
        expect(await f.source.withImageUpload(f.pin, 1, lease => lease.commit(f.prepared, 'new'))).toBe(true);
        expect(f.source.state.savedRevision).toBe(2);
        expect(f.source.state.needsReload).toBe(true);
        expect(f.source.canWrite).toBe(false);
        expect(f.record()).toBeNull();
    } finally { await f.source.stop(); }
});
