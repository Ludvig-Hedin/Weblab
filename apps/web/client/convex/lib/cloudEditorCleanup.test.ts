import { describe, expect, it } from 'bun:test';
import { getFunctionName, type ApiFromModules, type FunctionArgs } from 'convex/server';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import * as cleanup from '../cloudEditorCleanup';
import * as uploads from '../cloudEditorUploads';

type CleanupApi = ApiFromModules<{ cleanup: typeof cleanup }>['cleanup'];
type DrainArgs = FunctionArgs<CleanupApi['_drain']>;
const drain = (cleanup._drain as unknown as { _handler: (ctx: MutationCtx, args: DrainArgs) => Promise<null> })._handler;
const collect = (uploads._collect as unknown as {
    _handler: (ctx: MutationCtx, args: { attemptId: Id<'cloudEditorUploadAttempts'> }) => Promise<null>;
})._handler;
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
type Row = Record<string, unknown> & { _id: string };

// Real cleanup/GC handlers, in-memory database and scheduler boundaries only.
// This fixture does not model Convex transaction rollback or opaque cursor internals.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => {
        let rows = tables.get(name);
        if (!rows) { rows = new Map(); tables.set(name, rows); }
        return rows;
    };
    const put = (name: string, id: string, values: Record<string, unknown>) => table(name).set(id, { _id: id, ...values });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    const jobs: Array<{ name: string; args: unknown }> = [];
    const pages: Array<{ name: string; count: number }> = [];
    const blobs = new Set<string>();
    const deletedBlobs: string[] = [];
    const ctx = {
        db: {
            get: async (id: string) => get(id),
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); },
            patch: async (id: string, values: Record<string, unknown>) => { Object.assign(get(id)!, values); },
            system: { get: async (id: string) => blobs.has(id) ? { _id: id, size: 1 } : null },
            query: (name: string) => {
                const filters: Array<(row: Row) => boolean> = [];
                let orderKey = '_id';
                const index = {
                    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; },
                };
                const key = (row: Row) => `${String(row[orderKey] ?? '')}\u0000${row._id}`;
                const rows = () => [...table(name).values()].filter(row => filters.every(test => test(row)))
                    .sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
                const query = {
                    withIndex: (indexName: string, build: (q: typeof index) => unknown) => {
                        orderKey = indexName === 'by_branchId_path' ? 'path' : indexName === 'by_branchId_operationId' ? 'operationId' : '_id';
                        build(index); return query;
                    },
                    unique: async () => { const matches = rows(); if (matches.length > 1) throw new Error('Nonunique query'); return matches[0] ?? null; },
                    first: async () => rows()[0] ?? null,
                    paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => {
                        const remaining = rows().filter(row => cursor === null || key(row) > cursor);
                        const page = remaining.slice(0, numItems);
                        pages.push({ name, count: page.length });
                        return { page, isDone: remaining.length <= numItems,
                            continueCursor: page.length ? key(page[page.length - 1]!) : cursor ?? '' };
                    },
                };
                return query;
            },
        },
        scheduler: { runAfter: async (_delay: number, ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
            jobs.push({ name: getFunctionName(ref), args }); return 'scheduled';
        } },
        storage: { delete: async (id: string) => { deletedBlobs.push(id); blobs.delete(id); } },
    } as unknown as MutationCtx;
    put('branches', scope.branchId, { projectId: scope.projectId });
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, version: 1, workspaceId: 'workspaces:one' });
    async function flushCleanup() {
        let calls = 0;
        while (jobs.some(job => job.name === 'cloudEditorCleanup:_drain')) {
            if (++calls > 100) throw new Error('Cleanup did not terminate');
            const position = jobs.findIndex(job => job.name === 'cloudEditorCleanup:_drain');
            const [job] = jobs.splice(position, 1);
            await drain(ctx, job!.args as DrainArgs);
        }
    }
    return { ctx, table, put, get, jobs, pages, blobs, deletedBlobs, flushCleanup };
}

describe('cloud branch deletion cleanup', () => {
    it('refuses deletion of a live site or unresolved publishing operation', async () => {
        for (const state of [{ liveReleaseId: 'cloudReleases:live' }, { lockOperationId: 'cloudReleaseOperations:pending' }]) {
            const f = fixture();
            f.put('cloudReleaseDestinations', 'cloudReleaseDestinations:one', { ...scope, ...state });
            await expect(cleanup.deleteCloudEditorBranch(f.ctx, scope)).rejects.toThrow('CLOUD_RELEASE_DELETE_ACTIVE_DESTINATION');
            expect(f.get('cloudEditorStates:one')).not.toBeNull();
            expect(f.jobs).toHaveLength(0);
        }
    });

    it('removes enrollment immediately and cleans only the exact branch and project', async () => {
        const f = fixture();
        const otherBranch = { ...scope, branchId: 'branches:other' };
        const otherProject = { ...scope, projectId: 'projects:other' };
        f.put('cloudEditorStates', 'cloudEditorStates:other', { ...otherBranch, version: 1 });
        for (const [name, rowScope] of [['own', scope], ['otherBranch', otherBranch], ['otherProject', otherProject]] as const) {
            f.put('cloudEditorFiles', `cloudEditorFiles:${name}`, { ...rowScope, path: `${name}.tsx` });
            f.put('cloudEditorOperations', `cloudEditorOperations:${name}`, { ...rowScope, operationId: name });
            f.put('cloudEditorContentContracts', `cloudEditorContentContracts:${name}`, { ...rowScope, path: `${name}.tsx` });
            f.put('cloudPreviewTickets', `cloudPreviewTickets:${name}`, { ...rowScope, userId: name });
        }
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        expect(f.get('cloudEditorStates:one')).toBeNull();
        expect(f.get('cloudEditorStates:other')).not.toBeNull();
        expect(f.jobs).toHaveLength(6);
        expect(f.pages).toHaveLength(0); // Cascade does not read large manifests.
        await f.flushCleanup();
        expect(f.get('cloudEditorFiles:own')).toBeNull();
        expect(f.get('cloudEditorOperations:own')).toBeNull();
        expect(f.get('cloudEditorContentContracts:own')).toBeNull();
        expect(f.get('cloudPreviewTickets:own')).toBeNull();
        for (const suffix of ['otherBranch', 'otherProject']) {
            expect(f.get(`cloudEditorFiles:${suffix}`)).not.toBeNull();
            expect(f.get(`cloudEditorOperations:${suffix}`)).not.toBeNull();
            expect(f.get(`cloudEditorContentContracts:${suffix}`)).not.toBeNull();
            expect(f.get(`cloudPreviewTickets:${suffix}`)).not.toBeNull();
        }
        expect(f.get(scope.branchId)).not.toBeNull(); // Caller owns branch deletion.
    });

    it('preserves native branches, forged tags and mismatched scopes', async () => {
        const f = fixture();
        await cleanup.deleteCloudEditorBranch(f.ctx, { ...scope, projectId: 'projects:wrong' as Id<'projects'> });
        expect(f.get('cloudEditorStates:one')).not.toBeNull();
        f.table('cloudEditorStates').clear();
        f.put('projects', scope.projectId, { tags: ['cloud-editor-v1'], runtimeMetadata: { cloudEditor: { version: 1 } } });
        f.put('cloudEditorFiles', 'cloudEditorFiles:unregistered', { ...scope, path: 'page.tsx' });
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        expect(f.get('cloudEditorFiles:unregistered')).not.toBeNull();
        expect(f.jobs).toEqual([]);
    });

    it('bounds continuation pages and does not loop on mismatched rows', async () => {
        const f = fixture();
        for (let i = 0; i < 75; i++) f.put('cloudEditorFiles', `cloudEditorFiles:${i}`, {
            ...scope, path: `file${String(i).padStart(3, '0')}`, ...(i < 33 ? { projectId: 'projects:other' } : {}),
        });
        for (let i = 0; i < 251; i++) f.put('cloudEditorOperations', `cloudEditorOperations:${i}`, {
            ...scope, operationId: String(i).padStart(4, '0'), ...(i < 101 ? { projectId: 'projects:other' } : {}),
        });
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        await f.flushCleanup();
        expect(f.table('cloudEditorFiles').size).toBe(33);
        expect(f.table('cloudEditorOperations').size).toBe(101);
        expect(f.pages.filter(page => page.name === 'cloudEditorFiles').map(page => page.count)).toEqual([32, 32, 11]);
        expect(f.pages.filter(page => page.name === 'cloudEditorOperations').map(page => page.count)).toEqual([100, 100, 51]);
    });

    it('is idempotent and fences old jobs from a recreated enrollment', async () => {
        const f = fixture();
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        expect(f.jobs).toHaveLength(9);
        f.put('cloudEditorStates', 'cloudEditorStates:replacement', { ...scope, version: 1 });
        f.put('cloudEditorFiles', 'cloudEditorFiles:replacement', { ...scope, path: 'page.tsx' });
        f.put('cloudEditorOperations', 'cloudEditorOperations:replacement', { ...scope, operationId: 'new' });
        await f.flushCleanup();
        expect(f.get('cloudEditorFiles:replacement')).not.toBeNull();
        expect(f.get('cloudEditorOperations:replacement')).not.toBeNull();
        expect(f.pages).toHaveLength(0);
    });

    it('cleans grants in bounded pages only for the project whose final enrollment was removed', async () => {
        const f = fixture();
        for (let i = 0; i < 105; i++) f.put('cloudEditorGrants', `cloudEditorGrants:${i}`, {
            projectId: scope.projectId, userId: `users:${i}`, role: 'designer', publish: false,
        });
        f.put('cloudEditorGrants', 'cloudEditorGrants:peer', { projectId: 'projects:peer', userId: 'users:peer' });
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        expect(f.table('cloudEditorGrants').size).toBe(106);
        await f.flushCleanup();
        expect(f.table('cloudEditorGrants').size).toBe(1);
        expect(f.get('cloudEditorGrants:peer')).not.toBeNull();
        expect(f.pages.filter(page => page.name === 'cloudEditorGrants').map(page => page.count)).toEqual([100, 5]);
    });

    it('preserves grants for remaining enrollment and fences later enrollment on another branch', async () => {
        const f = fixture();
        const second = { ...scope, branchId: 'branches:second' as Id<'branches'> };
        f.put('cloudEditorStates', 'cloudEditorStates:second', { ...second, version: 1 });
        f.put('cloudEditorGrants', 'cloudEditorGrants:one', { projectId: scope.projectId, userId: 'users:one' });
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        expect(f.jobs).toHaveLength(6);
        await f.flushCleanup();
        expect(f.get('cloudEditorGrants:one')).not.toBeNull();
        await cleanup.deleteCloudEditorBranch(f.ctx, second);
        expect(f.jobs).toHaveLength(9);
        f.put('cloudEditorStates', 'cloudEditorStates:new', { ...scope, branchId: 'branches:new', version: 1 });
        await f.flushCleanup();
        expect(f.get('cloudEditorGrants:one')).not.toBeNull();
        await cleanup.deleteCloudEditorBranch(f.ctx, { ...scope, branchId: 'branches:new' as Id<'branches'> });
        await f.flushCleanup();
        expect(f.get('cloudEditorGrants:one')).toBeNull();
    });

    it('retains runtime reservations and storage ownership until registered GC can collect', async () => {
        const f = fixture();
        const slot = { ...scope, token: 'uncertain-running-vm', expiresAt: Date.now() + 1_200_000 };
        f.put('cloudEditorSlots', 'cloudEditorSlots:one', slot);
        const attemptId = 'cloudEditorUploadAttempts:one' as Id<'cloudEditorUploadAttempts'>;
        f.put('cloudEditorUploadAttempts', attemptId, { ...scope, status: 'committed', expiresAt: 0,
            storageIds: ['_storage:own', '_storage:shared'] });
        for (const id of ['_storage:own', '_storage:shared', '_storage:unknown']) f.blobs.add(id);
        f.put('cloudEditorFiles', 'cloudEditorFiles:own', { ...scope, path: 'image.png', storageId: '_storage:own' });
        f.put('cloudEditorFiles', 'cloudEditorFiles:shared', { ...scope, branchId: 'branches:other', path: 'shared.png', storageId: '_storage:shared' });
        f.put('cloudEditorOperations', 'cloudEditorOperations:one', { ...scope, operationId: 'save', storageIds: ['_storage:unknown'] });
        await cleanup.deleteCloudEditorBranch(f.ctx, scope);
        await f.flushCleanup();
        expect(f.get('cloudEditorSlots:one')).toEqual({ _id: 'cloudEditorSlots:one', ...slot });
        expect(f.get(attemptId)?.storageIds).toEqual(['_storage:own', '_storage:shared']);
        expect(f.deletedBlobs).toEqual([]);
        await collect(f.ctx, { attemptId });
        expect(f.deletedBlobs).toEqual(['_storage:own']);
        expect(f.get(attemptId)?.storageIds).toEqual(['_storage:shared']);
        expect(f.blobs.has('_storage:unknown')).toBe(true);
        expect(f.blobs.has('_storage:shared')).toBe(true);
        f.table('cloudEditorFiles').clear();
        f.get(attemptId)!.expiresAt = 0;
        await collect(f.ctx, { attemptId });
        expect(f.get(attemptId)).toBeNull();
        expect(f.deletedBlobs).toEqual(['_storage:own', '_storage:shared']);
        expect(f.blobs.has('_storage:unknown')).toBe(true);
    });
});
