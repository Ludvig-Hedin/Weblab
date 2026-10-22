import { describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { list, manifest, restoreCopy } from '../cloudBackups';
import { file as downloadFile } from '../cloudBackupActions';
import { sha256 } from './cloudReleaseArtifact';

type Row = Record<string, unknown> & { _id: string };
const workspaceId = 'workspaces:agency' as Id<'workspaces'>;
const backupId = 'cloudReleases:backup' as Id<'cloudReleases'>;
const projectId = 'projects:source' as Id<'projects'>;
const branchId = 'branches:source' as Id<'branches'>;
const actorId = 'users:agency' as Id<'users'>;

function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let value = tables.get(name); if (!value) { value = new Map(); tables.set(name, value); } return value; };
    const put = (name: string, id: string, fields: Record<string, unknown>) => table(name).set(id, { _creationTime: 1, ...fields, _id: id });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    const writes: string[] = [];
    let sequence = 0;
    put('users', actorId, { clerkUserId: 'agency' });
    put('workspaces', workspaceId, { createdByUserId: actorId });
    put('workspaceMembers', 'workspaceMembers:agency', { workspaceId, userId: actorId, role: 'admin' });
    put('cloudReleases', backupId, { workspaceId, projectId, branchId, actorId, purpose: 'backup', status: 'frozen',
        revision: 7, createdAt: 10, hash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), studioInputJson: 'null', previousArtifactJson: 'null' });
    put('cloudReleaseFiles', 'cloudReleaseFiles:home', { releaseId: backupId, stage: 'source',
        path: 'src/app/page.tsx', kind: 'file', text: 'saved source', hash: 'c'.repeat(64), bytes: 12 });
    const metric = () => ({ used: 0, remaining: 16_777_216 });
    const ctx = {
        meta: { getTransactionMetrics: async () => ({ bytesRead: metric(), bytesWritten: metric(), documentsRead: metric(), documentsWritten: metric(), databaseQueries: metric() }) },
        auth: { getUserIdentity: async () => ({ subject: 'agency', tokenIdentifier: 'issuer|agency' }) },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, fields: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, fields); writes.push(name); return id; },
            query: (name: string) => {
                const filters: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { filters.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => filters.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    order: () => query,
                    collect: async () => rows(),
                    take: async (count: number) => rows().slice(0, count),
                    unique: async () => { const matches = rows(); if (matches.length > 1) throw new Error('Nonunique'); return matches[0] ?? null; },
                    paginate: async ({ numItems }: { numItems: number }) => ({ page: rows().slice(0, numItems), isDone: rows().length <= numItems, continueCursor: '' }),
                };
                return query;
            },
        },
    } as unknown as MutationCtx;
    const discover = (id = workspaceId) => list._handler(ctx, { workspaceId: id, paginationOpts: { cursor: null, numItems: 20 } });
    const restore = () => restoreCopy._handler(ctx, { backupId, name: 'Recovered site', operationKey: 'restore_operation_001' });
    const enroll = () => {
        put('projects', projectId, { workspaceId, accessMode: 'restricted', name: 'Agency site' });
        put('branches', branchId, { projectId });
        put('cloudEditorStates', 'cloudEditorStates:source', { workspaceId, projectId, branchId, version: 1, createdByUserId: actorId });
    };
    return { ctx, tables, get, put, writes, discover, restore, enroll };
}

describe('retained cloud backup discovery', () => {
    it('keeps canonical workspace actor discovery available when the newest backup is being removed', async () => {
        const f = fixture(); f.get(backupId)!.removal = {};
        expect(await f.discover()).toMatchObject({ actorId, page: [] });
        await expect(manifest._handler(f.ctx, { backupId })).rejects.toThrow('CLOUD_RELEASE_REMOVED');
    });
    it('replays only a completed restore with current scope access after backup metadata compaction', async () => {
        const f = fixture(), restored = await f.restore();
        Object.assign(f.get(backupId)!, { removedAt: 123, removal: {}, studioInputJson: 'null' });
        delete f.get(backupId)!.sourceHash;
        const writes = f.writes.length;
        const replay = { backupId, expectedActorId: actorId, operationKey: 'restore_operation_001', name: 'Ignored old name' };
        expect(await restoreCopy._handler(f.ctx, replay)).toEqual(restored);
        expect(f.writes.length).toBe(writes);
        await expect(restoreCopy._handler(f.ctx, { ...replay, operationKey: 'restore_operation_new' })).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        f.tables.get('branches')!.delete(restored.branchId);
        await expect(restoreCopy._handler(f.ctx, replay)).rejects.toThrow('CLOUD_BACKUP_RESTORE_REMOVED');
        f.tables.get('workspaceMembers')!.clear();
        await expect(restoreCopy._handler(f.ctx, replay)).rejects.toThrow('FORBIDDEN');
    });

    it('keeps the captured site name after source deletion', async () => {
        const f = fixture();
        f.get(backupId)!.projectName = 'Customer journal';
        expect((await f.discover()).page[0]?.projectName).toBe('Customer journal');
    });
    it('finds and restores a deleted project without changing the retained snapshot or copying grants', async () => {
        const f = fixture();
        const discovered = await f.discover();
        expect(discovered.page).toEqual([{ id: backupId, projectName: null, revision: 7, createdAt: 10 }]);
        expect(JSON.stringify(discovered)).not.toContain('studioInputJson');
        const restored = await f.restore();
        expect(f.get(restored.projectId)).toMatchObject({ name: 'Recovered site', workspaceId, accessMode: 'restricted', createdByUserId: actorId });
        expect([...f.tables.get('cloudEditorFiles')!.values()][0]).toMatchObject({ projectId: restored.projectId, text: 'saved source' });
        expect(f.tables.get('cloudEditorGrants')?.size ?? 0).toBe(0);
        const writeCount = f.writes.length;
        expect(await f.restore()).toEqual(restored);
        expect(f.writes.length).toBe(writeCount);
        expect(f.get(backupId)?.projectId).toBe(projectId);
    });
    it('refuses discovery, download and restore after workspace membership is removed', async () => {
        const f = fixture();
        f.tables.get('workspaceMembers')!.clear();
        await expect(f.discover()).rejects.toThrow('FORBIDDEN');
        await expect(manifest._handler(f.ctx, { backupId })).rejects.toThrow('FORBIDDEN');
        await expect(f.restore()).rejects.toThrow('FORBIDDEN');
        expect(f.writes).toHaveLength(0);
    });
    for (const removedTable of ['projects', 'branches'] as const) {
        it(`refuses an old restore receipt after its ${removedTable} target is deleted without creating a replacement`, async () => {
            const f = fixture();
            const restored = await f.restore();
            f.tables.get(removedTable)!.delete(removedTable === 'projects' ? restored.projectId : restored.branchId);
            const writeCount = f.writes.length;
            await expect(f.restore()).rejects.toThrow('CLOUD_BACKUP_RESTORE_REMOVED');
            expect(f.writes.length).toBe(writeCount);
            const fresh = await restoreCopy._handler(f.ctx, { backupId, name: 'Another recovered site', operationKey: 'restore_operation_002' });
            expect(fresh.projectId).not.toBe(restored.projectId);
        });
    }
    it('refuses a foreign workspace and never returns its records in the authorized workspace', async () => {
        const f = fixture();
        const foreign = 'workspaces:foreign' as Id<'workspaces'>;
        f.put('workspaces', foreign, { createdByUserId: 'users:foreign' });
        f.put('cloudReleases', 'cloudReleases:foreign', { ...f.get(backupId), workspaceId: foreign });
        await expect(f.discover(foreign)).rejects.toThrow('FORBIDDEN');
        expect((await f.discover()).page.map(row => row.id)).toEqual([backupId]);
    });
    it('keeps current cloud role checks for enrolled sources and hides unauthorized rows', async () => {
        const f = fixture(); f.enroll();
        expect((await f.discover()).page[0]?.projectName).toBe('Agency site');
        f.put('cloudEditorGrants', 'cloudEditorGrants:agency', { projectId, userId: actorId, role: 'content', publish: false });
        expect((await f.discover()).page).toEqual([]);
        await expect(f.restore()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
    });
    it('keeps deleted-source backups private from ordinary workspace members', async () => {
        const f = fixture();
        f.get('workspaceMembers:agency')!.role = 'member';
        expect((await f.discover()).page).toEqual([]);
        await expect(f.restore()).rejects.toThrow('FORBIDDEN');
    });
});


describe('legacy backup byte return admission', () => {
    it('rechecks the authorized immutable descriptor after the body await', async () => {
        const descriptor = { path: 'public/photo.webp', kind: 'file' as const, text: 'retained', hash: sha256('retained'), bytes: 8 };
        let queries = 0;
        const ctx = { runQuery: async () => { queries++; if (queries === 2) throw new Error('CLOUD_RELEASE_REMOVED'); return descriptor; } } as unknown as ActionCtx;
        await expect(downloadFile._handler(ctx, { backupId, path: descriptor.path })).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        expect(queries).toBe(2);
        let driftQueries = 0;
        const drift = { runQuery: async () => ++driftQueries === 1 ? descriptor : { ...descriptor, hash: 'a'.repeat(64) } } as unknown as ActionCtx;
        await expect(downloadFile._handler(drift, { backupId, path: descriptor.path })).rejects.toThrow('CLOUD_BACKUP_FILE_CHANGED');
    });
});


describe('public source artifacts are never backup authority', () => {
    it('refuses public source and publishable hosting rows before any copy or file download', async () => {
        for (const patch of [
            { purpose: 'release', artifactProfile: 'imported-next-public-v1', publicationIntent: 'eligible-public-version' },
            { purpose: 'release', importedHosting: { visibility: 'publishable' } },
        ]) {
            const f = fixture(); Object.assign(f.get(backupId)!, patch);
            expect((await f.discover()).page).toEqual([]);
            await expect(manifest._handler(f.ctx, { backupId })).rejects.toThrow('CLOUD_BACKUP_NOT_READY');
            await expect(f.restore()).rejects.toThrow('CLOUD_BACKUP_NOT_READY');
            expect(f.writes).toEqual([]);
        }
    });
    it('refuses a public-format row disguised as backup rather than entering starter restore', async () => {
        const f = fixture(); Object.assign(f.get(backupId)!, { artifactProfile: 'imported-next-public-v1', publicationIntent: 'eligible-public-version',
            imported: { version: 1, capturedRevision: 7 } });
        await expect(f.restore()).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID'); expect(f.writes).toEqual([]);
    });
});
