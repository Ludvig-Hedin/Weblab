import { describe, expect, it } from 'bun:test';
import { getFunctionName } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import type { CodeFileSystem, DurableCommitHandler, DurableRecoveryHandler, DurableSourceChange, DurableSourceFile } from '@weblab/file-system';
import type { CloudEditorAccess, CloudEditorClient, CloudEditorCommit, CloudEditorCommitResult, CloudEditorContracts, CloudEditorRuntimeStatus, CloudEditorSnapshot } from '@/lib/cloud-editor/api';
import type { RejectedTextNavigationLease } from '../text';
import { CloudSource } from './cloud-source';
import type { CloudRecoveryKey, CloudRecoveryOperation, CloudRecoveryRecord, CloudRecoveryStore } from './cloud-recovery';

class MemoryRecoveryStore implements CloudRecoveryStore {
    readonly records = new Map<string, CloudRecoveryRecord>();
    failSave = false;
    failRemove = false;
    private key(key: CloudRecoveryKey): string { return JSON.stringify([key.actorId, key.projectId, key.branchId]); }
    async load(key: CloudRecoveryKey): Promise<CloudRecoveryRecord | null> { return structuredClone(this.records.get(this.key(key)) ?? null); }
    async save(key: CloudRecoveryKey, record: CloudRecoveryRecord): Promise<void> {
        if (this.failSave) throw new Error('Storage full');
        const existing = this.records.get(this.key(key));
        if (existing && existing.operation.operationId !== record.operation.operationId) throw new Error('Another pending operation owns this recovery record');
        const definitiveRejection = record.definitiveRejection === true || existing?.definitiveRejection === true;
        const ambiguous = !definitiveRejection && (record.ambiguous || existing?.ambiguous === true);
        this.records.set(this.key(key), structuredClone({ ...record, definitiveRejection, ambiguous,
            disposition: definitiveRejection ? 'rejected' : ambiguous ? 'pending' : record.disposition }));
    }
    async remove(key: CloudRecoveryKey, operationId: string): Promise<void> {
        if (this.failRemove) throw new Error('Recovery cleanup unavailable');
        const existing = this.records.get(this.key(key));
        if (existing && existing.operation.operationId !== operationId) throw new Error('Another pending operation owns this recovery record');
        this.records.delete(this.key(key));
    }
}

async function hash(bytes: Uint8Array): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fixture(binary?: Uint8Array, options: { start?: boolean; actorId?: string; recovery?: MemoryRecoveryStore; role?: CloudEditorAccess['role']; path?: string } = {}) {
    const original = binary ?? new TextEncoder().encode('before');
    const path = options.path ?? (binary ? 'public/sample.bin' : 'notes.txt');
    let snapshot: CloudEditorSnapshot = { actorId: (options.actorId ?? 'actor') as CloudEditorSnapshot['actorId'], revision: 1, files: [{ path, kind: 'file',
        text: binary ? null : 'before', storageId: binary ? 'asset' as NonNullable<CloudEditorSnapshot['files'][number]['storageId']> : null,
        hash: await hash(original), bytes: original.length }] };
    let runtime: CloudEditorRuntimeStatus = { revision: 1, appliedRevision: 1, status: 'ready',
        previewUrl: 'https://preview.example.com', previewToken: null, expiresAt: Date.now() + 900_000,
        error: null, enabled: true };
    let commit!: DurableCommitHandler;
    let cacheFailure!: () => void;
    let prepareRecovery!: DurableRecoveryHandler;
    let hydrated: DurableSourceFile[] = [];
    const fs = {
        setDurableCommitHandler(handler: DurableCommitHandler) { commit = handler; },
        setDurableRecoveryHandler(handler: DurableRecoveryHandler) { prepareRecovery = handler; },
        setDurableCacheErrorHandler(handler: () => void) { cacheFailure = handler; },
        async hydrateDurableSnapshot(files: DurableSourceFile[]) { hydrated = files; },
    } as unknown as CodeFileSystem;
    const submitted: CloudRecoveryOperation[] = [];
    const endpoints: string[] = [];
    const role = options.role === undefined ? 'designer' : options.role;
    let access: CloudEditorAccess = { role, canDesign: role === 'designer' || role === 'responsible', canEditContent: role !== null, canPublish: false, canManage: role === 'responsible' };
    let contracts: CloudEditorContracts = { actorId: snapshot.actorId, revision: 1,
        contracts: [{ path, generation: 1, bindings: [{ oid: 'heading', fields: ['text'] }], fingerprint: 'approved', active: true }] };
    let readAccess = async () => {};
    const recovery = options.recovery ?? new MemoryRecoveryStore();
    let snapshotFailures = 0;
    let previewRequests = 0;
    let statusQueries = 0;
    let preparePreview = () => {};
    let save = async (_args: CloudEditorCommit): Promise<CloudEditorCommitResult> => ({ revision: 2, currentRevision: 2 });
    const client = {
        async query(ref: FunctionReference<'query'>) {
            if (getFunctionName(ref) === 'cloudEditorAccess:access') { await readAccess(); return access; }
            if (getFunctionName(ref) === 'cloudEditorContent:contracts') return structuredClone(contracts);
            if (getFunctionName(ref) === 'cloudEditor:snapshot') {
                if (snapshotFailures-- > 0) throw new Error('Source temporarily unavailable');
                return snapshot;
            }
            statusQueries++;
            return runtime;
        },
        async mutation(ref: FunctionReference<'mutation'>) {
            if (getFunctionName(ref) === 'cloudPreviewAccess:issue') {
                runtime = { ...runtime, previewToken: 'a'.repeat(64) };
                return { previewToken: runtime.previewToken, expiresAt: runtime.expiresAt, sandboxId: 'sandbox' };
            }
            previewRequests++; preparePreview(); return null;
        },
        async action(ref: FunctionReference<'action'>, args: CloudEditorCommit) {
            if (getFunctionName(ref) === 'cloudEditorActions:readAsset') return Uint8Array.from(original).buffer;
            submitted.push(args);
            endpoints.push(getFunctionName(ref));
            return save(args);
        },
    } as unknown as CloudEditorClient;
    let navigations = 0;
    let localWork = false;
    let editingText: string | null = null;
    let prepareNavigation: () => RejectedTextNavigationLease = () => { throw new Error('No failed text session'); };
    let requestReload = () => {};
    const source = new CloudSource(client, { projectId: 'project', branchId: 'branch' } as CloudSource['scope'], fs, { recoveryStore: recovery, requestReload: () => { navigations++; requestReload(); }, hasLocalWork: () => localWork,
        recoverableText: () => editingText, prepareRejectedTextNavigation: () => prepareNavigation() });
    if (options.start !== false) { await source.start(); await source.refreshStatus(); }
    return {
        source, submitted, endpoints, recovery, prepareRecovery: (changes: DurableSourceChange[]) => prepareRecovery(changes), navigations: () => navigations, localWork: (value: boolean) => { localWork = value; }, commit: (content: string | Uint8Array = 'after') => commit([{ path, content }]),
        editingText: (value: string | null) => { editingText = value; },
        onNavigation: (handler: typeof prepareNavigation) => { prepareNavigation = handler; },
        onReload: (handler: typeof requestReload) => { requestReload = handler; },
        commitChanges: (changes: DurableSourceChange[]) => commit(changes),
        access: (change: Partial<CloudEditorAccess>) => { access = { ...access, ...change }; },
        contracts: (change: Partial<CloudEditorContracts>) => { contracts = { ...contracts, ...change }; },
        onAccess: (handler: typeof readAccess) => { readAccess = handler; },
        generation: (generation: number) => { contracts.contracts[0]!.generation = generation; },
        cacheFailure: () => cacheFailure(), hydrated: () => hydrated,
        save: (handler: typeof save) => { save = handler; },
        revision: (revision: number) => { runtime = { ...runtime, revision }; snapshot = { ...snapshot, revision }; contracts = { ...contracts, revision }; },
        runtime: (change: Partial<CloudEditorRuntimeStatus>) => { runtime = { ...runtime, ...change }; },
        onPreview: (handler: () => void) => { preparePreview = handler; },
        failSnapshotOnce: () => { snapshotFailures = 1; },
        counts: () => ({ previewRequests, statusQueries }),
    };
}

describe('durable cloud source adapter', () => {
    it('pins raw preparation recovery to the original actor, scope and revision and restores download-only', async () => {
        const f = await fixture();
        const bytes = new Uint8Array([0, 8, 255]);
        const preserve = f.prepareRecovery([{ path: 'broken.tsx', content: '<unfinished' }, { path: 'image.bin', content: bytes }]);
        bytes[1] = 99;
        f.source.state.savedRevision = 12;
        await f.source.stop();
        await preserve();
        const record = [...f.recovery.records.values()][0]!;
        expect(record).toMatchObject({ actorId: 'actor', disposition: 'rejected', ambiguous: false, definitiveRejection: true,
            operation: { projectId: 'project', branchId: 'branch', actorId: 'actor', expectedRevision: 1, transport: 'local-only' } });
        expect(new Uint8Array(record.operation.changes[1]!.content as ArrayBuffer)).toEqual(new Uint8Array([0, 8, 255]));
        expect(f.submitted).toHaveLength(0);
        const reopened = await fixture(undefined, { recovery: f.recovery });
        try {
            expect(reopened.source.canRetrySave).toBe(false);
            expect(reopened.source.canWrite).toBe(false);
            expect(reopened.source.pendingChangesBackup().changes[0]).toMatchObject({ content: '<unfinished' });
            await reopened.source.retryPending();
            expect(reopened.submitted).toHaveLength(0);
            await expect(reopened.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            expect(reopened.recovery.records.size).toBe(1);
            await reopened.source.reloadSavedSource({ discardRecovery: true });
            expect(reopened.recovery.records.size).toBe(0);
        } finally { await reopened.source.stop(); }
    });

    it('retains an older ambiguous operation and a colliding raw proposal in the same download', async () => {
        const f = await fixture();
        try {
            // Simulate another tab acquiring the journal after this tab loaded.
            const old: CloudRecoveryRecord = {
                version: 2, actorId: 'actor', disposition: 'pending', ambiguous: true, createdAt: Date.now(),
                operation: { ...f.source.scope, actorId: 'actor' as CloudEditorCommit['actorId'], expectedRevision: 1,
                    operationId: 'earlier-operation-123', transport: 'design', transportVersion: 1,
                    changes: [{ path: 'notes.txt', content: 'Earlier unconfirmed edit' }] },
            };
            await f.recovery.save({ ...f.source.scope, actorId: 'actor' }, old);
            const storedBeforeCollision = structuredClone([...f.recovery.records.values()][0]);
            await expect(f.prepareRecovery([{ path: 'broken.tsx', content: '<new unfinished' }])()).rejects.toThrow('Browser recovery');
            expect([...f.recovery.records.values()][0]).toEqual(storedBeforeCollision);
            const backup = f.source.pendingChangesBackup();
            expect(backup.operationId).toBe(old.operation.operationId);
            expect(backup.changes[0]?.content).toBe('Earlier unconfirmed edit');
            expect(backup.localAttempts[0]).toMatchObject({ stored: false, changes: [{ content: '<new unfinished' }] });
            expect(f.source.state.error).toContain('Keep this tab open');
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow('Retry the unconfirmed save');
            expect([...f.recovery.records.values()][0]).toEqual(storedBeforeCollision);
            expect(f.submitted).toHaveLength(0);
        } finally { await f.source.stop(); }
    });

    it('keeps preparation bytes downloadable when recovery storage is unavailable', async () => {
        const f = await fixture();
        try {
            f.recovery.failSave = true;
            await expect(f.prepareRecovery([{ path: 'broken.tsx', content: '<keep me' }])()).rejects.toThrow('Browser recovery');
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.pendingChangesBackup().localAttempts[0]?.changes[0]?.content).toBe('<keep me');
            expect(f.source.state.error).toContain('Keep this tab open');
            expect(f.submitted).toHaveLength(0);
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.source.hasPendingChanges).toBe(false);
        } finally { await f.source.stop(); }
    });

    it('preserves rejected preflight bytes without selecting a transport endpoint', async () => {
        const f = await fixture(undefined, { role: 'content' });
        try {
            await expect(f.commitChanges([{ path: 'not-approved.tsx', content: '<pending' }])).rejects.toThrow('no approved content contract');
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.pendingChangesBackup().transport).toBe('local-only');
            expect(f.source.pendingChangesBackup().changes[0]?.content).toBe('<pending');
            expect(f.submitted).toHaveLength(0);
        } finally { await f.source.stop(); }
    });

    it('pins an approved attribute to content transport even if a designer changes UI mode while queued', async () => {
        const f = await fixture(undefined, { role: 'designer', path: 'app/page.tsx' });
        try {
            f.contracts({ contracts: [{ path: 'app/page.tsx', generation: 1, fingerprint: 'approved', active: true,
                bindings: [{ oid: 'image', fields: ['alt'] }] }] });
            await f.source.refreshCapabilities();
            f.source.setContentMode(true);
            const saved = await f.source.withApprovedAttributeWrite({ actorId: 'actor', branchId: 'branch', path: 'app/page.tsx',
                oid: 'image', field: 'alt', generation: 1, revision: 1, value: 'Description', candidate: 'after' }, async () => {
                expect(f.source.hasLocalWork).toBe(true);
                f.source.setContentMode(false);
                await f.commit('after');
                return true;
            });
            expect(saved).toBe(true);
            expect(f.endpoints).toEqual(['cloudEditorContentActions:commit']);
            expect(f.submitted[0]).toMatchObject({ transport: 'content', transportVersion: 1,
                expectedContracts: [{ path: 'app/page.tsx', generation: 1 }] });
            expect(f.source.state.attributeWritePending).toBe(false);
        } finally { await f.source.stop(); }
    });

    it('rejects reapproval between field admission and its durable source write without rebinding', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'app/page.tsx' });
        try {
            f.contracts({ contracts: [{ path: 'app/page.tsx', generation: 1, fingerprint: 'approved', active: true,
                bindings: [{ oid: 'image', fields: ['alt'] }] }] });
            await f.source.refreshCapabilities();
            await expect(f.source.withApprovedAttributeWrite({ actorId: 'actor', branchId: 'branch', path: 'app/page.tsx',
                oid: 'image', field: 'alt', generation: 1, revision: 1, value: 'Description', candidate: 'after' }, async () => {
                f.generation(2);
                await f.source.refreshCapabilities();
                await f.commit('after');
                return true;
            })).rejects.toThrow('approved field changed');
            expect(f.submitted).toHaveLength(0);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.pendingChangesBackup()).toMatchObject({
                transport: 'local-only', expectedRevision: 1,
                changes: [{ path: 'app/page.tsx', content: 'after' }],
            });
            await f.source.retryPending();
            expect(f.submitted).toHaveLength(0);
        } finally { await f.source.stop(); }
    });

    it('allows only the pinned field candidate and exact approved attribute choices', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'app/page.tsx' });
        try {
            f.contracts({ contracts: [{ path: 'app/page.tsx', generation: 1, fingerprint: 'approved', active: true,
                bindings: [{ oid: 'image', fields: ['alt', 'src', 'className'], allowedValues: { src: ['/image.png'] },
                    choices: { compact: 'w-24', large: 'w-48' } }] }] });
            await f.source.refreshCapabilities();
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'src', '/image.png')).toBe(true);
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'src', '/other.png')).toBe(false);
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'className', 'absolute')).toBe(false);
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'className', 'w-48')).toBe(true);
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'alt', 'x'.repeat(1001))).toBe(false);
            await expect(f.source.withApprovedAttributeWrite({ actorId: 'actor', branchId: 'branch', path: 'app/page.tsx',
                oid: 'image', field: 'alt', generation: 1, revision: 1, value: 'Description', candidate: 'after' }, async () => {
                await f.commit('unrelated bytes');
                return true;
            })).rejects.toThrow('approved field changed');
            expect(f.submitted).toHaveLength(0);
        } finally { await f.source.stop(); }
    });

    it('waits for server access before admitting writes, and never starts preview for content users', async () => {
        const f = await fixture(undefined, { start: false, role: 'content', path: 'src/app/page.tsx' });
        let release!: () => void;
        let reading!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const started = new Promise<void>(resolve => { reading = resolve; });
        f.onAccess(async () => { reading(); await gate; });
        try {
            const load = f.source.start();
            await started;
            expect(f.source.canWrite).toBe(false);
            expect(f.source.state.accessReady).toBe(false);
            release();
            await load;
            await f.source.refreshStatus();
            expect(f.source.isContentMode).toBe(true);
            expect(f.source.canDesign).toBe(false);
            expect(f.source.canWrite).toBe(true);
            expect(f.source.canEditText('/src/app/page.tsx', 'heading')).toBe(true);
            expect(f.source.canEditText('src/app/page.tsx', 'locked')).toBe(false);
            expect(f.counts().previewRequests).toBe(0);
            expect(f.source.state.runtime?.status).toBe('ready');
        } finally { release(); await f.source.stop(); }
    });

    it('keeps unassigned project viewers read-only without starting preview', async () => {
        const f = await fixture(undefined, { role: null });
        try {
            expect(f.source.canWrite).toBe(false);
            expect(f.source.approvedTextBindings).toEqual([]);
            await expect(f.commit()).rejects.toThrow('Reload or retry');
            expect(f.submitted).toHaveLength(0);
            expect(f.counts().previewRequests).toBe(0);
            await expect(f.source.retryPreview()).rejects.toThrow('Cloud project access is required');
            expect(f.counts().previewRequests).toBe(0);
        } finally { await f.source.stop(); }
    });

    it('lets content users explicitly retry preview, preserving source after an allowance denial', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.runtime({ expiresAt: Date.now() - 1 });
            await f.source.refreshStatus();
            expect(f.counts().previewRequests).toBe(0);
            expect(f.source.state.runtimeExpired).toBe(true);
            const before = f.hydrated();
            const denied = Object.assign(new Error('Allowance required'), { data: 'CLOUD_PREVIEW_ALLOWANCE_REQUIRED' });
            f.onPreview(() => { throw denied; });
            await expect(f.source.retryPreview()).rejects.toBe(denied);
            expect(f.counts().previewRequests).toBe(1);
            expect(f.source.state.runtimeError).toContain('agency needs to allow');
            expect(f.source.state.savedRevision).toBe(1);
            expect(f.hydrated()).toBe(before);
            expect(f.source.canWrite).toBe(true);
            await f.source.refreshStatus();
            expect(f.counts().previewRequests).toBe(1);
            expect(f.source.state.runtimeError).toContain('agency needs to allow');
            f.onPreview(() => {});
            await Promise.all([f.source.retryPreview(), f.source.retryPreview()]);
            expect(f.counts().previewRequests).toBe(2);
            expect(f.source.state.runtimeError).toBeNull();
            expect(f.submitted).toHaveLength(0);
        } finally { await f.source.stop(); }
    });

    it('restricts content candidates to approved text files and preserves each rejected proposal without replay', async () => {
        for (const changes of [
            [{ path: 'src/app/page.tsx', content: null }],
            [{ path: 'public/image.png', content: new Uint8Array([0, 1]) }],
            [{ path: 'src/app/new', content: null, directory: true as const }],
            [{ path: 'src/app/locked/page.tsx', content: 'changed' }],
        ]) {
            const denied = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
            try {
                await expect(denied.commitChanges(changes)).rejects.toThrow();
                expect(denied.submitted).toHaveLength(0);
                expect(denied.source.canWrite).toBe(false);
                expect(denied.source.canRetrySave).toBe(false);
                const record = [...denied.recovery.records.values()][0]!;
                expect(record.operation.transport).toBe('local-only');
                expect(record.operation.changes).toEqual(changes.map((change) => ({ ...change,
                    content: change.content instanceof Uint8Array ? Uint8Array.from(change.content).buffer : change.content })));
                await denied.source.retryPending();
                expect(denied.submitted).toHaveLength(0);
            } finally { await denied.source.stop(); }
        }
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            await f.commit('approved candidate');
            expect(f.endpoints).toEqual(['cloudEditorContentActions:commit']);
            expect(f.submitted[0]?.transport).toBe('content');
            expect(f.submitted[0]?.transportVersion).toBe(1);
            expect(f.submitted[0]?.expectedContracts).toEqual([{ path: 'src/app/page.tsx', generation: 1 }]);
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.canWrite).toBe(true);
            expect(f.counts().previewRequests).toBe(0);
        } finally { await f.source.stop(); }
    });

    it('pins content transport and contract generations through a lost reply, role change and mode switch', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.save(async () => { throw new Error('Lost reply'); });
            await expect(f.commit()).rejects.toThrow('Lost reply');
            const original = structuredClone(f.submitted[0]);
            expect([...f.recovery.records.values()][0]?.version).toBe(2);
            f.access({ role: 'designer', canDesign: true });
            f.generation(2);
            await f.source.refreshCapabilities();
            f.source.setContentMode(false);
            f.save(async () => ({ revision: 2, currentRevision: 2 }));
            await f.source.retryPending();
            expect(f.endpoints.every(endpoint => endpoint === 'cloudEditorContentActions:commit')).toBe(true);
            expect(f.submitted.every(operation => JSON.stringify(operation) === JSON.stringify(original))).toBe(true);
        } finally { await f.source.stop(); }
    });

    it('keeps a designer recovery on its original endpoint after switching to Build', async () => {
        const f = await fixture();
        try {
            f.save(async () => { throw new Error('Lost reply'); });
            await expect(f.commit()).rejects.toThrow('Lost reply');
            f.source.setContentMode(true);
            f.save(async () => ({ revision: 2, currentRevision: 2 }));
            await f.source.retryPending();
            expect(f.endpoints.every(endpoint => endpoint === 'cloudEditorActions:commit')).toBe(true);
            expect(f.submitted.every(operation => operation === f.submitted[0])).toBe(true);
        } finally { await f.source.stop(); }
    });

    it('keeps the draft but stops retrying when receipt-first contract rejection resolves an unknown save', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.save(async () => { throw new Error('Lost reply'); });
            await expect(f.commit()).rejects.toThrow('Lost reply');
            f.save(async () => { throw Object.assign(new Error('Contract replaced'), { data: 'CLOUD_CONTENT_STALE_CONTRACT' }); });
            await expect(f.source.retryPending()).rejects.toThrow('Contract replaced');
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.state.error).toContain('not saved');
            expect([...f.recovery.records.values()][0]?.disposition).toBe('rejected');
            expect([...f.recovery.records.values()][0]?.operation.expectedContracts).toEqual([{ path: 'src/app/page.tsx', generation: 1 }]);
        } finally { await f.source.stop(); }
    });

    it('reopens a content recovery under a designer without converting it to an unrestricted save', async () => {
        const recovery = new MemoryRecoveryStore();
        const first = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx', recovery });
        first.save(async () => { throw new Error('Lost reply'); });
        await expect(first.commit()).rejects.toThrow('Lost reply');
        const original = structuredClone(first.submitted[0]);
        await first.source.stop();
        const reopened = await fixture(undefined, { role: 'designer', path: 'src/app/page.tsx', recovery });
        try {
            expect(reopened.source.isContentMode).toBe(false);
            await reopened.source.retryPending();
            expect(reopened.endpoints).toEqual(['cloudEditorContentActions:commit']);
            expect(reopened.submitted[0]).toEqual(original);
        } finally { await reopened.source.stop(); }
    });

    it('freezes admission when access refresh fails or a contract is revoked, without dropping recovery', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.onAccess(async () => { throw new Error('Access unavailable'); });
            await expect(f.source.refreshCapabilities()).rejects.toThrow('Access unavailable');
            expect(f.source.canWrite).toBe(false);
            f.onAccess(async () => {});
            await f.source.refreshCapabilities();
            f.save(async () => { throw new Error('Lost reply'); });
            await expect(f.commit()).rejects.toThrow('Lost reply');
            f.access({ role: null, canEditContent: false, canDesign: false });
            await f.source.refreshCapabilities();
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.recovery.records.size).toBe(1);
            expect(f.source.canEditText('src/app/page.tsx', 'heading')).toBe(false);
            const attempts = f.submitted.length;
            await expect(f.source.retryPending()).rejects.toThrow('original project permission');
            expect(f.submitted).toHaveLength(attempts);
        } finally { await f.source.stop(); }
    });

    it('requires matching source revision and an active binding for text admission', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.contracts({ revision: 2 });
            await f.source.refreshCapabilities();
            expect(f.source.canWrite).toBe(false);
            f.contracts({ revision: 1, contracts: [] });
            await f.source.refreshCapabilities();
            expect(f.source.canEditText('src/app/page.tsx', 'heading')).toBe(false);
            await expect(f.commit()).rejects.toThrow('no approved content contract');
            expect(f.submitted).toHaveLength(0);
        } finally { await f.source.stop(); }
    });

    it('keeps old designer journals and unknown protocols downloadable without replaying them as content', async () => {
        for (const version of [1, 2, 3]) {
            const recovery = new MemoryRecoveryStore();
            const first = await fixture(undefined, { recovery });
            first.save(async () => { throw new Error('Lost reply'); });
            await expect(first.commit()).rejects.toThrow('Lost reply');
            await first.source.stop();
            const record = [...recovery.records.values()][0]!;
            record.version = version;
            if (version === 1) record.operation = first.submitted[0]!;
            else record.operation.transportVersion = 9;
            const reopened = await fixture(undefined, { role: 'content', recovery });
            try {
                expect(reopened.source.hasPendingChanges).toBe(true);
                expect(reopened.source.state.recoveryUnsupported).toBe(true);
                expect(reopened.source.canRetrySave).toBe(false);
                await reopened.source.retryPending();
                expect(reopened.submitted).toHaveLength(0);
                expect(recovery.records.size).toBe(1);
            } finally { await reopened.source.stop(); }
        }
    });

    it('allows a designer to replay a legacy journal only through the designer endpoint', async () => {
        const recovery = new MemoryRecoveryStore();
        const first = await fixture(undefined, { recovery });
        first.save(async () => { throw new Error('Lost reply'); });
        await expect(first.commit()).rejects.toThrow('Lost reply');
        await first.source.stop();
        const record = [...recovery.records.values()][0]!;
        record.version = 1;
        record.operation = first.submitted[0]!;
        const reopened = await fixture(undefined, { recovery });
        try {
            reopened.source.setContentMode(true);
            await reopened.source.retryPending();
            expect(reopened.endpoints).toEqual(['cloudEditorActions:commit']);
            expect(reopened.submitted[0]).toEqual(first.submitted[0]);
        } finally { await reopened.source.stop(); }
    });

    it('loads the first dependency revision before admitting edits or attaching history', async () => {
        const f = await fixture(undefined, { start: false });
        try {
            f.onPreview(() => { expect(f.source.canWrite).toBe(false); f.revision(2); });
            await f.source.start();
            const baseline = f.source.getExternalRevision();
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.canWrite).toBe(true);
            await f.source.refreshStatus();
            expect(f.source.getExternalRevision()).toBe(baseline);
            f.save(async () => ({ revision: 3, currentRevision: 3 }));
            await f.commit('first inline edit');
            expect(f.submitted[0]?.expectedRevision).toBe(2);
            expect(f.source.state.savedRevision).toBe(3);
        } finally { await f.source.stop(); }
    });

    it('refuses same-version reload during local work without inventing an external revision', async () => {
        const f = await fixture();
        try {
            const baseline = f.source.getExternalRevision();
            const files = f.hydrated();
            f.localWork(true);
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Finish or copy');
            expect(f.source.getExternalRevision()).toBe(baseline);
            expect(f.source.state.conflict).toBe(false);
            expect(f.hydrated()).toBe(files);
            expect(f.navigations()).toBe(0);
        } finally { await f.source.stop(); }
    });

    it('retries a lost acknowledgement with the identical operation and original revision', async () => {
        const f = await fixture();
        try {
            let attempts = 0;
            f.save(async () => { if (++attempts === 1) throw new Error('Connection lost'); return { revision: 2, currentRevision: 2 }; });
            await f.commit();
            expect(f.submitted).toHaveLength(2);
            expect(f.submitted[0]).toBe(f.submitted[1]);
            expect(f.submitted[0]?.expectedRevision).toBe(1);
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.state.runtime?.appliedRevision).toBe(1);
            expect(f.source.canWrite).toBe(true);
        } finally { await f.source.stop(); }
    });

    it('keeps an ambiguous save recoverable and never rebases its retry onto a newer revision', async () => {
        const f = await fixture();
        try {
            f.save(async () => { throw new Error('Connection lost'); });
            await expect(f.commit()).rejects.toThrow('Connection lost');
            expect(f.source.canWrite).toBe(false);
            expect(f.source.canRetrySave).toBe(true);
            expect(f.source.hasPendingChanges).toBe(true);
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Retry the unconfirmed save');
            f.revision(3);
            await f.source.refreshStatus();
            f.save(async () => ({ revision: 2, currentRevision: 3 }));
            await f.source.retryPending();
            expect(f.submitted.every(operation => operation === f.submitted[0])).toBe(true);
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.hasPendingChanges).toBe(false);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.state.needsReload).toBe(true);
        } finally { await f.source.stop(); }
    });

    it('freezes stale edits after an external revision without overwriting the open source', async () => {
        const f = await fixture();
        try {
            const original = f.hydrated();
            f.revision(2);
            await f.source.refreshStatus();
            expect(f.source.state.conflict).toBe(true);
            expect(f.source.state.savedRevision).toBe(1);
            expect(f.hydrated()).toBe(original);
            await expect(f.commit()).rejects.toThrow('Reload or retry');
            expect(f.submitted).toHaveLength(0);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.pendingChangesBackup()).toMatchObject({ transport: 'local-only',
                expectedRevision: 1, changes: [{ path: 'notes.txt', content: 'after' }] });
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            expect(f.navigations()).toBe(0);
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.source.state.savedRevision).toBe(1);
            expect(f.hydrated()).toBe(original);
            expect(f.navigations()).toBe(1);
            expect(f.source.canWrite).toBe(false);
        } finally { await f.source.stop(); }
    });

    it('reports an acknowledged save truthfully when only the browser cache failed', async () => {
        const f = await fixture();
        try {
            await f.commit();
            f.cacheFailure();
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.state.error).toContain('changes were saved');
            expect(f.source.state.needsReload).toBe(true);
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.canWrite).toBe(false);
        } finally { await f.source.stop(); }
    });

    it('fetches authenticated binary bytes without text decoding and fences closed sessions', async () => {
        const bytes = new Uint8Array([195, 40]);
        const f = await fixture(bytes);
        expect(f.source.binaryContent('public/sample.bin')).toEqual(bytes);
        expect(f.hydrated()[0]?.content).toEqual(bytes);
        const copy = f.source.binaryContent('public/sample.bin')!;
        copy[0] = 0;
        expect(f.source.binaryContent('public/sample.bin')).toEqual(bytes);
        await f.source.stop();
        await expect(f.commit()).rejects.toThrow('Reload or retry');
        expect(f.submitted).toHaveLength(0);
    });

    it('starts preview and polling after reloading a failed initial source load', async () => {
        const f = await fixture(undefined, { start: false });
        try {
            f.failSnapshotOnce();
            await expect(f.source.start()).rejects.toThrow('Source temporarily unavailable');
            expect(f.counts()).toEqual({ previewRequests: 0, statusQueries: 0 });
            await f.source.reloadSavedSource();
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(f.counts().previewRequests).toBe(1);
            expect(f.counts().statusQueries).toBeGreaterThan(0);
            expect(f.source.canWrite).toBe(true);
            await f.source.reloadSavedSource();
            expect(f.counts().previewRequests).toBe(1);
        } finally { await f.source.stop(); }
    });

    it('shows a replacement runtime as starting instead of reusing the old expiry state', async () => {
        const f = await fixture(undefined, { role: 'content', start: false });
        f.runtime({ status: 'starting', expiresAt: Date.now() - 1 });
        await f.source.start();
        await f.source.refreshStatus();
        expect(f.source.state.runtime?.status).toBe('starting');
        expect(f.source.state.runtimeExpired).toBe(false);
        await f.source.stop();
    });

    it('marks expired previews stopped without automatically starting more paid runtimes', async () => {
        const f = await fixture();
        try {
            const requests = f.counts().previewRequests;
            f.runtime({ expiresAt: Date.now() - 1 });
            await f.source.refreshStatus();
            expect(f.source.state.runtimeExpired).toBe(true);
            expect(f.source.state.runtime?.status).toBe('stopped');
            expect(f.source.state.runtime?.previewUrl).toBeNull();
            expect(f.source.state.runtimeError).toContain('expired');
            expect(f.source.canWrite).toBe(true);
            await f.source.refreshStatus();
            expect(f.counts().previewRequests).toBe(requests);
            await f.source.retryPreview();
            expect(f.counts().previewRequests).toBe(requests + 1);
        } finally { await f.source.stop(); }
    });

    it('retains ambiguity when a lost acknowledgement is followed by a gate or auth rejection', async () => {
        const f = await fixture();
        try {
            let attempts = 0;
            f.save(async () => {
                if (++attempts === 1) throw new Error('Acknowledgement lost');
                throw Object.assign(new Error('Disabled'), { data: 'CLOUD_DISABLED' });
            });
            await expect(f.commit()).rejects.toThrow('Disabled');
            expect(f.source.canRetrySave).toBe(true);
            expect(f.source.state.error).toContain('could not be confirmed');
            f.save(async () => { throw Object.assign(new Error('Forbidden'), { data: 'FORBIDDEN' }); });
            await expect(f.source.retryPending()).rejects.toThrow('Forbidden');
            expect(f.source.canRetrySave).toBe(true);
            expect(f.submitted.every(operation => operation === f.submitted[0])).toBe(true);
            expect(f.submitted[0]?.expectedRevision).toBe(1);
            await expect(f.source.reloadSavedSource()).rejects.toThrow('unconfirmed save');
        } finally { await f.source.stop(); }
    });

    it('restores the exact unconfirmed binary operation after reopening, scoped to the same actor', async () => {
        const recovery = new MemoryRecoveryStore();
        const f = await fixture(new Uint8Array([0, 255]), { recovery });
        f.save(async () => { throw new Error('Acknowledgement lost'); });
        await expect(f.commit(new Uint8Array([195, 40]))).rejects.toThrow('Acknowledgement lost');
        const original = f.submitted[0]!;
        await f.source.stop();
        expect(recovery.records.size).toBe(1);

        const other = await fixture(undefined, { actorId: 'someone-else', recovery });
        try { expect(other.source.hasPendingChanges).toBe(false); expect(other.source.canWrite).toBe(true); }
        finally { await other.source.stop(); }
        expect(recovery.records.size).toBe(1);

        const reopened = await fixture(new Uint8Array([0, 255]), { recovery });
        try {
            expect(reopened.source.canWrite).toBe(false);
            expect(reopened.source.canRetrySave).toBe(true);
            expect(reopened.source.hasPendingChanges).toBe(true);
            reopened.revision(2);
            await reopened.source.retryPending();
            expect(reopened.submitted).toHaveLength(1);
            expect(reopened.submitted[0]).toEqual(original);
            expect(reopened.submitted[0]?.changes[0]?.content).toEqual(new Uint8Array([195, 40]).buffer);
            expect(recovery.records.size).toBe(0);
        } finally { await reopened.source.stop(); }
    });

    it('does not send an operation until its recovery copy is durable', async () => {
        const f = await fixture();
        try {
            f.recovery.failSave = true;
            await expect(f.commit()).rejects.toThrow('Browser recovery storage');
            expect(f.submitted).toHaveLength(0);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.canWrite).toBe(false);
            f.recovery.failSave = false;
            f.revision(2);
            await f.source.retryPending();
            expect(f.submitted).toHaveLength(1);
            expect(f.submitted[0]?.expectedRevision).toBe(1);
        } finally { await f.source.stop(); }
    });

    it('allows explicit reload when receipt-first conflict proves an uncertain save never committed', async () => {
        const f = await fixture();
        try {
            f.save(async () => { throw new Error('Acknowledgement lost'); });
            await expect(f.commit()).rejects.toThrow('Acknowledgement lost');
            f.revision(2);
            f.save(async () => { throw Object.assign(new Error('Conflict'), { data: 'CLOUD_CONFLICT' }); });
            await expect(f.source.retryPending()).rejects.toThrow('Conflict');
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.hasPendingChanges).toBe(true);
            expect([...f.recovery.records.values()][0]?.disposition).toBe('rejected');
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.navigations()).toBe(1);
            expect(f.source.canWrite).toBe(false);
            expect(f.recovery.records.size).toBe(0);
        } finally { await f.source.stop(); }
    });

    it('keeps the saved acknowledgement truthful when browser recovery cleanup fails', async () => {
        const f = await fixture();
        try {
            f.recovery.failRemove = true;
            await f.commit();
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.state.saveAcknowledged).toBe(true);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.state.error).toContain('changes were saved');
            expect(f.recovery.records.size).toBe(1);
            f.recovery.failRemove = false;
            f.revision(2);
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.recovery.records.size).toBe(0);
            expect(f.source.canWrite).toBe(false);
            expect(f.navigations()).toBe(1);
        } finally { await f.source.stop(); }
    });

    it('does not erase another open tab’s recovery during a reload or send a competing unsaved operation', async () => {
        const recovery = new MemoryRecoveryStore();
        const first = await fixture(undefined, { recovery });
        const second = await fixture(undefined, { recovery });
        try {
            first.save(async () => { throw new Error('Acknowledgement lost'); });
            await expect(first.commit()).rejects.toThrow('Acknowledgement lost');
            const original = [...recovery.records.values()][0]!;
            await expect(second.commit('another edit')).rejects.toThrow('Browser recovery storage');
            expect(second.submitted).toHaveLength(0);
            expect([...recovery.records.values()][0]).toEqual(original);
        } finally { await first.source.stop(); await second.source.stop(); }
    });

    it('keeps rejected backups across reopen and refuses to replay recovery older than receipts', async () => {
        const recovery = new MemoryRecoveryStore();
        const f = await fixture(undefined, { recovery });
        f.save(async () => { throw Object.assign(new Error('Conflict'), { data: 'CLOUD_CONFLICT' }); });
        await expect(f.commit()).rejects.toThrow('Conflict');
        await f.source.stop();
        const record = [...recovery.records.values()][0]!;
        expect(record.disposition).toBe('rejected');
        record.disposition = 'pending';
        record.createdAt = Date.now() - 31 * 86_400_000;
        const reopened = await fixture(undefined, { recovery });
        try {
            expect(reopened.source.hasPendingChanges).toBe(true);
            expect(reopened.source.canRetrySave).toBe(false);
            expect(reopened.source.state.recoveryExpired).toBe(true);
            expect(reopened.submitted).toHaveLength(0);
            await reopened.source.reloadSavedSource({ discardRecovery: true });
            expect(recovery.records.size).toBe(0);
            expect(reopened.source.canWrite).toBe(false);
            expect(reopened.navigations()).toBe(1);
        } finally { await reopened.source.stop(); }
    });
});


async function rejectedTextFixture() {
    const f = await fixture(undefined, { role: 'content' });
    f.save(async () => { throw { data: 'CLOUD_CONTENT_UNAPPROVED_CHANGE' }; });
    await expect(f.commit('Rejected candidate')).rejects.toBeDefined();
    f.localWork(true);
    f.editingText('Rejected heading');
    let acquired = 0;
    let released = 0;
    let valid = true;
    f.onNavigation(() => {
        acquired++;
        return {
            assertCurrent: () => { if (!valid) throw new Error('Text owner changed'); },
            release: () => { released++; },
        };
    });
    return { ...f, leases: () => ({ acquired, released }), invalidate: () => { valid = false; } };
}

describe('explicit rejected text document reload', () => {
    it('requires confirmation, retains downloadable memory, and retries without replaying text', async () => {
        const f = await rejectedTextFixture();
        try {
            const backup = f.source.pendingChangesBackup();
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            expect(f.leases()).toEqual({ acquired: 0, released: 0 });
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.recovery.records.size).toBe(0);
            expect(f.source.state.discardReloadRequested).toBe(true);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.pendingChangesBackup()).toEqual(backup);
            expect(f.leases()).toEqual({ acquired: 1, released: 0 });
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.navigations()).toBe(2);
            expect(f.leases()).toEqual({ acquired: 1, released: 0 });
            expect(f.submitted).toHaveLength(1);
            const source = f.source as unknown as { beforeUnload(event: BeforeUnloadEvent): void };
            let warnings = 0;
            const event = { preventDefault: () => { warnings++; }, returnValue: '' } as unknown as BeforeUnloadEvent;
            source.beforeUnload(event);
            expect(warnings).toBe(0);
            source.beforeUnload(event);
            expect(warnings).toBe(1);
        } finally { await f.source.stop(); }
        expect(f.leases()).toEqual({ acquired: 1, released: 1 });
    });

    it('keeps recovery when removal fails and restores it after a known reload failure', async () => {
        const f = await rejectedTextFixture();
        try {
            const record = structuredClone([...f.recovery.records.values()][0]);
            f.recovery.failRemove = true;
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow('cleanup unavailable');
            expect([...f.recovery.records.values()][0]).toEqual(record);
            expect(f.navigations()).toBe(0);
            expect(f.leases()).toEqual({ acquired: 1, released: 1 });
            f.recovery.failRemove = false;
            f.onReload(() => { throw new Error('Navigation denied'); });
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow('Navigation denied');
            expect([...f.recovery.records.values()][0]).toEqual(record);
            expect(f.source.state.discardReloadRequested).toBe(false);
            expect(f.source.state.discardReloadFailed).toBe(true);
            expect(f.source.pendingChangesBackup().editingText).toBe('Rejected heading');
            expect(f.leases()).toEqual({ acquired: 2, released: 2 });
            expect(f.submitted).toHaveLength(1);
        } finally { await f.source.stop(); }
    });

    it('refuses unrelated drafts and an owner change during journal removal', async () => {
        const f = await rejectedTextFixture();
        try {
            const unregister = f.source.registerLocalWork(() => true);
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow('Other unsaved');
            expect(f.leases().acquired).toBe(0);
            unregister();
            const record = structuredClone([...f.recovery.records.values()][0]);
            const remove = f.recovery.remove.bind(f.recovery);
            f.recovery.remove = async (key, operationId) => { await remove(key, operationId); f.invalidate(); };
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow('Text owner changed');
            expect([...f.recovery.records.values()][0]).toEqual(record);
            expect(f.navigations()).toBe(0);
            expect(f.leases()).toEqual({ acquired: 1, released: 1 });
            expect(f.source.pendingChangesBackup().editingText).toBe('Rejected heading');
        } finally { await f.source.stop(); }
    });

    it('does not remove a newer operation that acquired the journal', async () => {
        const f = await rejectedTextFixture();
        try {
            const key = { ...f.source.scope, actorId: 'actor' };
            const record = (await f.recovery.load(key))!;
            const newer = { ...record, operation: { ...record.operation, operationId: 'newer-operation-owner' } };
            const remove = f.recovery.remove.bind(f.recovery);
            f.recovery.remove = async (scope, operationId) => {
                await remove(scope, operationId);
                await f.recovery.save(scope, newer);
                // Simulate ownership changing after the load but before CAS removal.
                await remove(scope, operationId);
            };
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow('Another pending');
            expect((await f.recovery.load(key))?.operation.operationId).toBe('newer-operation-owner');
            expect(f.navigations()).toBe(0);
            expect(f.leases()).toEqual({ acquired: 1, released: 1 });
            expect(f.source.pendingChangesBackup().editingText).toBe('Rejected heading');
        } finally { await f.source.stop(); }
    });
});


describe('cloud semantic operation recovery', () => {
    const request = { transport: 'studio' as const, actorId: 'actor' as CloudEditorSnapshot['actorId'], expectedRevision: 1, expectedGeneration: 1, operation: { kind: 'createPage' as const, slug: 'contact' } };
    it('journals before semantic send and makes the old canvas read-only until explicit reload', async () => {
        const f = await fixture(undefined, { role: 'content' });
        f.save(async () => {
            expect([...f.recovery.records.values()][0]?.operation.transport).toBe('studio');
            expect([...f.recovery.records.values()][0]?.operation.operation).toEqual(request.operation);
            expect(f.source.canWrite).toBe(false);
            return { revision: 2, currentRevision: 2 };
        });
        const original = f.hydrated();
        await f.source.commitSemantic(request);
        expect(f.endpoints).toEqual(['cloudEditorStudioActions:commit']);
        expect(f.source.state.needsReload).toBe(true);
        expect(f.hydrated()).toBe(original);
        expect(f.recovery.records.size).toBe(0);
        await f.source.reloadSavedSource(); expect(f.navigations()).toBe(1); f.source.stop();
    });
    it('refuses semantic edits over a local draft or a stale actor/revision', async () => {
        const f = await fixture(); f.localWork(true);
        await expect(f.source.commitSemantic(request)).rejects.toThrow(); f.localWork(false);
        await expect(f.source.commitSemantic({ ...request, expectedRevision: 0 })).rejects.toThrow();
        await expect(f.source.commitSemantic({ ...request, actorId: 'other' as CloudEditorSnapshot['actorId'] })).rejects.toThrow();
        expect(f.submitted).toHaveLength(0); f.source.stop();
    });
    it('resolves a lost-response duplicate refusal but preserves an unknown save after revocation', async () => {
        for (const code of ['CLOUD_STUDIO_ROUTE_OCCUPIED', 'CLOUD_STUDIO_UNAVAILABLE']) {
            const f = await fixture(); let attempt = 0;
            f.save(async () => { if (attempt++ === 0) throw new Error('Connection lost'); throw Object.assign(new Error(code), { data: code }); });
            await expect(f.source.commitSemantic(request)).rejects.toThrow(code);
            const record = [...f.recovery.records.values()][0]!;
            expect(record.disposition).toBe(code === 'CLOUD_STUDIO_ROUTE_OCCUPIED' ? 'rejected' : 'pending');
            expect(record.definitiveRejection).toBe(code === 'CLOUD_STUDIO_ROUTE_OCCUPIED');
            f.source.stop();
        }
    });
    it('keeps original semantic payload and operation ID across lost responses and retry', async () => {
        const f = await fixture(); f.save(async () => { throw new Error('Connection lost'); });
        await expect(f.source.commitSemantic(request)).rejects.toThrow();
        const operation = structuredClone([...f.recovery.records.values()][0]!.operation);
        expect(f.source.pendingChangesBackup().semanticOperation).toEqual(request.operation);
        f.save(async args => { expect(args.operationId).toBe(operation.operationId); return { revision: 2, currentRevision: 2 }; });
        await f.source.retryPending();
        expect(f.recovery.records.size).toBe(0); expect(f.source.state.needsReload).toBe(true); f.source.stop();
    });
});
