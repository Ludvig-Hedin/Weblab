import { describe, expect, it, spyOn } from 'bun:test';
import type { FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';

import type {
    CodeFileSystem,
    DurableCommitHandler,
    DurableRecoveryHandler,
    DurableSourceChange,
    DurableSourceFile,
} from '@weblab/file-system';

import type { RejectedTextNavigationLease } from '../text';
import type {
    CloudRecoveryKey,
    CloudRecoveryOperation,
    CloudRecoveryRecord,
    CloudRecoveryStore,
} from './cloud-recovery';
import type {
    CloudEditorAccess,
    CloudEditorClient,
    CloudEditorCommit,
    CloudEditorCommitResult,
    CloudEditorContracts,
    CloudTextContracts,
    CloudEditorImportPreparation,
    CloudEditorImportPreparationResult,
    CloudEditorRuntimeStatus,
    CloudEditorSnapshot,
} from '@/lib/cloud-editor/api';
import { CloudSource, validCloudTextApproval } from './cloud-source';

class MemoryRecoveryStore implements CloudRecoveryStore {
    readonly records = new Map<string, CloudRecoveryRecord>();
    failSave = false;
    failRemove = false;
    private key(key: CloudRecoveryKey): string {
        return JSON.stringify([key.actorId, key.projectId, key.branchId]);
    }
    async load(key: CloudRecoveryKey): Promise<CloudRecoveryRecord | null> {
        return structuredClone(this.records.get(this.key(key)) ?? null);
    }
    async save(key: CloudRecoveryKey, record: CloudRecoveryRecord): Promise<void> {
        if (this.failSave) throw new Error('Storage full');
        const existing = this.records.get(this.key(key));
        if (existing && existing.operation.operationId !== record.operation.operationId)
            throw new Error('Another pending operation owns this recovery record');
        const definitiveRejection =
            record.definitiveRejection === true || existing?.definitiveRejection === true;
        const ambiguous =
            !definitiveRejection && (record.ambiguous || existing?.ambiguous === true);
        this.records.set(
            this.key(key),
            structuredClone({
                ...record,
                definitiveRejection,
                ambiguous,
                disposition: definitiveRejection
                    ? 'rejected'
                    : ambiguous
                      ? 'pending'
                      : record.disposition,
            }),
        );
    }
    async remove(key: CloudRecoveryKey, operationId: string): Promise<void> {
        if (this.failRemove) throw new Error('Recovery cleanup unavailable');
        const existing = this.records.get(this.key(key));
        if (existing && existing.operation.operationId !== operationId)
            throw new Error('Another pending operation owns this recovery record');
        this.records.delete(this.key(key));
    }
}

async function hash(bytes: Uint8Array): Promise<string> {
    return Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
        (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
}

async function fixture(
    binary?: Uint8Array,
    options: {
        start?: boolean;
        actorId?: string;
        recovery?: MemoryRecoveryStore;
        role?: CloudEditorAccess['role'];
        path?: string;
        profile?: CloudEditorSnapshot['profile'];
    } = {},
) {
    const original = binary ?? new TextEncoder().encode('before');
    const path = options.path ?? (binary ? 'public/sample.bin' : 'notes.txt');
    const profile = options.profile ?? 'starter-v1';
    const importedAuthority = profile === 'starter-v1' ? undefined : {
        preparationId: profile === 'imported-next-v1' ? 'preparation' as CloudEditorImportPreparationResult['preparationId'] : null,
        designRevision: profile === 'imported-next-v1' ? 1 : null,
    };
    let snapshot: CloudEditorSnapshot = {
        profile, importedAuthority,
        actorId: (options.actorId ?? 'actor') as CloudEditorSnapshot['actorId'],
        revision: 1,
        files: [
            {
                path,
                kind: 'file',
                text: binary ? null : 'before',
                storageId: binary && profile === 'starter-v1'
                    ? ('asset' as NonNullable<CloudEditorSnapshot['files'][number]['storageId']>)
                    : null,
                hash: await hash(original),
                bytes: original.length,
            },
        ],
    };
    let runtime: CloudEditorRuntimeStatus = {
        actorId: snapshot.actorId, importedAuthority, profile,
        capabilities: { sourceWrite: profile !== 'imported-source-v1', contentWrite: profile === 'starter-v1', preview: profile !== 'imported-source-v1', release: profile === 'starter-v1', imported: profile !== 'starter-v1' },
        revision: 1,
        appliedRevision: 1,
        status: profile === 'starter-v1' ? 'ready' : 'stopped',
        previewUrl: 'https://preview.example.com',
        previewToken: null,
        expiresAt: Date.now() + 900_000,
        error: null,
        enabled: profile !== 'imported-source-v1',
    };
    let commit!: DurableCommitHandler;
    let cacheFailure!: () => void;
    let prepareRecovery!: DurableRecoveryHandler;
    let hydrated: DurableSourceFile[] = [];
    let beforeHydrate: (signal?: AbortSignal) => Promise<void> = async () => {};
    const fs = {
        setDurableCommitHandler(handler: DurableCommitHandler) {
            commit = handler;
        },
        setDurableRecoveryHandler(handler: DurableRecoveryHandler) {
            prepareRecovery = handler;
        },
        setDurableCacheErrorHandler(handler: () => void) {
            cacheFailure = handler;
        },
        async hydrateDurableSnapshot(files: DurableSourceFile[], signal?: AbortSignal) {
            await beforeHydrate(signal);
            signal?.throwIfAborted();
            hydrated = files;
        },
    } as unknown as CodeFileSystem;
    const submitted: CloudRecoveryOperation[] = [];
    const endpoints: string[] = [];
    const role = options.role === undefined ? 'designer' : options.role;
    let access: CloudEditorAccess = {
        actorId: snapshot.actorId,
        role,
        canPrepareImport: profile === 'imported-source-v1' && (role === 'designer' || role === 'responsible'),
        canDesign: profile !== 'imported-source-v1' && (role === 'designer' || role === 'responsible'),
        canPreview: profile !== 'imported-source-v1' && role !== null,
        canEditContent: profile === 'starter-v1' && role !== null,
        canPublish: false,
        canManage: role === 'responsible',
    };
    let contracts: CloudEditorContracts = {
        actorId: snapshot.actorId,
        revision: 1,
        contracts: [
            {
                path,
                generation: 1,
                bindings: [{ oid: 'heading', fields: ['text'] }],
                fingerprint: 'approved',
                active: true,
            },
        ],
    };
    let textContracts: CloudTextContracts = { actorId: snapshot.actorId, revision: 1, designRevision: 1,
        contracts: [{ path, version: 2, generation: 1, designRevision: 1, active: true, current: true,
            bindings: [{ bindingId: 'heading-binding', target: { kind: 'component-literal', exportName: 'Hero', oid: 'heading' } }], fingerprint: 'approved' }] };
    let readTextContracts = async () => {};
    let readAccess = async () => {};
    let readAsset = async () => {};
    let readSnapshot = async () => {};
    let readStatus = async () => {};
    const recovery = options.recovery ?? new MemoryRecoveryStore();
    let snapshotFailures = 0;
    let previewRequests = 0;
    let statusQueries = 0;
    let preparePreview = () => {};
    const preparations: CloudEditorImportPreparation[] = [];
    const completePreparation = async (): Promise<CloudEditorImportPreparationResult> => {
        snapshot = { ...snapshot, profile: 'imported-next-v1', revision: 2,
            importedAuthority: { preparationId: 'preparation' as CloudEditorImportPreparationResult['preparationId'], designRevision: 2 }, files: [{ ...snapshot.files[0]!,
            text: 'prepared', hash: await hash(new TextEncoder().encode('prepared')), bytes: 8 }] };
        runtime = { ...runtime, profile: 'imported-next-v1', importedAuthority: snapshot.importedAuthority, revision: 2, status: 'stopped', enabled: true,
            capabilities: { sourceWrite: true, contentWrite: false, preview: true, release: false, imported: true } };
        access = { ...access, canPrepareImport: false, canDesign: true, canPreview: true, canEditContent: false };
        return { profile: 'imported-next-v1', revision: 2, preparationId: 'preparation' as CloudEditorImportPreparationResult['preparationId'] };
    };
    let prepare: (args: CloudEditorImportPreparation) => Promise<CloudEditorImportPreparationResult> = completePreparation;
    let save = async (_args: CloudEditorCommit): Promise<CloudEditorCommitResult> => ({
        revision: 2,
        currentRevision: 2,
    });
    const client = {
        async query(ref: FunctionReference<'query'>) {
            if (getFunctionName(ref) === 'cloudEditorAccess:access') {
                await readAccess();
                return access;
            }
            if (getFunctionName(ref) === 'cloudEditorText:contracts') { await readTextContracts(); return structuredClone(textContracts); }
            if (getFunctionName(ref) === 'cloudEditorContentImages:imageContracts') return { actorId: access.actorId, revision: snapshot.revision, designRevision: 1, contracts: [] };
            if (getFunctionName(ref) === 'cloudEditorContent:contracts')
                return structuredClone(contracts);
            if (getFunctionName(ref) === 'cloudEditor:snapshot') {
                await readSnapshot();
                if (snapshotFailures-- > 0) throw new Error('Source temporarily unavailable');
                return snapshot;
            }
            statusQueries++;
            await readStatus();
            return runtime;
        },
        async mutation(ref: FunctionReference<'mutation'>) {
            if (getFunctionName(ref) === 'cloudPreviewAccess:issue') {
                runtime = { ...runtime, previewToken: 'a'.repeat(64) };
                return {
                    previewToken: runtime.previewToken,
                    expiresAt: runtime.expiresAt,
                    sandboxId: 'sandbox',
                };
            }
            previewRequests++;
            preparePreview();
            return null;
        },
        async action(ref: FunctionReference<'action'>, args: CloudEditorCommit | CloudEditorImportPreparation) {
            if (getFunctionName(ref) === 'cloudEditorActions:readAsset') {
                await readAsset();
                return Uint8Array.from(original).buffer;
            }
            if (getFunctionName(ref) === 'cloudEditorImportPreparationActions:prepare') {
                preparations.push(structuredClone(args as CloudEditorImportPreparation));
                return prepare(args as CloudEditorImportPreparation);
            }
            submitted.push(args as CloudEditorCommit);
            endpoints.push(getFunctionName(ref));
            return save(args as CloudEditorCommit);
        },
    } as unknown as CloudEditorClient;
    let navigations = 0;
    let localWork = false;
    let editingText: string | null = null;
    let prepareNavigation: () => RejectedTextNavigationLease = () => {
        throw new Error('No failed text session');
    };
    let requestReload = () => {};
    const owner = new AbortController();
    let ownerCurrent = true;
    const source = new CloudSource(
        client,
        { projectId: 'project', branchId: 'branch' } as CloudSource['scope'],
        fs,
        {
            owner: { signal: owner.signal, isCurrent: () => ownerCurrent && !owner.signal.aborted },
            recoveryStore: recovery,
            requestReload: () => {
                navigations++;
                requestReload();
            },
            hasLocalWork: () => localWork,
            recoverableText: () => editingText,
            prepareRejectedTextNavigation: () => prepareNavigation(),
        },
    );
    if (options.start !== false) {
        await source.start();
        await source.refreshStatus();
    }
    return {
        source,
        preparations, completePreparation, onPrepare: (handler: typeof prepare) => { prepare = handler; },
        onSnapshot: (handler: typeof readSnapshot) => { readSnapshot = handler; },
        onStatus: (handler: typeof readStatus) => { readStatus = handler; },
        submitted,
        endpoints,
        recovery,
        changeAccount: () => owner.abort(),
        revokeOwner: () => {
            ownerCurrent = false;
        },
        onHydrate: (handler: typeof beforeHydrate) => {
            beforeHydrate = handler;
        },
        onAsset: (handler: typeof readAsset) => {
            readAsset = handler;
        },
        prepareRecovery: (changes: DurableSourceChange[]) => prepareRecovery(changes),
        navigations: () => navigations,
        localWork: (value: boolean) => {
            localWork = value;
        },
        commit: (content: string | Uint8Array = 'after') => commit([{ path, content }]),
        editingText: (value: string | null) => {
            editingText = value;
        },
        onNavigation: (handler: typeof prepareNavigation) => {
            prepareNavigation = handler;
        },
        onReload: (handler: typeof requestReload) => {
            requestReload = handler;
        },
        commitChanges: (changes: DurableSourceChange[]) => commit(changes),
        access: (change: Partial<CloudEditorAccess>) => {
            access = { ...access, ...change };
        },
        contracts: (change: Partial<CloudEditorContracts>) => {
            contracts = { ...contracts, ...change };
        },
        textContracts: (change: Partial<CloudTextContracts>) => { textContracts = { ...textContracts, ...change }; },
        onTextContracts: (handler: typeof readTextContracts) => { readTextContracts = handler; },
        onAccess: (handler: typeof readAccess) => {
            readAccess = handler;
        },
        generation: (generation: number) => {
            contracts.contracts[0]!.generation = generation;
        },
        cacheFailure: () => cacheFailure(),
        hydrated: () => hydrated,
        save: (handler: typeof save) => {
            save = handler;
        },
        revision: (revision: number) => {
            runtime = { ...runtime, revision };
            snapshot = { ...snapshot, revision };
            contracts = { ...contracts, revision };
            textContracts = { ...textContracts, revision };
        },
        runtime: (change: Partial<CloudEditorRuntimeStatus>) => {
            runtime = { ...runtime, ...change };
        },
        onPreview: (handler: () => void) => {
            preparePreview = handler;
        },
        failSnapshotOnce: () => {
            snapshotFailures = 1;
        },
        counts: () => ({ previewRequests, statusQueries }),
    };
}

describe('explicit imported-site preparation and preview', () => {
    it('opens either imported profile without starting a paid preview', async () => {
        for (const profile of ['imported-source-v1', 'imported-next-v1'] as const) {
            const f = await fixture(undefined, { profile });
            try {
                expect(f.counts().previewRequests).toBe(0);
                expect(f.preparations).toHaveLength(0);
                if (profile === 'imported-next-v1') {
                    await f.source.retryPreview();
                    expect(f.counts().previewRequests).toBe(1);
                }
            } finally { await f.source.stop(); }
        }
    });

    it('prepares, reloads saved source and refreshes capabilities without starting preview', async () => {
        const f = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            expect(f.source.canPrepareImport).toBe(true);
            expect(f.source.state.runtime?.enabled).toBe(false);
            expect(f.source.canWrite).toBe(false);
            await f.source.prepareImportedSource();
            expect(f.source.state.profile).toBe('imported-next-v1');
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.hydrated()[0]?.content).toBe('prepared');
            expect(f.source.canPrepareImport).toBe(false);
            expect(f.source.canWrite).toBe(true);
            expect(f.source.canPreview).toBe(true);
            expect(f.source.canEditContent).toBe(false);
            expect(f.counts().previewRequests).toBe(0);
            expect(f.preparations[0]).toMatchObject({ projectId: 'project', branchId: 'branch', expectedRevision: 1 });
            expect(f.preparations[0]!.operationKey).toMatch(/^prepare_[a-f0-9]{64}$/);
        } finally { await f.source.stop(); }
    });

    it('keeps the same preparation key after timeout and a browser restart', async () => {
        const f = await fixture(undefined, { profile: 'imported-source-v1' });
        let operationKey: string;
        try {
            f.onPrepare(async () => { throw Error('Connection lost'); });
            await expect(f.source.prepareImportedSource()).rejects.toThrow('Connection lost');
            await expect(f.source.prepareImportedSource()).rejects.toThrow('Connection lost');
            expect(f.preparations[0]).toEqual(f.preparations[1]);
            operationKey = f.preparations[0]!.operationKey;
            expect(f.source.state.preparationError).toBe(true);
            expect(f.source.state.savedRevision).toBe(1);
            expect(f.counts().previewRequests).toBe(0);
        } finally { await f.source.stop(); }
        const reopened = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            await reopened.source.prepareImportedSource();
            expect(reopened.preparations[0]!.operationKey).toBe(operationKey!);
            expect(reopened.counts().previewRequests).toBe(0);
        } finally { await reopened.source.stop(); }
    });

    it('reads the saved result when preparation committed but its response was lost', async () => {
        const f = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            let calls = 0;
            f.onPrepare(async () => {
                const receipt = await f.completePreparation();
                if (++calls === 1) throw Error('Response lost');
                return receipt;
            });
            await expect(f.source.prepareImportedSource()).rejects.toThrow('Response lost');
            await f.source.prepareImportedSource();
            expect(f.preparations).toHaveLength(1);
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.counts().previewRequests).toBe(0);
        } finally { await f.source.stop(); }
    });

    it('coalesces double clicks and keeps source writes frozen while preparation is in flight', async () => {
        const f = await fixture(undefined, { profile: 'imported-source-v1' });
        let release!: () => void;
        let arrived!: () => void;
        const waiting = new Promise<void>(resolve => { release = resolve; });
        const started = new Promise<void>(resolve => { arrived = resolve; });
        try {
            f.onPrepare(async () => { arrived(); await waiting; return f.completePreparation(); });
            const first = f.source.prepareImportedSource();
            await started;
            expect(f.source.prepareImportedSource()).toBe(first);
            expect(f.source.state.preparingImport).toBe(true);
            expect(f.source.canWrite).toBe(false);
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Wait for preparation');
            release(); await first;
            expect(f.preparations).toHaveLength(1);
            expect(f.source.state.preparingImport).toBe(false);
        } finally { release(); await f.source.stop(); }
    });

    it('preserves existing edits and recovery text and refuses content/viewer preparation', async () => {
        const f = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            f.localWork(true);
            await expect(f.source.prepareImportedSource()).rejects.toThrow('Finish or recover');
            f.localWork(false); f.editingText('Keep my text');
            await expect(f.source.prepareImportedSource()).rejects.toThrow('Finish or recover');
            expect(f.source.pendingChangesBackup().editingText).toBe('Keep my text');
            expect(f.preparations).toHaveLength(0);
        } finally { await f.source.stop(); }
        for (const role of ['content', null] as const) {
            const denied = await fixture(undefined, { profile: 'imported-source-v1', role });
            try {
                expect(denied.source.canPrepareImport).toBe(false);
                await expect(denied.source.prepareImportedSource()).rejects.toThrow();
                expect(denied.preparations).toHaveLength(0);
            } finally { await denied.source.stop(); }
        }
    });

    it('rechecks role before sending and retains local work that appears while reloading prepared source', async () => {
        const revoked = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            revoked.access({ role: 'content', canPrepareImport: false, canDesign: false, canPreview: false });
            await expect(revoked.source.prepareImportedSource()).rejects.toThrow('unavailable');
            expect(revoked.preparations).toHaveLength(0);
        } finally { await revoked.source.stop(); }
        const f = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            const before = f.hydrated();
            f.onSnapshot(async () => { f.localWork(true); });
            await expect(f.source.prepareImportedSource()).rejects.toThrow('Finish or copy');
            expect(f.hydrated()).toBe(before);
            expect(f.source.hasLocalWork).toBe(true);
            expect(f.source.state.needsReload).toBe(true);
            expect(f.source.canWrite).toBe(false);
            expect(f.counts().previewRequests).toBe(0);
        } finally { await f.source.stop(); }
    });

    it('retains pending recovery and handles server revocation after the permission refresh', async () => {
        const pending = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            await pending.prepareRecovery([{ path: 'notes.txt', content: 'Keep this draft' }])();
            await expect(pending.source.prepareImportedSource()).rejects.toThrow('Finish or recover');
            expect(pending.preparations).toHaveLength(0);
            expect(pending.source.pendingChangesBackup().changes[0]?.content).toBe('Keep this draft');
        } finally { await pending.source.stop(); }
        const revoked = await fixture(undefined, { profile: 'imported-source-v1' });
        try {
            const before = revoked.hydrated();
            revoked.onPrepare(async () => { throw Object.assign(new Error('Access revoked'), { data: 'CLOUD_ROLE_REQUIRED' }); });
            await expect(revoked.source.prepareImportedSource()).rejects.toThrow('Access revoked');
            expect(revoked.source.state.savedRevision).toBe(1);
            expect(revoked.hydrated()).toBe(before);
            expect(revoked.source.state.preparationError).toBe(true);
            expect(revoked.source.canWrite).toBe(false);
            expect(revoked.counts().previewRequests).toBe(0);
        } finally { await revoked.source.stop(); }
    });
});

describe('durable cloud source adapter', () => {
    it('does not install capabilities or hydrate after its account changes during admission', async () => {
        const f = await fixture(undefined, { start: false, role: 'content' });
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        f.onAccess(async () => {
            entered.resolve();
            await release.promise;
        });
        const settled = f.source.start().then(
            () => null,
            (error: unknown) => error,
        );
        await entered.promise;
        f.changeAccount();
        release.resolve();
        expect(await settled).toBeInstanceOf(Error);
        expect(f.hydrated()).toEqual([]);
        expect(f.source.state.accessReady).toBe(false);
        expect(f.source.state.access).toBeNull();
        expect(f.source.state.runtime).toBeNull();
        expect(f.source.canWrite).toBe(false);
        expect(f.counts().previewRequests).toBe(0);
        await f.source.stop();
    });

    it('refuses starter binary bytes returned after the initiating account is lost', async () => {
        const f = await fixture(new Uint8Array([0, 1, 255]), { start: false, role: 'content' });
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        f.onAsset(async () => {
            entered.resolve();
            await release.promise;
        });
        const settled = f.source.start().then(
            () => null,
            (error: unknown) => error,
        );
        await entered.promise;
        f.changeAccount();
        release.resolve();
        expect(await settled).toBeInstanceOf(Error);
        expect(f.hydrated()).toEqual([]);
        expect(f.source.state.savedRevision).toBe(0);
        expect(f.source.state.accessReady).toBe(false);
        expect(f.source.state.runtime).toBeNull();
        expect(f.submitted).toEqual([]);
        await f.source.stop();
    });

    it('passes account cancellation into an in-progress durable hydration', async () => {
        const f = await fixture(undefined, { start: false, role: 'content' });
        const entered = Promise.withResolvers<AbortSignal>();
        const release = Promise.withResolvers<void>();
        f.onHydrate(async (signal) => {
            if (!signal) throw new Error('Hydration must receive its source cancellation signal');
            entered.resolve(signal);
            await release.promise;
        });
        const settled = f.source.start().then(
            () => null,
            (error: unknown) => error,
        );
        const signal = await entered.promise;
        f.changeAccount();
        expect(signal.aborted).toBe(true);
        release.resolve();
        expect(await settled).toBeInstanceOf(Error);
        expect(f.hydrated()).toEqual([]);
        expect(f.source.state.savedRevision).toBe(0);
        expect(f.source.state.accessReady).toBe(false);
        expect(f.counts().previewRequests).toBe(0);
        await f.source.stop();
    });

    it('rejects a source callback owner lost without waiting for explicit disposal', async () => {
        const f = await fixture(undefined, { start: false, role: 'content' });
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        f.onAccess(async () => {
            entered.resolve();
            await release.promise;
        });
        const settled = f.source.start().then(
            () => null,
            (error: unknown) => error,
        );
        await entered.promise;
        f.revokeOwner();
        release.resolve();
        expect(await settled).toBeInstanceOf(Error);
        expect(f.hydrated()).toEqual([]);
        expect(f.source.canWrite).toBe(false);
        await f.source.stop();
    });

    it('refuses admission from an actor other than the captured snapshot actor', async () => {
        const f = await fixture(undefined, { start: false, role: 'content' });
        f.access({ actorId: 'other-actor' as CloudEditorAccess['actorId'] });
        try {
            await expect(f.source.start()).rejects.toThrow('account changed');
            expect(f.hydrated()).toEqual([]);
            expect(f.source.state.accessReady).toBe(false);
            expect(f.counts().previewRequests).toBe(0);
        } finally {
            await f.source.stop();
        }
    });
    it('pins raw preparation recovery to the original actor, scope and revision and restores download-only', async () => {
        const f = await fixture();
        const bytes = new Uint8Array([0, 8, 255]);
        const preserve = f.prepareRecovery([
            { path: 'broken.tsx', content: '<unfinished' },
            { path: 'image.bin', content: bytes },
        ]);
        bytes[1] = 99;
        f.source.state.savedRevision = 12;
        await f.source.stop();
        await preserve();
        const record = [...f.recovery.records.values()][0]!;
        expect(record).toMatchObject({
            actorId: 'actor',
            disposition: 'rejected',
            ambiguous: false,
            definitiveRejection: true,
            operation: {
                projectId: 'project',
                branchId: 'branch',
                actorId: 'actor',
                expectedRevision: 1,
                transport: 'local-only',
            },
        });
        expect(new Uint8Array(record.operation.changes[1]!.content as ArrayBuffer)).toEqual(
            new Uint8Array([0, 8, 255]),
        );
        expect(f.submitted).toHaveLength(0);
        const reopened = await fixture(undefined, { recovery: f.recovery });
        try {
            expect(reopened.source.canRetrySave).toBe(false);
            expect(reopened.source.canWrite).toBe(false);
            expect(reopened.source.pendingChangesBackup().changes[0]).toMatchObject({
                content: '<unfinished',
            });
            await reopened.source.retryPending();
            expect(reopened.submitted).toHaveLength(0);
            await expect(reopened.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            expect(reopened.recovery.records.size).toBe(1);
            await reopened.source.reloadSavedSource({ discardRecovery: true });
            expect(reopened.recovery.records.size).toBe(0);
        } finally {
            await reopened.source.stop();
        }
    });

    it('retains an older ambiguous operation and a colliding raw proposal in the same download', async () => {
        const f = await fixture();
        try {
            // Simulate another tab acquiring the journal after this tab loaded.
            const old: CloudRecoveryRecord = {
                version: 2,
                actorId: 'actor',
                disposition: 'pending',
                ambiguous: true,
                createdAt: Date.now(),
                operation: {
                    ...f.source.scope,
                    actorId: 'actor' as CloudEditorCommit['actorId'],
                    expectedRevision: 1,
                    operationId: 'earlier-operation-123',
                    transport: 'design',
                    transportVersion: 1,
                    changes: [{ path: 'notes.txt', content: 'Earlier unconfirmed edit' }],
                },
            };
            await f.recovery.save({ ...f.source.scope, actorId: 'actor' }, old);
            const storedBeforeCollision = structuredClone([...f.recovery.records.values()][0]);
            await expect(
                f.prepareRecovery([{ path: 'broken.tsx', content: '<new unfinished' }])(),
            ).rejects.toThrow('Browser recovery');
            expect([...f.recovery.records.values()][0]).toEqual(storedBeforeCollision);
            const backup = f.source.pendingChangesBackup();
            expect(backup.operationId).toBe(old.operation.operationId);
            expect(backup.changes[0]?.content).toBe('Earlier unconfirmed edit');
            expect(backup.localAttempts[0]).toMatchObject({
                stored: false,
                changes: [{ content: '<new unfinished' }],
            });
            expect(f.source.state.error).toContain('Keep this tab open');
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow(
                'Retry the unconfirmed save',
            );
            expect([...f.recovery.records.values()][0]).toEqual(storedBeforeCollision);
            expect(f.submitted).toHaveLength(0);
        } finally {
            await f.source.stop();
        }
    });

    it('keeps preparation bytes downloadable when recovery storage is unavailable', async () => {
        const f = await fixture();
        try {
            f.recovery.failSave = true;
            await expect(
                f.prepareRecovery([{ path: 'broken.tsx', content: '<keep me' }])(),
            ).rejects.toThrow('Browser recovery');
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.pendingChangesBackup().localAttempts[0]?.changes[0]?.content).toBe(
                '<keep me',
            );
            expect(f.source.state.error).toContain('Keep this tab open');
            expect(f.submitted).toHaveLength(0);
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.source.hasPendingChanges).toBe(false);
        } finally {
            await f.source.stop();
        }
    });

    it('preserves rejected preflight bytes without selecting a transport endpoint', async () => {
        const f = await fixture(undefined, { role: 'content' });
        try {
            await expect(
                f.commitChanges([{ path: 'not-approved.tsx', content: '<pending' }]),
            ).rejects.toThrow('no approved content contract');
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.pendingChangesBackup().transport).toBe('local-only');
            expect(f.source.pendingChangesBackup().changes[0]?.content).toBe('<pending');
            expect(f.submitted).toHaveLength(0);
        } finally {
            await f.source.stop();
        }
    });

    it('pins an approved attribute to content transport even if a designer changes UI mode while queued', async () => {
        const f = await fixture(undefined, { role: 'designer', path: 'app/page.tsx' });
        try {
            f.contracts({
                contracts: [
                    {
                        path: 'app/page.tsx',
                        generation: 1,
                        fingerprint: 'approved',
                        active: true,
                        bindings: [{ oid: 'image', fields: ['alt'] }],
                    },
                ],
            });
            await f.source.refreshCapabilities();
            f.source.setContentMode(true);
            const saved = await f.source.withApprovedAttributeWrite(
                {
                    actorId: 'actor',
                    branchId: 'branch',
                    path: 'app/page.tsx',
                    oid: 'image',
                    field: 'alt',
                    generation: 1,
                    revision: 1,
                    value: 'Description',
                    candidate: 'after',
                },
                async () => {
                    expect(f.source.hasLocalWork).toBe(true);
                    f.source.setContentMode(false);
                    await f.commit('after');
                    return true;
                },
            );
            expect(saved).toBe(true);
            expect(f.endpoints).toEqual(['cloudEditorContentActions:commit']);
            expect(f.submitted[0]).toMatchObject({
                transport: 'content',
                transportVersion: 1,
                expectedContracts: [{ path: 'app/page.tsx', generation: 1 }],
            });
            expect(f.source.state.attributeWritePending).toBe(false);
        } finally {
            await f.source.stop();
        }
    });

    it('rejects reapproval between field admission and its durable source write without rebinding', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'app/page.tsx' });
        try {
            f.contracts({
                contracts: [
                    {
                        path: 'app/page.tsx',
                        generation: 1,
                        fingerprint: 'approved',
                        active: true,
                        bindings: [{ oid: 'image', fields: ['alt'] }],
                    },
                ],
            });
            await f.source.refreshCapabilities();
            await expect(
                f.source.withApprovedAttributeWrite(
                    {
                        actorId: 'actor',
                        branchId: 'branch',
                        path: 'app/page.tsx',
                        oid: 'image',
                        field: 'alt',
                        generation: 1,
                        revision: 1,
                        value: 'Description',
                        candidate: 'after',
                    },
                    async () => {
                        f.generation(2);
                        await f.source.refreshCapabilities();
                        await f.commit('after');
                        return true;
                    },
                ),
            ).rejects.toThrow('approved field changed');
            expect(f.submitted).toHaveLength(0);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.pendingChangesBackup()).toMatchObject({
                transport: 'local-only',
                expectedRevision: 1,
                changes: [{ path: 'app/page.tsx', content: 'after' }],
            });
            await f.source.retryPending();
            expect(f.submitted).toHaveLength(0);
        } finally {
            await f.source.stop();
        }
    });

    it('allows only the pinned field candidate and exact approved attribute choices', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'app/page.tsx' });
        try {
            f.contracts({
                contracts: [
                    {
                        path: 'app/page.tsx',
                        generation: 1,
                        fingerprint: 'approved',
                        active: true,
                        bindings: [
                            {
                                oid: 'image',
                                fields: ['alt', 'src', 'className'],
                                allowedValues: { src: ['/image.png'] },
                                choices: { compact: 'w-24', large: 'w-48' },
                            },
                        ],
                    },
                ],
            });
            await f.source.refreshCapabilities();
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'src', '/image.png')).toBe(
                true,
            );
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'src', '/other.png')).toBe(
                false,
            );
            expect(
                f.source.canEditAttribute('app/page.tsx', 'image', 'className', 'absolute'),
            ).toBe(false);
            expect(f.source.canEditAttribute('app/page.tsx', 'image', 'className', 'w-48')).toBe(
                true,
            );
            expect(
                f.source.canEditAttribute('app/page.tsx', 'image', 'alt', 'x'.repeat(1001)),
            ).toBe(false);
            await expect(
                f.source.withApprovedAttributeWrite(
                    {
                        actorId: 'actor',
                        branchId: 'branch',
                        path: 'app/page.tsx',
                        oid: 'image',
                        field: 'alt',
                        generation: 1,
                        revision: 1,
                        value: 'Description',
                        candidate: 'after',
                    },
                    async () => {
                        await f.commit('unrelated bytes');
                        return true;
                    },
                ),
            ).rejects.toThrow('approved field changed');
            expect(f.submitted).toHaveLength(0);
        } finally {
            await f.source.stop();
        }
    });

    it('waits for server access before admitting writes, and never starts preview for content users', async () => {
        const f = await fixture(undefined, {
            start: false,
            role: 'content',
            path: 'src/app/page.tsx',
        });
        let release!: () => void;
        let reading!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const started = new Promise<void>((resolve) => {
            reading = resolve;
        });
        f.onAccess(async () => {
            reading();
            await gate;
        });
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
        } finally {
            release();
            await f.source.stop();
        }
    });

    it('keeps unassigned project viewers read-only without starting preview', async () => {
        const f = await fixture(undefined, { role: null });
        try {
            expect(f.source.canWrite).toBe(false);
            expect(f.source.approvedTextBindings).toEqual([]);
            await expect(f.commit()).rejects.toThrow('Reload or retry');
            expect(f.submitted).toHaveLength(0);
            expect(f.counts().previewRequests).toBe(0);
            await expect(f.source.retryPreview()).rejects.toThrow(
                'Cloud project access is required',
            );
            expect(f.counts().previewRequests).toBe(0);
        } finally {
            await f.source.stop();
        }
    });

    it('lets content users explicitly retry preview, preserving source after an allowance denial', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.runtime({ expiresAt: Date.now() - 1 });
            await f.source.refreshStatus();
            expect(f.counts().previewRequests).toBe(0);
            expect(f.source.state.runtimeExpired).toBe(true);
            const before = f.hydrated();
            const denied = Object.assign(new Error('Allowance required'), {
                data: 'CLOUD_PREVIEW_ALLOWANCE_REQUIRED',
            });
            f.onPreview(() => {
                throw denied;
            });
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
        } finally {
            await f.source.stop();
        }
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
                expect(record.operation.changes).toEqual(
                    changes.map((change) => ({
                        ...change,
                        content:
                            change.content instanceof Uint8Array
                                ? Uint8Array.from(change.content).buffer
                                : change.content,
                    })),
                );
                await denied.source.retryPending();
                expect(denied.submitted).toHaveLength(0);
            } finally {
                await denied.source.stop();
            }
        }
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            await f.commit('approved candidate');
            expect(f.endpoints).toEqual(['cloudEditorContentActions:commit']);
            expect(f.submitted[0]?.transport).toBe('content');
            expect(f.submitted[0]?.transportVersion).toBe(1);
            expect(f.submitted[0]?.expectedContracts).toEqual([
                { path: 'src/app/page.tsx', generation: 1 },
            ]);
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.canWrite).toBe(true);
            expect(f.counts().previewRequests).toBe(0);
        } finally {
            await f.source.stop();
        }
    });

    it('pins content transport and contract generations through a lost reply, role change and mode switch', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.save(async () => {
                throw new Error('Lost reply');
            });
            await expect(f.commit()).rejects.toThrow('Lost reply');
            const original = structuredClone(f.submitted[0]);
            expect([...f.recovery.records.values()][0]?.version).toBe(2);
            f.access({ role: 'designer', canDesign: true });
            f.generation(2);
            await f.source.refreshCapabilities();
            f.source.setContentMode(false);
            f.save(async () => ({ revision: 2, currentRevision: 2 }));
            await f.source.retryPending();
            expect(
                f.endpoints.every((endpoint) => endpoint === 'cloudEditorContentActions:commit'),
            ).toBe(true);
            expect(
                f.submitted.every(
                    (operation) => JSON.stringify(operation) === JSON.stringify(original),
                ),
            ).toBe(true);
        } finally {
            await f.source.stop();
        }
    });

    it('keeps a designer recovery on its original endpoint after switching to Build', async () => {
        const f = await fixture();
        try {
            f.save(async () => {
                throw new Error('Lost reply');
            });
            await expect(f.commit()).rejects.toThrow('Lost reply');
            f.source.setContentMode(true);
            f.save(async () => ({ revision: 2, currentRevision: 2 }));
            await f.source.retryPending();
            expect(f.endpoints.every((endpoint) => endpoint === 'cloudEditorActions:commit')).toBe(
                true,
            );
            expect(f.submitted.every((operation) => operation === f.submitted[0])).toBe(true);
        } finally {
            await f.source.stop();
        }
    });

    it('keeps the draft but stops retrying when receipt-first contract rejection resolves an unknown save', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.save(async () => {
                throw new Error('Lost reply');
            });
            await expect(f.commit()).rejects.toThrow('Lost reply');
            f.save(async () => {
                throw Object.assign(new Error('Contract replaced'), {
                    data: 'CLOUD_CONTENT_STALE_CONTRACT',
                });
            });
            await expect(f.source.retryPending()).rejects.toThrow('Contract replaced');
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.hasPendingChanges).toBe(true);
            expect(f.source.state.error).toContain('not saved');
            expect([...f.recovery.records.values()][0]?.disposition).toBe('rejected');
            expect([...f.recovery.records.values()][0]?.operation.expectedContracts).toEqual([
                { path: 'src/app/page.tsx', generation: 1 },
            ]);
        } finally {
            await f.source.stop();
        }
    });

    it('reopens a content recovery under a designer without converting it to an unrestricted save', async () => {
        const recovery = new MemoryRecoveryStore();
        const first = await fixture(undefined, {
            role: 'content',
            path: 'src/app/page.tsx',
            recovery,
        });
        first.save(async () => {
            throw new Error('Lost reply');
        });
        await expect(first.commit()).rejects.toThrow('Lost reply');
        const original = structuredClone(first.submitted[0]);
        await first.source.stop();
        const reopened = await fixture(undefined, {
            role: 'designer',
            path: 'src/app/page.tsx',
            recovery,
        });
        try {
            expect(reopened.source.isContentMode).toBe(false);
            await reopened.source.retryPending();
            expect(reopened.endpoints).toEqual(['cloudEditorContentActions:commit']);
            expect(reopened.submitted[0]).toEqual(original);
        } finally {
            await reopened.source.stop();
        }
    });

    it('freezes admission when access refresh fails or a contract is revoked, without dropping recovery', async () => {
        const f = await fixture(undefined, { role: 'content', path: 'src/app/page.tsx' });
        try {
            f.onAccess(async () => {
                throw new Error('Access unavailable');
            });
            await expect(f.source.refreshCapabilities()).rejects.toThrow('Access unavailable');
            expect(f.source.canWrite).toBe(false);
            f.onAccess(async () => {});
            await f.source.refreshCapabilities();
            f.save(async () => {
                throw new Error('Lost reply');
            });
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
        } finally {
            await f.source.stop();
        }
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
        } finally {
            await f.source.stop();
        }
    });

    it('keeps old designer journals and unknown protocols downloadable without replaying them as content', async () => {
        for (const version of [1, 2, 3]) {
            const recovery = new MemoryRecoveryStore();
            const first = await fixture(undefined, { recovery });
            first.save(async () => {
                throw new Error('Lost reply');
            });
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
            } finally {
                await reopened.source.stop();
            }
        }
    });

    it('allows a designer to replay a legacy journal only through the designer endpoint', async () => {
        const recovery = new MemoryRecoveryStore();
        const first = await fixture(undefined, { recovery });
        first.save(async () => {
            throw new Error('Lost reply');
        });
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
        } finally {
            await reopened.source.stop();
        }
    });

    it('loads the first dependency revision before admitting edits or attaching history', async () => {
        const f = await fixture(undefined, { start: false });
        try {
            f.onPreview(() => {
                expect(f.source.canWrite).toBe(false);
                f.revision(2);
            });
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
        } finally {
            await f.source.stop();
        }
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
        } finally {
            await f.source.stop();
        }
    });

    it('retries a lost acknowledgement with the identical operation and original revision', async () => {
        const f = await fixture();
        try {
            let attempts = 0;
            f.save(async () => {
                if (++attempts === 1) throw new Error('Connection lost');
                return { revision: 2, currentRevision: 2 };
            });
            await f.commit();
            expect(f.submitted).toHaveLength(2);
            expect(f.submitted[0]).toBe(f.submitted[1]);
            expect(f.submitted[0]?.expectedRevision).toBe(1);
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.state.runtime?.appliedRevision).toBe(1);
            expect(f.source.canWrite).toBe(true);
        } finally {
            await f.source.stop();
        }
    });

    it('keeps an ambiguous save recoverable and never rebases its retry onto a newer revision', async () => {
        const f = await fixture();
        try {
            f.save(async () => {
                throw new Error('Connection lost');
            });
            await expect(f.commit()).rejects.toThrow('Connection lost');
            expect(f.source.canWrite).toBe(false);
            expect(f.source.canRetrySave).toBe(true);
            expect(f.source.hasPendingChanges).toBe(true);
            await expect(f.source.reloadSavedSource()).rejects.toThrow(
                'Retry the unconfirmed save',
            );
            f.revision(3);
            await f.source.refreshStatus();
            f.save(async () => ({ revision: 2, currentRevision: 3 }));
            await f.source.retryPending();
            expect(f.submitted.every((operation) => operation === f.submitted[0])).toBe(true);
            expect(f.source.state.savedRevision).toBe(2);
            expect(f.source.hasPendingChanges).toBe(false);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.state.needsReload).toBe(true);
        } finally {
            await f.source.stop();
        }
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
            expect(f.source.pendingChangesBackup()).toMatchObject({
                transport: 'local-only',
                expectedRevision: 1,
                changes: [{ path: 'notes.txt', content: 'after' }],
            });
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            expect(f.navigations()).toBe(0);
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.source.state.savedRevision).toBe(1);
            expect(f.hydrated()).toBe(original);
            expect(f.navigations()).toBe(1);
            expect(f.source.canWrite).toBe(false);
        } finally {
            await f.source.stop();
        }
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
        } finally {
            await f.source.stop();
        }
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
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(f.counts().previewRequests).toBe(1);
            expect(f.counts().statusQueries).toBeGreaterThan(0);
            expect(f.source.canWrite).toBe(true);
            await f.source.reloadSavedSource();
            expect(f.counts().previewRequests).toBe(1);
        } finally {
            await f.source.stop();
        }
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
        } finally {
            await f.source.stop();
        }
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
            f.save(async () => {
                throw Object.assign(new Error('Forbidden'), { data: 'FORBIDDEN' });
            });
            await expect(f.source.retryPending()).rejects.toThrow('Forbidden');
            expect(f.source.canRetrySave).toBe(true);
            expect(f.submitted.every((operation) => operation === f.submitted[0])).toBe(true);
            expect(f.submitted[0]?.expectedRevision).toBe(1);
            await expect(f.source.reloadSavedSource()).rejects.toThrow('unconfirmed save');
        } finally {
            await f.source.stop();
        }
    });

    it('restores the exact unconfirmed binary operation after reopening, scoped to the same actor', async () => {
        const recovery = new MemoryRecoveryStore();
        const f = await fixture(new Uint8Array([0, 255]), { recovery });
        f.save(async () => {
            throw new Error('Acknowledgement lost');
        });
        await expect(f.commit(new Uint8Array([195, 40]))).rejects.toThrow('Acknowledgement lost');
        const original = f.submitted[0]!;
        await f.source.stop();
        expect(recovery.records.size).toBe(1);

        const other = await fixture(undefined, { actorId: 'someone-else', recovery });
        try {
            expect(other.source.hasPendingChanges).toBe(false);
            expect(other.source.canWrite).toBe(true);
        } finally {
            await other.source.stop();
        }
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
            expect(reopened.submitted[0]?.changes[0]?.content).toEqual(
                new Uint8Array([195, 40]).buffer,
            );
            expect(recovery.records.size).toBe(0);
        } finally {
            await reopened.source.stop();
        }
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
        } finally {
            await f.source.stop();
        }
    });

    it('allows explicit reload when receipt-first conflict proves an uncertain save never committed', async () => {
        const f = await fixture();
        try {
            f.save(async () => {
                throw new Error('Acknowledgement lost');
            });
            await expect(f.commit()).rejects.toThrow('Acknowledgement lost');
            f.revision(2);
            f.save(async () => {
                throw Object.assign(new Error('Conflict'), { data: 'CLOUD_CONFLICT' });
            });
            await expect(f.source.retryPending()).rejects.toThrow('Conflict');
            expect(f.source.canRetrySave).toBe(false);
            expect(f.source.hasPendingChanges).toBe(true);
            expect([...f.recovery.records.values()][0]?.disposition).toBe('rejected');
            await expect(f.source.reloadSavedSource()).rejects.toThrow('Confirm discarding');
            await f.source.reloadSavedSource({ discardRecovery: true });
            expect(f.navigations()).toBe(1);
            expect(f.source.canWrite).toBe(false);
            expect(f.recovery.records.size).toBe(0);
        } finally {
            await f.source.stop();
        }
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
        } finally {
            await f.source.stop();
        }
    });

    it('does not erase another open tab’s recovery during a reload or send a competing unsaved operation', async () => {
        const recovery = new MemoryRecoveryStore();
        const first = await fixture(undefined, { recovery });
        const second = await fixture(undefined, { recovery });
        try {
            first.save(async () => {
                throw new Error('Acknowledgement lost');
            });
            await expect(first.commit()).rejects.toThrow('Acknowledgement lost');
            const original = [...recovery.records.values()][0]!;
            await expect(second.commit('another edit')).rejects.toThrow('Browser recovery storage');
            expect(second.submitted).toHaveLength(0);
            expect([...recovery.records.values()][0]).toEqual(original);
        } finally {
            await first.source.stop();
            await second.source.stop();
        }
    });

    it('keeps rejected backups across reopen and refuses to replay recovery older than receipts', async () => {
        const recovery = new MemoryRecoveryStore();
        const f = await fixture(undefined, { recovery });
        f.save(async () => {
            throw Object.assign(new Error('Conflict'), { data: 'CLOUD_CONFLICT' });
        });
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
        } finally {
            await reopened.source.stop();
        }
    });
});

async function rejectedTextFixture() {
    const f = await fixture(undefined, { role: 'content' });
    f.save(async () => {
        throw { data: 'CLOUD_CONTENT_UNAPPROVED_CHANGE' };
    });
    await expect(f.commit('Rejected candidate')).rejects.toBeDefined();
    f.localWork(true);
    f.editingText('Rejected heading');
    let acquired = 0;
    let released = 0;
    let valid = true;
    f.onNavigation(() => {
        acquired++;
        return {
            assertCurrent: () => {
                if (!valid) throw new Error('Text owner changed');
            },
            release: () => {
                released++;
            },
        };
    });
    return {
        ...f,
        leases: () => ({ acquired, released }),
        invalidate: () => {
            valid = false;
        },
    };
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
            const event = {
                preventDefault: () => {
                    warnings++;
                },
                returnValue: '',
            } as unknown as BeforeUnloadEvent;
            source.beforeUnload(event);
            expect(warnings).toBe(0);
            source.beforeUnload(event);
            expect(warnings).toBe(1);
        } finally {
            await f.source.stop();
        }
        expect(f.leases()).toEqual({ acquired: 1, released: 1 });
    });

    it('keeps recovery when removal fails and restores it after a known reload failure', async () => {
        const f = await rejectedTextFixture();
        try {
            const record = structuredClone([...f.recovery.records.values()][0]);
            f.recovery.failRemove = true;
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow(
                'cleanup unavailable',
            );
            expect([...f.recovery.records.values()][0]).toEqual(record);
            expect(f.navigations()).toBe(0);
            expect(f.leases()).toEqual({ acquired: 1, released: 1 });
            f.recovery.failRemove = false;
            f.onReload(() => {
                throw new Error('Navigation denied');
            });
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow(
                'Navigation denied',
            );
            expect([...f.recovery.records.values()][0]).toEqual(record);
            expect(f.source.state.discardReloadRequested).toBe(false);
            expect(f.source.state.discardReloadFailed).toBe(true);
            expect(f.source.pendingChangesBackup().editingText).toBe('Rejected heading');
            expect(f.leases()).toEqual({ acquired: 2, released: 2 });
            expect(f.submitted).toHaveLength(1);
        } finally {
            await f.source.stop();
        }
    });

    it('refuses unrelated drafts and an owner change during journal removal', async () => {
        const f = await rejectedTextFixture();
        try {
            const unregister = f.source.registerLocalWork(() => true);
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow(
                'Other unsaved',
            );
            expect(f.leases().acquired).toBe(0);
            unregister();
            const record = structuredClone([...f.recovery.records.values()][0]);
            const remove = f.recovery.remove.bind(f.recovery);
            f.recovery.remove = async (key, operationId) => {
                await remove(key, operationId);
                f.invalidate();
            };
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow(
                'Text owner changed',
            );
            expect([...f.recovery.records.values()][0]).toEqual(record);
            expect(f.navigations()).toBe(0);
            expect(f.leases()).toEqual({ acquired: 1, released: 1 });
            expect(f.source.pendingChangesBackup().editingText).toBe('Rejected heading');
        } finally {
            await f.source.stop();
        }
    });

    it('does not remove a newer operation that acquired the journal', async () => {
        const f = await rejectedTextFixture();
        try {
            const key = { ...f.source.scope, actorId: 'actor' };
            const record = (await f.recovery.load(key))!;
            const newer = {
                ...record,
                operation: { ...record.operation, operationId: 'newer-operation-owner' },
            };
            const remove = f.recovery.remove.bind(f.recovery);
            f.recovery.remove = async (scope, operationId) => {
                await remove(scope, operationId);
                await f.recovery.save(scope, newer);
                // Simulate ownership changing after the load but before CAS removal.
                await remove(scope, operationId);
            };
            await expect(f.source.reloadSavedSource({ discardRecovery: true })).rejects.toThrow(
                'Another pending',
            );
            expect((await f.recovery.load(key))?.operation.operationId).toBe(
                'newer-operation-owner',
            );
            expect(f.navigations()).toBe(0);
            expect(f.leases()).toEqual({ acquired: 1, released: 1 });
            expect(f.source.pendingChangesBackup().editingText).toBe('Rejected heading');
        } finally {
            await f.source.stop();
        }
    });
});

describe('cloud semantic operation recovery', () => {
    const request = {
        transport: 'studio' as const,
        actorId: 'actor' as CloudEditorSnapshot['actorId'],
        expectedRevision: 1,
        expectedGeneration: 1,
        operation: { kind: 'createPage' as const, slug: 'contact' },
    };
    it('journals before semantic send and makes the old canvas read-only until explicit reload', async () => {
        const f = await fixture(undefined, { role: 'content' });
        f.save(async () => {
            expect([...f.recovery.records.values()][0]?.operation.transport).toBe('studio');
            expect([...f.recovery.records.values()][0]?.operation.operation).toEqual(
                request.operation,
            );
            expect(f.source.canWrite).toBe(false);
            return { revision: 2, currentRevision: 2 };
        });
        const original = f.hydrated();
        await f.source.commitSemantic(request);
        expect(f.endpoints).toEqual(['cloudEditorStudioActions:commit']);
        expect(f.source.state.needsReload).toBe(true);
        expect(f.hydrated()).toBe(original);
        expect(f.recovery.records.size).toBe(0);
        await f.source.reloadSavedSource();
        expect(f.navigations()).toBe(1);
        f.source.stop();
    });
    it('refuses semantic edits over a local draft or a stale actor/revision', async () => {
        const f = await fixture();
        f.localWork(true);
        await expect(f.source.commitSemantic(request)).rejects.toThrow();
        f.localWork(false);
        await expect(
            f.source.commitSemantic({ ...request, expectedRevision: 0 }),
        ).rejects.toThrow();
        await expect(
            f.source.commitSemantic({
                ...request,
                actorId: 'other' as CloudEditorSnapshot['actorId'],
            }),
        ).rejects.toThrow();
        expect(f.submitted).toHaveLength(0);
        f.source.stop();
    });
    it('resolves a lost-response duplicate refusal but preserves an unknown save after revocation', async () => {
        for (const code of ['CLOUD_STUDIO_ROUTE_OCCUPIED', 'CLOUD_STUDIO_UNAVAILABLE']) {
            const f = await fixture();
            let attempt = 0;
            f.save(async () => {
                if (attempt++ === 0) throw new Error('Connection lost');
                throw Object.assign(new Error(code), { data: code });
            });
            await expect(f.source.commitSemantic(request)).rejects.toThrow(code);
            const record = [...f.recovery.records.values()][0]!;
            expect(record.disposition).toBe(
                code === 'CLOUD_STUDIO_ROUTE_OCCUPIED' ? 'rejected' : 'pending',
            );
            expect(record.definitiveRejection).toBe(code === 'CLOUD_STUDIO_ROUTE_OCCUPIED');
            f.source.stop();
        }
    });
    it('keeps original semantic payload and operation ID across lost responses and retry', async () => {
        const f = await fixture();
        f.save(async () => {
            throw new Error('Connection lost');
        });
        await expect(f.source.commitSemantic(request)).rejects.toThrow();
        const operation = structuredClone([...f.recovery.records.values()][0]!.operation);
        expect(f.source.pendingChangesBackup().semanticOperation).toEqual(request.operation);
        f.save(async (args) => {
            expect(args.operationId).toBe(operation.operationId);
            return { revision: 2, currentRevision: 2 };
        });
        await f.source.retryPending();
        expect(f.recovery.records.size).toBe(0);
        expect(f.source.state.needsReload).toBe(true);
        f.source.stop();
    });
});


describe('private imported source hydration lifetime', () => {
    it('aborts private media loading on account change before source disposal', async () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const f = await fixture(bytes, { profile: 'imported-next-v1', role: 'designer', start: false });
        const entered = Promise.withResolvers<void>();
        const response = Promise.withResolvers<Response>();
        let signal: AbortSignal | null | undefined;
        const implementation = Object.assign(async (...[_input, init]: Parameters<typeof globalThis.fetch>) => {
            signal = init?.signal; entered.resolve(); return response.promise;
        }, { preconnect: globalThis.fetch.preconnect });
        const fetch = spyOn(globalThis, 'fetch').mockImplementation(implementation);
        try {
            const starting = f.source.start();
            // Bun's promise matcher can wait immediately. Capture settlement here
            // and assert only after the test has released the blocked fetch.
            const settled = starting.then(() => null, (error: unknown) => error);
            await Promise.race([entered.promise, settled.then(error => {
                throw error ?? new Error('Source finished before requesting private media');
            })]);
            f.changeAccount(); // No explicit source.stop or owner disposal has run.
            expect(signal?.aborted).toBe(true);
            response.resolve(new Response(bytes));
            expect(await settled).toBeInstanceOf(Error);
            expect(f.hydrated()).toEqual([]);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.state.runtime).toBeNull();
            expect(f.submitted).toEqual([]);
        } finally { fetch.mockRestore(); await f.source.stop(); }
    });

    it('rejects a changed actor, design epoch or revision after media decoding and before installation', async () => {
        for (const changed of ['actor', 'epoch', 'preparation', 'profile', 'revision', 'revoked'] as const) {
            const f = await fixture(undefined, { profile: 'imported-next-v1', role: 'designer', start: false });
                f.onStatus(async () => {
                if (changed === 'actor') f.runtime({ actorId: 'other' as CloudEditorSnapshot['actorId'] });
                if (changed === 'epoch') f.runtime({ importedAuthority: { preparationId: 'preparation' as CloudEditorImportPreparationResult['preparationId'], designRevision: 2 } });
                if (changed === 'preparation') f.runtime({ importedAuthority: { preparationId: 'other-preparation' as CloudEditorImportPreparationResult['preparationId'], designRevision: 1 } });
                if (changed === 'profile') f.runtime({ profile: 'imported-source-v1' });
                if (changed === 'revision') f.runtime({ revision: 2 });
                if (changed === 'revoked') throw new Error('CLOUD_ROLE_REQUIRED');
            });
            try {
                await expect(f.source.start()).rejects.toThrow();
                expect(f.hydrated()).toEqual([]);
                expect(f.submitted).toEqual([]);
                expect(f.counts().previewRequests).toBe(0);
            } finally { await f.source.stop(); }
        }
    });
    it('loads private imported media without a storage ID or legacy asset endpoint', async () => {
        const bytes = new Uint8Array([4, 5, 6]);
        const f = await fixture(bytes, { profile: 'imported-source-v1', start: false });
        const calls: Array<{ input: string; init?: RequestInit }> = [];
        const implementation = Object.assign(async (...[input, init]: Parameters<typeof globalThis.fetch>) => {
            calls.push({ input: String(input), init });
            return new Response(bytes);
        }, { preconnect: globalThis.fetch.preconnect });
        const fetch = spyOn(globalThis, 'fetch').mockImplementation(implementation);
        try {
            await f.source.start();
            expect(calls).toHaveLength(1);
            expect(calls[0]!.input).toStartWith('/api/cloud-imports/asset?');
            expect(calls[0]!.init).toMatchObject({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
            expect(f.hydrated()[0]?.content).toEqual(bytes);
            expect(f.counts().previewRequests).toBe(0);
            expect(f.source.canWrite).toBe(false);
            expect(f.source.canPreview).toBe(false);
            await expect(f.commit()).rejects.toThrow();
            expect(f.submitted).toEqual([]);
        } finally { fetch.mockRestore(); await f.source.stop(); }
    });

    it('never installs a prepared result after the initiating account is replaced', async () => {
        const f = await fixture(undefined, { profile: 'imported-source-v1' });
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        f.onPrepare(async () => { entered.resolve(); await release.promise; return f.completePreparation(); });
        try {
            const before = f.hydrated();
            const preparing = f.source.prepareImportedSource();
            const settled = preparing.then(() => null, (error: unknown) => error);
            await entered.promise;
            f.changeAccount();
            release.resolve();
            expect(await settled).toBeInstanceOf(Error);
            expect(f.hydrated()).toBe(before);
            expect(f.source.state.access).toBeNull();
            expect(f.source.state.runtime).toBeNull();
            expect(f.counts().previewRequests).toBe(0);
        } finally { release.resolve(); await f.source.stop(); }
    });
});

describe("imported text transport prerequisites", () => {
    it('pins imported text writes even while the designer view remains active', async () => {
        const path = 'src/components/hero.tsx';
        const f = await fixture(undefined, { profile: 'imported-next-v1', path, start: false });
        f.access({ canEditImportedText: true, canEditContent: true, canApproveImportedText: true });
        try {
            await f.source.start();
            expect(f.source.state.contracts).toBeNull();
            const pin = f.source.resolveTextApproval(path, 'heading')!;
            expect(pin).toMatchObject({ version: 2, bindingId: 'heading-binding', generation: 1, designRevision: 1 });
            expect(f.source.isContentMode).toBe(false);
            f.save(async () => { f.revision(2); return { revision: 2, currentRevision: 2 }; });
            expect(await f.source.withApprovedTextWrite({ pin, revision: 1, candidate: 'after' }, async () => {
                await f.commit(); return true;
            })).toBe(true);
            expect(f.endpoints).toEqual(['cloudEditorTextActions:commit']);
            expect(f.submitted[0]).toMatchObject({ actorId: 'actor', transportVersion: 2,
                expectedContracts: [{ path, version: 2, generation: 1, designRevision: 1 }] });
            expect(f.source.isTextApprovalCurrent(pin)).toBe(true);
        } finally { await f.source.stop(); }
    });

    it('refuses stale imported text pins and exact-candidate substitution without a fallback save', async () => {
        const path = 'src/components/hero.tsx';
        const f = await fixture(undefined, { profile: 'imported-next-v1', path, start: false });
        f.access({ canEditImportedText: true, canEditContent: true });
        try {
            await f.source.start();
            const pin = f.source.resolveTextApproval(path, 'heading')!;
            for (const changed of [{ ...pin, actorId: 'other' }, { ...pin, generation: 2 },
                { ...pin, designRevision: 2 }, { ...pin, bindingId: 'recreated' },
                { ...pin, target: { ...pin.target, exportName: 'Other' } }]) {
                let called = false;
                expect(await f.source.withApprovedTextWrite({ pin: changed, revision: 1, candidate: 'after' }, async () => { called = true; return true; })).toBe(false);
                expect(called).toBe(false);
            }
            await expect(f.source.withApprovedTextWrite({ pin, revision: 1, candidate: 'exact' }, async () => {
                await f.commit('different'); return true;
            })).rejects.toThrow('approved text changed');
            expect(f.submitted).toEqual([]);
        } finally { await f.source.stop(); }
    });

    it('keeps designer source usable if optional v2 approval discovery is disabled', async () => {
        const f = await fixture(undefined, { profile: 'imported-next-v1', start: false });
        f.access({ canApproveImportedText: true });
        f.onTextContracts(async () => { throw Object.assign(new Error('Disabled'), { data: 'CLOUD_DISABLED' }); });
        try {
            await f.source.start();
            expect(f.source.canDesign).toBe(true);
            expect(f.source.canWrite).toBe(true);
            expect(f.source.state.textContracts).toBeNull();
            expect(f.source.resolveTextApproval('notes.txt', 'heading')).toBeNull();
        } finally { await f.source.stop(); }
    });

    it('retries imported v2 recovery through only its original text endpoint and epoch', async () => {
        const recovery = new MemoryRecoveryStore();
        const first = await fixture(undefined, { recovery });
        first.save(async () => { throw new Error('Lost reply'); });
        await expect(first.commit()).rejects.toThrow('Lost reply');
        await first.source.stop();
        const record = [...recovery.records.values()][0]!;
        record.operation.transport = 'content';
        record.operation.transportVersion = 2;
        record.operation.expectedContracts = [{ path: 'notes.txt', generation: 4, version: 2, designRevision: 1 }];
        const original = structuredClone(record.operation);
        const reopened = await fixture(undefined, { recovery, profile: 'imported-next-v1', role: 'content', start: false });
        // Model future capability activation, without opening production access.
        reopened.access({ canEditImportedText: true, canEditContent: true });
        try {
            await reopened.source.start();
            reopened.revision(3);
            await reopened.source.retryPending();
            expect(reopened.endpoints).toEqual(['cloudEditorTextActions:commit']);
            expect(reopened.submitted[0]).toEqual(original);
            expect(recovery.records.size).toBe(0);
        } finally { await reopened.source.stop(); }
    });


});

it('resolves FAQ grants by full renderer/item identity and never infers an unmapped data row', async () => {
    const path = 'src/content/home-faq.ts';
    const f = await fixture(undefined, { profile: 'imported-next-v1', path, start: false });
    f.access({ canEditImportedText: true, canEditContent: true });
    const mapping = { version: 1 as const, kind: 'keyed-prop-map' as const, mappingId: 'faq',
        callsite: { path: 'src/components/home-faq.tsx', exportName: 'HomeFaq', oid: 'call' },
        renderer: { path: 'src/components/chat-faq.tsx', exportName: 'ChatFaq', oid: 'answer' } };
    const bindings = ['audience', 'pricing'].map(itemId => ({ bindingId: itemId,
        target: { kind: 'data-leaf' as const, exportName: 'homeFaqItems', itemId, property: 'answer' }, renderMapping: mapping }));
    f.textContracts({ contracts: [{ path, version: 2, generation: 1, active: true, current: true,
        designRevision: 1, fingerprint: 'approved', bindings }] });
    try {
        await f.source.start();
        const pin = f.source.resolveTextApproval(mapping.renderer.path, 'answer', { mappingId: 'faq', itemId: 'audience' });
        expect(pin?.path).toBe(path);
        expect(pin?.target).toMatchObject({ itemId: 'audience', property: 'answer' });
        expect(f.source.resolveTextApproval(mapping.renderer.path, 'answer')).toBeNull();
        expect(f.source.resolveTextApproval(path, 'answer', { mappingId: 'faq', itemId: 'audience' })).toBeNull();
        expect(f.source.resolveTextApproval(mapping.renderer.path, 'answer', { mappingId: 'other', itemId: 'audience' })).toBeNull();
        expect(validCloudTextApproval({ ...pin, renderMapping: undefined })).toBe(false);
        expect(validCloudTextApproval({ ...pin, renderMapping: { ...mapping, extra: true } })).toBe(false);
        expect(validCloudTextApproval({ ...pin, renderMapping: { ...mapping, mappingId: 'faq\n' } })).toBe(false);
        expect(validCloudTextApproval({ ...pin, renderMapping: { ...mapping,
            renderer: { ...mapping.renderer, oid: 'answer\n' } } })).toBe(false);
        expect(validCloudTextApproval({ ...pin, target: { ...pin!.target, exportName: 'homeFaqItems\n' } })).toBe(false);
        expect(f.source.isTextApprovalCurrent({ ...pin, renderMapping: { ...mapping,
            callsite: { ...mapping.callsite, oid: 'different' } } })).toBe(false);
        expect(Object.isFrozen(pin?.renderMapping?.renderer)).toBe(true);
    } finally { await f.source.stop(); }
});



it('does not restore text authority after the owning session is lost during approval discovery', async () => {
    const f = await fixture(undefined, { profile: 'imported-next-v1', start: false });
    f.access({ canEditImportedText: true });
    f.onTextContracts(async () => { f.revokeOwner(); });
    try {
        await expect(f.source.start()).rejects.toThrow();
        expect(f.source.canWrite).toBe(false);
        expect(f.source.resolveTextApproval('notes.txt', 'heading')).toBeNull();
        expect(f.submitted).toEqual([]);
    } finally { await f.source.stop(); }
});

it('keeps imported starter-v1 recovery download-only after a text grant is activated', async () => {
    const recovery = new MemoryRecoveryStore();
    const first = await fixture(undefined, { recovery, role: 'content' });
    first.save(async () => { throw new Error('Lost reply'); });
    await expect(first.commit()).rejects.toThrow('Lost reply');
    await first.source.stop();
    const original = structuredClone([...recovery.records.values()][0]!.operation);
    const next = await fixture(undefined, { recovery, role: 'content', profile: 'imported-next-v1', start: false });
    next.access({ canEditImportedText: true });
    try {
        await next.source.start();
        expect(next.source.canRetrySave).toBe(false);
        await expect(next.source.retryPending()).rejects.toThrow('original project permission');
        expect(next.submitted).toEqual([]);
        expect([...recovery.records.values()][0]!.operation).toEqual(original);
        expect(next.source.pendingChangesBackup().changes[0]?.content).toBe('after');
    } finally { await next.source.stop(); }
});


it('keeps gated image snapshots writable after an approved text save advances source CAS', async () => {
    const path = 'src/components/hero.tsx';
    const f = await fixture(undefined, { profile: 'imported-next-v1', path, start: false });
    f.access({ canEditImportedText: true, canEditImportedImages: true, canEditContent: true });
    try {
        await f.source.start();
        f.source.setContentMode(true);
        expect(f.source.canWrite).toBe(true);
        const pin = f.source.resolveTextApproval(path, 'heading')!;
        f.save(async () => { f.revision(2); return { revision: 2, currentRevision: 2 }; });
        expect(await f.source.withApprovedTextWrite({ pin, revision: 1, candidate: 'after' }, async () => {
            await f.commit(); return true;
        })).toBe(true);
        expect(f.source.state.imageContracts?.revision).toBe(2);
        expect(f.source.canWrite).toBe(true);
    } finally { await f.source.stop(); }
});
