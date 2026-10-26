import { describe, expect, it } from 'bun:test';
import { getDocumentSize, type Value } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { begin, continueRemoval, inspect } from '../cloudReleaseRemoval';
import { retainedVersions, restoreCopy } from '../cloudBackups';
import { _input, _seal } from '../cloudReleases';

type Row = Record<string, unknown> & { _id: string };
const releaseId = 'cloudReleases:one' as Id<'cloudReleases'>;
const actorId = 'users:agency' as Id<'users'>;
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
const projectId = 'projects:one' as Id<'projects'>, branchId = 'branches:one' as Id<'branches'>;
const operationKey = 'remove_version_operation_001';
const args = { releaseId, expectedActorId: actorId, expectedHash: 'a'.repeat(64), expectedStatus: 'frozen' as const, expectedRevision: 2, operationKey };

// Registered handlers with simulated IO and measured document sizes. Native
// rollback/concurrency and transaction counters remain a separate acceptance step.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
    const put = (name: string, id: string, values: Record<string, unknown>) => { const row = { _creationTime: 1, ...values, _id: id }; table(name).set(id, row); return row; };
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    const metric = () => ({ used: 0, remaining: 16_777_216 });
    const metrics = { bytesRead: metric(), bytesWritten: metric(), documentsRead: metric(), documentsWritten: metric(), databaseQueries: metric() };
    const size = (row: Row) => getDocumentSize(row as Record<string, Value>);
    const read = (rows: Row[]) => { metrics.databaseQueries.used++; metrics.documentsRead.used += rows.length; metrics.bytesRead.used += rows.reduce((sum, row) => sum + size(row), 0); return structuredClone(rows); };
    const reset = () => { for (const m of Object.values(metrics)) m.used = 0; };
    const effects: string[] = [], indexes: string[] = [];
    const pagination: unknown[] = [];
    let subject = 'agency', pageStatus: string | undefined;
    put('users', actorId, { clerkUserId: 'agency' });
    put('users', 'users:colleague', { clerkUserId: 'colleague' });
    put('workspaces', workspaceId, { createdByUserId: actorId });
    put('workspaceMembers', 'workspaceMembers:agency', { workspaceId, userId: actorId, role: 'admin' });
    put('workspaceMembers', 'workspaceMembers:colleague', { workspaceId, userId: 'users:colleague', role: 'admin' });
    put('cloudReleases', releaseId, { projectId, branchId, workspaceId, actorId, operationKey: 'capture_version_operation_001', purpose: 'backup',
        status: 'frozen', hash: args.expectedHash, revision: 2, createdAt: 1, studioInputJson: 'null', previousArtifactJson: 'null', artifactJson: 'payload', sourceHash: 'b'.repeat(64) });
    const ctx = { auth: { getUserIdentity: async () => ({ subject, tokenIdentifier: `issuer|${subject}` }) },
        meta: { getTransactionMetrics: async () => metrics },
        db: { get: async (id: string) => read(get(id) ? [get(id)!] : [])[0] ?? null,
            patch: async (id: string, values: Record<string, unknown>) => { const row = get(id)!; for (const [key, value] of Object.entries(values)) { if (value === undefined) delete row[key]; else row[key] = value; } effects.push(`patch:${id}`); metrics.documentsWritten.used++; metrics.bytesWritten.used += size(row); },
            delete: async (id: string) => { const row = get(id)!; metrics.bytesWritten.used += size(row); metrics.documentsWritten.used++; table(id.split(':')[0]!).delete(id); effects.push(`delete:${id}`); },
            query: (name: string) => {
                const filters: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { filters.push([key, value]); return index; } };
                const field = (row: Row, key: string): unknown => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, row);
                const rows = () => [...table(name).values()].filter(row => filters.every(([key, value]) => field(row, key) === value));
                const query = { withIndex: (key: string, build: (q: typeof index) => unknown) => { indexes.push(key); build(index); return query; }, order: () => query,
                    collect: async () => read(rows()), take: async (n: number) => read(rows().slice(0, n)), first: async () => read(rows().slice(0, 1))[0] ?? null,
                    unique: async () => { const found = read(rows()); if (found.length > 1) throw new Error('Nonunique'); return found[0] ?? null; },
                    paginate: async (opts: { cursor: string | null; numItems: number }) => { pagination.push(opts); const start = Number(opts.cursor ?? 0), all = rows(); const page = read(all.slice(start, start + opts.numItems)); return { page, isDone: start + page.length >= all.length, continueCursor: String(start + page.length), pageStatus }; },
                }; return query;
            },
        }, storage: { delete: async () => { throw new Error('Storage deletion forbidden'); } }, scheduler: { runAfter: async () => { throw new Error('Scheduling forbidden'); } },
    } as unknown as MutationCtx;
    const inspectOne = async () => { reset(); return inspect._handler(ctx, { releaseId, expectedActorId: `users:${subject}` as Id<'users'> }); };
    const start = async () => { reset(); return begin._handler(ctx, args); };
    const next = async () => { reset(); return continueRemoval._handler(ctx, { releaseId, operationKey, initiatorActorId: actorId, expectedExecutorActorId: `users:${subject}` as Id<'users'> }); };
    const discover = async (cursor: string | null = null) => { reset(); return retainedVersions._handler(ctx, { workspaceId, expectedActorId: `users:${subject}` as Id<'users'>, cursor }); };
    return { ctx, get, put, table, metrics, reset, effects, indexes, pagination, inspectOne, start, next, discover,
        signIn: (name: string) => { subject = name; }, split: () => { pageStatus = 'SplitRequired'; } };
}

describe('explicit saved version removal', () => {
    it('retains creation identity, deletes at most 32 children and preserves shared media and restored copies', async () => {
        const f = fixture();
        for (let i = 0; i < 1600; i++) f.put('cloudReleaseFiles', `cloudReleaseFiles:${i}`, { releaseId, stage: ['source', 'original', 'deploy', 'baseline'][i % 4], path: `file-${i}`, kind: 'file', text: 'x', hash: 'h', bytes: 1 });
        f.put('cloudReleaseAssets', 'cloudReleaseAssets:own', { releaseId, storageId: '_storage:shared' });
        f.put('cloudReleaseAssets', 'cloudReleaseAssets:peer', { releaseId: 'cloudReleases:peer', storageId: '_storage:shared' });
        f.put('cloudBackupRestores', 'cloudBackupRestores:receipt', { backupId: releaseId, projectId: 'projects:restored' });
        f.put('cloudEditorFiles', 'cloudEditorFiles:source', { text: 'current source', storageId: '_storage:shared' });
        f.put('cloudReleaseReviews', 'cloudReleaseReviews:one', { releaseId, actorId });
        f.put('cloudReleaseReviewTickets', 'cloudReleaseReviewTickets:one', { releaseId, actorId });
        const started = await f.start();
        expect((await f.start()).progress).toEqual(started.progress);
        let result = started;
        for (let i = 0; result.progress.phase !== 'done' && i < 100; i++) {
            const before = f.effects.length; result = await f.next();
            expect(f.effects.slice(before).filter(effect => effect.startsWith('delete:')).length).toBeLessThanOrEqual(32);
            if (f.table('cloudReleaseFiles').size > 0) expect(f.get('cloudReleaseAssets:own')).not.toBeNull();
        }
        expect(result.progress.phase).toBe('done');
        expect((await f.next()).progress).toEqual(result.progress);
        expect(f.get(releaseId)).toMatchObject({ hash: args.expectedHash, operationKey: 'capture_version_operation_001', studioInputJson: 'null', previousArtifactJson: 'null' });
        expect(f.get(releaseId)?.artifactJson).toBeUndefined();
        expect(f.get('cloudReleaseAssets:peer')).not.toBeNull();
        expect(f.get('cloudBackupRestores:receipt')).not.toBeNull();
        expect(f.get('cloudEditorFiles:source')?.text).toBe('current source');
        expect((await f.discover()).page).toEqual([]);
    });
    it('rechecks the captured executor actor before continuing a removal', async () => {
        const f = fixture(); await f.start(); const before = f.effects.length;
        f.reset();
        await expect(continueRemoval._handler(f.ctx, { releaseId, operationKey, initiatorActorId: actorId,
            expectedExecutorActorId: 'users:colleague' as Id<'users'> })).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        expect(f.effects).toHaveLength(before);
    });
    it('returns only the exact existing restored copy after payload removal', async () => {
        const f = fixture(); await f.start();
        for (let i = 0; i < 5 && f.get(releaseId)?.removedAt === undefined; i++) await f.next();
        expect(f.get(releaseId)?.removedAt).toBeDefined();
        const restoreKey = 'restore_version_operation_001';
        f.put('projects', 'projects:restored', { workspaceId });
        f.put('branches', 'branches:restored', { projectId: 'projects:restored' });
        f.put('cloudBackupRestores', 'cloudBackupRestores:exact', { backupId: releaseId, actorId, operationKey: restoreKey,
            projectId: 'projects:restored', branchId: 'branches:restored' });
        f.reset(); const before = f.effects.length;
        expect(await restoreCopy._handler(f.ctx, { backupId: releaseId, operationKey: restoreKey,
            expectedActorId: actorId, name: 'Existing copy' })).toEqual({ projectId: 'projects:restored', branchId: 'branches:restored' });
        f.reset();
        await expect(restoreCopy._handler(f.ctx, { backupId: releaseId, operationKey: 'new_restore_operation_001',
            expectedActorId: actorId, name: 'No new copy' })).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        expect(f.effects).toHaveLength(before);
    });
    it('lets a current agency colleague resume without rewriting the initiator or accepting another operation', async () => {
        const f = fixture(); await f.start(); f.signIn('colleague');
        expect((await f.next()).progress.initiatorActorId).toBe(actorId);
        f.reset();
        await expect(continueRemoval._handler(f.ctx, { releaseId, operationKey: 'other_operation_001', initiatorActorId: actorId, expectedExecutorActorId: 'users:colleague' as Id<'users'> })).rejects.toThrow('CLOUD_RELEASE_REMOVAL_CHANGED');
        f.table('workspaceMembers').delete('workspaceMembers:colleague');
        await expect(f.next()).rejects.toThrow('FORBIDDEN');
    });

    it('requires current agency role even for a workspace manager with an existing source', async () => {
        const f = fixture();
        f.put('projects', projectId, { workspaceId, accessMode: 'restricted' });
        f.put('branches', branchId, { projectId });
        f.put('cloudEditorStates', 'cloudEditorStates:one', { projectId, branchId, workspaceId, createdByUserId: actorId });
        f.put('cloudEditorGrants', 'cloudEditorGrants:one', { projectId, userId: actorId, role: 'content' });
        await expect(f.start()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        expect(f.effects).toEqual([]);
        f.get('cloudEditorGrants:one')!.role = 'designer'; await f.start();
        f.get('cloudEditorGrants:one')!.role = 'content';
        await expect(f.next()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
    });
    it('budgets five large legacy payload rows and refuses a complete page on expensive authorization', async () => {
        const f = fixture();
        f.get(releaseId)!.artifactJson = 'x'.repeat(950_000);
        for (let i = 0; i < 4; i++) f.put('cloudReleases', `cloudReleases:large${i}`, { ...f.get(releaseId) });
        expect((await f.discover()).page).toHaveLength(5);
        expect(f.metrics.bytesRead.used).toBeLessThan(12_000_000);
        expect(f.metrics.databaseQueries.used).toBeLessThan(512);
        f.get('workspaces:one')!.description = 'x'.repeat(950_000);
        await expect(f.discover()).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
    });
    it('refuses stale confirmation and actor replacement before writing any marker', async () => {
        const f = fixture(); f.get(releaseId)!.hash = 'c'.repeat(64);
        await expect(f.start()).rejects.toThrow('CLOUD_RELEASE_REMOVAL_CHANGED');
        expect(f.effects).toEqual([]); f.signIn('colleague');
        await expect(f.start()).rejects.toThrow('CLOUD_ACTOR_CHANGED'); expect(f.effects).toEqual([]);
    });
    for (const stage of ['queued', 'sending', 'observing', 'unknown']) {
        it(`blocks any ${stage} operation baseline, even outside the latest branch history`, async () => {
            const f = fixture(); f.put('cloudReleaseOperations', 'cloudReleaseOperations:old', { stage, branchId: 'branches:other', releaseId: 'cloudReleases:other', expectedLiveReleaseId: releaseId });
            expect((await f.inspectOne()).result).toMatchObject({ state: 'blocked', reason: 'release-operation-pending' });
            await expect(f.start()).rejects.toThrow('CLOUD_RELEASE_REMOVAL_BLOCKED'); expect(f.effects).toEqual([]);
        });
    }
    it('rechecks live and branch locks during every continuation', async () => {
        const f = fixture(); await f.start(); f.put('cloudReleaseDestinations', 'cloudReleaseDestinations:one', { branchId, liveReleaseId: releaseId });
        await expect(f.next()).rejects.toThrow('CLOUD_RELEASE_REMOVAL_BLOCKED');
        delete f.get('cloudReleaseDestinations:one')!.liveReleaseId; f.get('cloudReleaseDestinations:one')!.lockOperationId = 'cloudReleaseOperations:lock';
        await expect(f.next()).rejects.toThrow('CLOUD_RELEASE_REMOVAL_BLOCKED');
    });
    it('does not treat copied historical baselines as dependencies but protects either hosting parent pin', async () => {
        const f = fixture(); f.put('cloudReleases', 'cloudReleases:child', { ...f.get(releaseId), baselineReleaseId: releaseId });
        expect((await f.inspectOne()).result.state).toBe('available');
        for (const marker of ['importedHosting', 'importedHostingRequest']) {
            f.get('cloudReleases:child')![marker] = { artifactId: releaseId };
            expect((await f.inspectOne()).result).toMatchObject({ state: 'blocked', reason: 'required-by-version' });
            delete f.get('cloudReleases:child')![marker];
        }
    });
    it('keeps unfinished versions in active pages, rejects partial markers and fences late payload preparation', async () => {
        const f = fixture(); await f.start();
        expect((await f.discover()).page[0]).toMatchObject({ canManageVersions: true, canRestore: false, removal: { phase: 'files' } });
        await expect(_input._handler(f.ctx, { releaseId })).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        await expect(_seal._handler(f.ctx, { releaseId, sourceHash: 'b'.repeat(64), hash: args.expectedHash, artifactJson: '{}', files: [] })).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        const malformed = fixture(); malformed.get(releaseId)!.importedHosting = { artifactId: releaseId };
        expect((await malformed.inspectOne()).result).toMatchObject({ state: 'blocked', reason: 'version-unavailable' });
    });
    it('uses one fixed five-row native page and preserves empty filtered page cursors', async () => {
        const f = fixture();
        for (let i = 0; i < 6; i++) f.put('cloudReleases', `cloudReleases:extra${i}`, { ...f.get(releaseId) });
        const first = await f.discover(); expect(first.page).toHaveLength(5); expect(first.isDone).toBe(false);
        expect(f.pagination).toEqual([{ cursor: null, numItems: 5, maximumRowsRead: 10, maximumBytesRead: 6_000_000 }]);
        expect((await f.discover(first.continueCursor)).page).toHaveLength(2);
        f.get('workspaceMembers:agency')!.role = 'member';
        const filtered = await f.discover(); expect(filtered.page).toEqual([]); expect(filtered.isDone).toBe(false); expect(filtered.continueCursor).toBe('5');
    });
    it('refuses split-required pages and native budget exhaustion without partial output or writes', async () => {
        const f = fixture(); f.split(); await expect(f.discover()).rejects.toThrow('CLOUD_RELEASE_REMOVAL_BUDGET');
        f.metrics.bytesRead.used = 11_500_000;
        await expect(begin._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE'); expect(f.effects).toEqual([]);
    });
});
