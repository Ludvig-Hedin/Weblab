import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ApiFromModules, FunctionArgs, FunctionReturnType } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import * as uploads from '../cloudEditorUploads';

type Api = ApiFromModules<{ uploads: typeof uploads }>['uploads'];
function handler<K extends keyof Api>(name: K) {
    return (uploads[name] as unknown as { _handler: (ctx: MutationCtx, args: FunctionArgs<Api[K]>) => Promise<FunctionReturnType<Api[K]>> })._handler;
}
const begin = handler('_begin'), attach = handler('_attach'), collect = handler('_collect'), abort = handler('_recordAbortedUpload');
const DAY = 86_400_000;
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const operation = { ...scope, operationId: 'operation_12345678', fingerprint: 'a'.repeat(64) };
type Row = Record<string, unknown> & { _id: string };

// Exercises real handlers and auth with in-memory IO boundaries. This fixture
// intentionally does not claim to simulate Convex transaction rollback.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => {
        let rows = tables.get(name);
        if (!rows) { rows = new Map(); tables.set(name, rows); }
        return rows;
    };
    const put = (name: string, id: string, values: Record<string, unknown>) => table(name).set(id, { _id: id, ...values });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject = 'builder';
    let sequence = 0;
    let failDeletion = false;
    const blobs = new Map<string, { size: number }>();
    const deleted: string[] = [];
    const scheduled: unknown[] = [];
    put('workspaces', 'workspaces:one', { createdByUserId: 'users:builder' });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, version: 1 });
    for (const user of ['builder', 'other', 'viewer']) {
        put('users', `users:${user}`, { clerkUserId: user });
        put('workspaceMembers', `workspaceMembers:${user}`, { workspaceId: 'workspaces:one', userId: `users:${user}`, role: user === 'viewer' ? 'viewer' : 'member' });
        if (user !== 'viewer') put('projectMembers', `projectMembers:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: 'manager' });
    }
    const ctx = {
        auth: { getUserIdentity: async () => ({ subject, tokenIdentifier: `issuer|${subject}` }) },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, values: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, values); return id; },
            patch: async (id: string, values: Record<string, unknown>) => { Object.assign(get(id)!, values); },
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); },
            system: { get: async (id: string) => blobs.get(id) ?? null },
            query: (name: string) => {
                const filters: Array<(row: Row) => boolean> = [];
                const index = {
                    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; },
                    gte: (key: string, value: number) => { filters.push(row => Number(row[key]) >= value); return index; },
                    lte: (key: string, value: number) => { filters.push(row => Number(row[key]) <= value); return index; },
                };
                const rows = () => [...table(name).values()].filter(row => filters.every(test => test(row)));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => rows(), take: async (n: number) => rows().slice(0, n),
                    unique: async () => rows()[0] ?? null, first: async () => rows()[0] ?? null,
                };
                return query;
            },
        },
        scheduler: { runAfter: async (_delay: number, _ref: unknown, args: unknown) => { scheduled.push(args); return 'scheduled'; } },
        storage: { delete: async (id: string) => { if (failDeletion) throw new Error('Storage unavailable'); deleted.push(id); blobs.delete(id); } },
    } as unknown as MutationCtx;
    return { ctx, table, put, get, blobs, deleted, scheduled,
        signIn: (user: string) => { subject = user; }, failDeletion: () => { failDeletion = true; } };
}

const previousGate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
let now = 1_000_000_000;
let clock: ReturnType<typeof spyOn>;
beforeEach(() => { process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true'; now = 1_000_000_000; clock = spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => { clock.mockRestore(); if (previousGate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED; else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = previousGate; });

describe('cloud upload ownership and collection', () => {
    it('requires a current builder and actual branch enrollment', async () => {
        const f = fixture();
        f.signIn('viewer');
        await expect(begin(f.ctx, operation)).rejects.toThrow('FORBIDDEN');
        f.signIn('builder');
        f.table('cloudEditorStates').clear();
        await expect(begin(f.ctx, operation)).rejects.toThrow('CLOUD_NOT_ENROLLED');
        expect(f.table('cloudEditorUploadAttempts').size).toBe(0);
    });

    it('binds attachments and commit to one owner, operation and exact blob set', async () => {
        const f = fixture();
        const attemptId = await begin(f.ctx, operation);
        const storageId = '_storage:one' as Id<'_storage'>;
        f.blobs.set(storageId, { size: 10 });
        f.signIn('other');
        await expect(attach(f.ctx, { ...scope, attemptId, storageId })).rejects.toThrow('CLOUD_INVALID_UPLOAD');
        f.signIn('builder');
        await attach(f.ctx, { ...scope, attemptId, storageId });
        await attach(f.ctx, { ...scope, attemptId, storageId });
        expect(f.get(attemptId)?.bytes).toBe(10);
        const args = { ...operation, userId: 'users:builder' as Id<'users'>, attemptId, storageIds: [storageId] };
        await expect(uploads.commitCloudEditorUploads(f.ctx, { ...args, fingerprint: 'b'.repeat(64) })).rejects.toThrow('CLOUD_INVALID_UPLOAD');
        await expect(uploads.commitCloudEditorUploads(f.ctx, { ...args, storageIds: [] })).rejects.toThrow('CLOUD_INVALID_UPLOAD');
        await uploads.commitCloudEditorUploads(f.ctx, args);
        expect(f.get(attemptId)?.status).toBe('committed');
        await expect(attach(f.ctx, { ...scope, attemptId, storageId })).rejects.toThrow('CLOUD_UPLOAD_EXPIRED');
    });

    it('caps active and daily attempts and bounds attached bytes', async () => {
        const f = fixture();
        for (let i = 0; i < 8; i++) await begin(f.ctx, operation);
        await expect(begin(f.ctx, operation)).rejects.toThrow('CLOUD_UPLOAD_LIMIT');
        for (const row of f.table('cloudEditorUploadAttempts').values()) row.status = 'committed';
        for (let i = 8; i < 20; i++) {
            const id = await begin(f.ctx, operation);
            f.get(id)!.status = 'committed';
        }
        await expect(begin(f.ctx, operation)).rejects.toThrow('CLOUD_UPLOAD_LIMIT');
        const fresh = fixture();
        const attemptId = await begin(fresh.ctx, operation);
        for (const id of ['one', 'two']) fresh.blobs.set(`_storage:${id}`, { size: 1_600_000 });
        await attach(fresh.ctx, { ...scope, attemptId, storageId: '_storage:one' as Id<'_storage'> });
        await expect(attach(fresh.ctx, { ...scope, attemptId, storageId: '_storage:two' as Id<'_storage'> })).rejects.toThrow('CLOUD_UPLOAD_LIMIT');
    });

    it('collects only registered unreferenced blobs and keeps live ownership for later cleanup', async () => {
        const f = fixture();
        const attemptId = await begin(f.ctx, operation);
        for (const name of ['orphan', 'live', 'unknown']) f.blobs.set(`_storage:${name}`, { size: 1 });
        for (const name of ['orphan', 'live']) await attach(f.ctx, { ...scope, attemptId, storageId: `_storage:${name}` as Id<'_storage'> });
        f.put('cloudEditorFiles', 'cloudEditorFiles:live', { storageId: '_storage:live' });
        await collect(f.ctx, { attemptId });
        expect(f.deleted).toEqual([]);
        now += DAY;
        await collect(f.ctx, { attemptId });
        expect(f.deleted).toEqual(['_storage:orphan']);
        expect(f.get(attemptId)?.status).toBe('closed');
        expect(f.get(attemptId)?.storageIds).toEqual(['_storage:live']);
        expect(f.blobs.has('_storage:unknown')).toBe(true);
        f.table('cloudEditorFiles').clear(); now += DAY;
        await collect(f.ctx, { attemptId });
        expect(f.deleted).toEqual(['_storage:orphan', '_storage:live']);
        expect(f.get(attemptId)).toBeNull();
    });

    it('records the exact failed attachment before later cleanup, even after access changes', async () => {
        const f = fixture();
        const attemptId = await begin(f.ctx, operation);
        const storageId = '_storage:interrupted' as Id<'_storage'>;
        f.blobs.set(storageId, { size: 12 });
        await abort(f.ctx, { ...scope, attemptId, storageId });
        expect(f.get(attemptId)?.status).toBe('closed');
        expect(f.get(attemptId)?.storageIds).toEqual([storageId]);
        await expect(attach(f.ctx, { ...scope, attemptId, storageId })).rejects.toThrow('CLOUD_UPLOAD_EXPIRED');
        now += DAY;
        await collect(f.ctx, { attemptId });
        expect(f.deleted).toEqual([storageId]);
    });

    it('retains ownership when deletion fails, so a later sweep can retry', async () => {
        const f = fixture();
        const attemptId = await begin(f.ctx, operation);
        const storageId = '_storage:one' as Id<'_storage'>;
        f.blobs.set(storageId, { size: 1 });
        await attach(f.ctx, { ...scope, attemptId, storageId });
        now += DAY; f.failDeletion();
        await expect(collect(f.ctx, { attemptId })).rejects.toThrow('Storage unavailable');
        expect(f.get(attemptId)?.storageIds).toEqual([storageId]);
        expect(f.blobs.has(storageId)).toBe(true);
        await handler('sweep')(f.ctx, {});
        expect(f.scheduled.at(-1)).toEqual({ attemptId });
    });
});
