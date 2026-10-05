import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _create, _commit, _operation, _lease, _runtimeReady, ensurePreview, snapshot, status } from '../cloudEditor';
import { CLOUD_EDITOR_TAG } from './cloudEditor';

// These exercise the real registered handlers and real capability resolution.
// Only auth/database/storage/scheduler boundaries are in memory. This fixture
// DOES NOT simulate Convex validators, transaction rollback or concurrent retry.
// Multi-file assertions prove handler batching and revision behavior, not the
// database's atomic rollback guarantee when a later validation rejects.
const createProject = _create._handler;
const commit = _commit._handler;
const operation = _operation._handler;
const read = snapshot._handler;
const readStatus = status._handler;
const lease = _lease._handler;
const runtimeReady = _runtimeReady._handler;
const preview = ensurePreview._handler;
type CommitArgs = Parameters<typeof commit>[1];

type Row = Record<string, unknown> & { _id: string };
const workspaceId = 'workspaces:main' as Id<'workspaces'>;

function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    let sequence = 0;
    let subject: string | null = 'builder';
    const writes: string[] = [];
    const table = (name: string) => {
        let rows = tables.get(name);
        if (!rows) {
            rows = new Map();
            tables.set(name, rows);
        }
        return rows;
    };
    const put = (name: string, id: string, value: Record<string, unknown>) => {
        table(name).set(id, { _id: id, _creationTime: 1, ...value });
    };
    const row = (id: string): Row => {
        const found = table(id.split(':')[0]!).get(id);
        if (!found) throw new Error(`Fixture row missing: ${id}`);
        return found;
    };
    for (const user of ['builder', 'reader', 'otherBuilder', 'outsider']) {
        put('users', `users:${user}`, { clerkUserId: user });
    }
    put('workspaces', workspaceId, { createdByUserId: 'users:outsider' });
    put('workspaceMembers', 'workspaceMembers:builder', {
        workspaceId,
        userId: 'users:builder',
        role: 'member',
    });
    put('workspaceMembers', 'workspaceMembers:reader', {
        workspaceId,
        userId: 'users:reader',
        role: 'viewer',
    });
    const scheduled: Array<{ delay: number; args: unknown }> = [];
    const db = {
        get: async (id: string) => structuredClone(table(id.split(':')[0]!).get(id) ?? null),
        normalizeId: (name: string, id: string) => (id.startsWith(`${name}:`) ? id : null),
        insert: async (name: string, value: Record<string, unknown>) => {
            const id = `${name}:${++sequence}`;
            writes.push(`insert:${name}`);
            put(name, id, value);
            return id;
        },
        patch: async (id: string, patch: Record<string, unknown>) => {
            writes.push(`patch:${id}`);
            table(id.split(':')[0]!).set(id, {
                ...row(id),
                ...structuredClone(patch),
            });
        },
        delete: async (id: string) => { writes.push(`delete:${id}`); table(id.split(':')[0]!).delete(id); },
        replace: async (id: string, value: Record<string, unknown>) => {
            writes.push(`replace:${id}`);
            table(id.split(':')[0]!).set(id, { _id: id, _creationTime: row(id)._creationTime, ...structuredClone(value) });
        },
        query: (name: string) => {
            const constraints: Array<[string, unknown]> = [];
            const index = {
                eq: (key: string, value: unknown) => {
                    constraints.push([key, value]);
                    return index;
                },
            };
            const filter = {
                field: (key: string) => key,
                eq: (key: string, value: unknown) => {
                    constraints.push([key, value]);
                },
            };
            const select = () =>
                [...table(name).values()]
                    .filter((value) =>
                        constraints.every(([key, expected]) => value[key] === expected),
                    )
                    .map((value) => structuredClone(value));
            const query = {
                withIndex: (_name: string, build: (value: typeof index) => unknown) => {
                    build(index);
                    return query;
                },
                filter: (build: (value: typeof filter) => unknown) => {
                    build(filter);
                    return query;
                },
                collect: async () => select(),
                take: async (limit: number) => select().slice(0, limit),
                first: async () => select()[0] ?? null,
                unique: async () => {
                    const result = select();
                    if (result.length > 1) throw new Error('Non-unique fixture query');
                    return result[0] ?? null;
                },
            };
            return query;
        },
    };
    const ctx = {
        db,
        scheduler: { runAfter: async (delay: number, _ref: unknown, args: unknown) => { scheduled.push({ delay, args }); return 'scheduled:1'; } },
        storage: { getUrl: async (id: string) => `https://storage.invalid/${id}` },
        auth: {
            getUserIdentity: async () =>
                subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null,
        },
    } as unknown as MutationCtx;
    return {
        ctx,
        table,
        put,
        row,
        writes,
        scheduled,
        signIn: (user: string | null) => {
            subject = user;
        },
    };
}

function file(path: string, text: string) {
    return { path, kind: 'file' as const, text, hash: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) };
}

async function seeded() {
    const f = fixture();
    const scope = await createProject(f.ctx, {
        workspaceId, name: 'Studio', creationId: 'create_studio_0001',
        files: [file('app/page.tsx', 'Original page'), file('public/photo.svg', '<svg/>')],
    });
    const state = [...f.table('cloudEditorStates').values()][0]!;
    f.writes.length = 0;
    f.scheduled.length = 0;
    return { ...f, ...scope, state };
}

function edit(scope: { projectId: Id<'projects'>; branchId: Id<'branches'> }, overrides: Partial<CommitArgs> = {}): CommitArgs {
    return { projectId: scope.projectId, branchId: scope.branchId, actorId: 'users:builder' as Id<'users'>, expectedRevision: 1,
        operationId: 'operation_first_0001', fingerprint: 'same-validated-payload',
        changes: [file('app/page.tsx', 'Saved page')], ...overrides };
}

let originalGate: string | undefined;
beforeEach(() => {
    originalGate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
    process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true';
});
afterEach(() => {
    if (originalGate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
    else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = originalGate;
});

describe('cloud source registered handlers', () => {
    it('creates durable enrollment with a real editor graph, independent of a live runtime', async () => {
        const f = await seeded();
        expect(f.row(f.projectId)).toMatchObject({ accessMode: 'restricted', storageMode: 'cloud' });
        expect(f.row(f.branchId)).toMatchObject({ projectId: f.projectId, runtimeType: 'cloud' });
        expect(f.state).toMatchObject({ projectId: f.projectId, branchId: f.branchId, revision: 1, status: 'stopped' });
        expect(f.table('canvases').size).toBe(1);
        expect(f.table('frames').size).toBeGreaterThan(0);
        expect(await read(f.ctx, f)).toMatchObject({ revision: 1 });
        expect(f.scheduled).toEqual([]);
    });

    it('does not accept forged tags or runtime metadata as enrollment', async () => {
        const f = await seeded();
        f.table('cloudEditorStates').clear();
        f.row(f.projectId).tags = [CLOUD_EDITOR_TAG];
        f.row(f.projectId).runtimeMetadata = { framework: 'nextjs', cloudEditor: { version: 1 } };
        f.row(f.branchId).runtimeMetadata = { cloud: { sourceVersion: 1, provider: 'vercel_sandbox' } };
        await expect(read(f.ctx, f)).rejects.toThrow('CLOUD_NOT_ENROLLED');
        await expect(commit(f.ctx, edit(f))).rejects.toThrow('CLOUD_NOT_ENROLLED');
        expect(f.writes).toEqual([]);
    });

    it('rejects project/branch and enrollment scope mismatches', async () => {
        const f = await seeded();
        const other = await createProject(f.ctx, {
            workspaceId, name: 'Other', creationId: 'create_other_0001', files: [file('app/page.tsx', 'Other')],
        });
        f.writes.length = 0;
        const wrong = { projectId: f.projectId, branchId: other.branchId };
        await expect(read(f.ctx, wrong)).rejects.toThrow('CLOUD_NOT_ENROLLED');
        await expect(commit(f.ctx, edit(wrong))).rejects.toThrow('CLOUD_NOT_ENROLLED');
        f.row(f.state._id).projectId = other.projectId;
        await expect(read(f.ctx, f)).rejects.toThrow('CLOUD_NOT_ENROLLED');
        expect(f.writes).toEqual([]);
    });

    it('lets a project viewer read, but denies writes and paid preview starts', async () => {
        const f = await seeded();
        f.put('projectMembers', 'projectMembers:reader', { projectId: f.projectId, userId: 'users:reader', role: 'viewer' });
        f.signIn('reader');
        expect((await read(f.ctx, f)).revision).toBe(1);
        await expect(commit(f.ctx, edit(f))).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(preview(f.ctx, f)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect(f.writes).toEqual([]);
        expect(f.scheduled).toEqual([]);
        f.signIn(null);
        await expect(read(f.ctx, f)).rejects.toThrow('UNAUTHORIZED');
    });

    it('keeps authorized source readable while the rollout gate blocks mutations', async () => {
        const f = await seeded();
        delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
        expect((await read(f.ctx, f)).revision).toBe(1);
        expect((await readStatus(f.ctx, f)).enabled).toBe(false);
        await expect(commit(f.ctx, edit(f))).rejects.toThrow('CLOUD_DISABLED');
        await expect(preview(f.ctx, f)).rejects.toThrow('CLOUD_DISABLED');
        expect(f.writes).toEqual([]);
    });

    it('commits two files at one revision and rejects a stale competing save before writes', async () => {
        const f = await seeded();
        const changes = [file('app/page.tsx', 'New page'), file('public/photo.svg', '<svg>new</svg>')];
        expect(await commit(f.ctx, edit(f, { changes }))).toMatchObject({ revision: 2, currentRevision: 2 });
        const saved = await read(f.ctx, f);
        expect(saved.files.find(entry => entry.path === 'app/page.tsx')?.text).toBe('New page');
        expect(saved.files.find(entry => entry.path === 'public/photo.svg')?.text).toBe('<svg>new</svg>');
        expect(f.table('cloudEditorOperations').size).toBe(1);
        expect(f.scheduled).toHaveLength(1);
        const writes = [...f.writes];
        await expect(commit(f.ctx, edit(f, { operationId: 'operation_stale_0002' }))).rejects.toThrow('CLOUD_CONFLICT');
        expect(f.writes).toEqual(writes);
        expect((await read(f.ctx, f)).revision).toBe(2);
    });

    it('replays only the same actor and fingerprint even after a later revision', async () => {
        const f = await seeded();
        const first = edit(f);
        await commit(f.ctx, first);
        await commit(f.ctx, edit(f, { expectedRevision: 2, operationId: 'operation_second_002', fingerprint: 'next-payload', changes: [file('app/page.tsx', 'Next page')] }));
        const writes = [...f.writes];
        expect(await commit(f.ctx, first)).toMatchObject({ revision: 2, currentRevision: 3 });
        expect(await operation(f.ctx, first)).toMatchObject({ revision: 2, currentRevision: 3 });
        await expect(commit(f.ctx, { ...first, fingerprint: 'different-payload' })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        await expect(operation(f.ctx, { ...first, fingerprint: 'different-payload' })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        f.put('projectMembers', 'projectMembers:otherBuilder', { projectId: f.projectId, userId: 'users:otherBuilder', role: 'editor' });
        f.put('cloudEditorGrants', 'cloudEditorGrants:otherBuilder', { projectId: f.projectId, userId: 'users:otherBuilder', role: 'designer', publish: false });
        f.signIn('otherBuilder');
        await expect(commit(f.ctx, first)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        const other = { ...first, actorId: 'users:otherBuilder' as Id<'users'> };
        await expect(commit(f.ctx, other)).rejects.toThrow('CLOUD_INVALID_OPERATION');
        await expect(operation(f.ctx, other)).rejects.toThrow('CLOUD_INVALID_OPERATION');
        expect(f.writes).toEqual(writes);
        expect(f.scheduled).toHaveLength(2);
    });

    it('rejects a batch with a file blocking a child without acknowledging a revision', async () => {
        const f = await seeded();
        await expect(commit(f.ctx, edit(f, { changes: [file('conflict', 'File'), file('conflict/child.txt', 'Child')] }))).rejects.toThrow('CLOUD_PATH_COLLISION');
        // The in-memory DB has no rollback. Do not assert its intermediate file
        // writes were undone: that guarantee belongs to Convex mutation transactions.
        expect(f.row(f.state._id).revision).toBe(1);
        expect(f.table('cloudEditorOperations').size).toBe(0);
        expect(f.scheduled).toEqual([]);
    });
});

describe('cloud runtime leases', () => {
    it('reuses only ready unexpired runtimes, never failed or expired VMs', async () => {
        const clock = spyOn(Date, 'now').mockReturnValue(1_000_000);
        try {
            for (const scenario of [
                { status: 'ready', expiresAt: 1_500_000, reuse: true },
                { status: 'error', expiresAt: 1_500_000, reuse: false },
                { status: 'starting', expiresAt: 1_500_000, reuse: false },
                { status: 'ready', expiresAt: 999_999, reuse: false },
            ]) {
                const f = await seeded();
                Object.assign(f.row(f.state._id), { status: scenario.status, previewGatewayVersion: 2, expiresAt: scenario.expiresAt, sandboxId: 'owned-runtime', revision: 2, appliedRevision: 1 });
                expect(await lease(f.ctx, { ...f, token: 'worker' })).toMatchObject({ reuse: scenario.reuse, generation: 1 });
            }
        } finally { clock.mockRestore(); }
    });

    it('does not acquire a second live lease or restart an already-current ready preview', async () => {
        const clock = spyOn(Date, 'now').mockReturnValue(1_000_000);
        try {
            const f = await seeded();
            Object.assign(f.row(f.state._id), { leaseToken: 'current', leaseUntil: 1_100_000 });
            expect(await lease(f.ctx, { ...f, token: 'other' })).toBeNull();
            expect(f.writes).toEqual([]);
            Object.assign(f.row(f.state._id), { leaseUntil: 999_999, status: 'ready', previewGatewayVersion: 2, appliedRevision: 1, sandboxId: 'owned-runtime', expiresAt: 1_500_000 });
            expect(await lease(f.ctx, { ...f, token: 'other' })).toBeNull();
            await preview(f.ctx, f);
            expect(f.scheduled).toEqual([]);
        } finally { clock.mockRestore(); }
    });

    it('rejects expired or superseded worker adoption and schedules catchup after valid adoption', async () => {
        const clock = spyOn(Date, 'now').mockReturnValue(1_000_000);
        try {
            const f = await seeded();
            const ready = { projectId: f.projectId, branchId: f.branchId, token: 'worker', revision: 1,
                sandboxId: 'owned-runtime', previewUrl: 'https://preview.vercel.run', expiresAt: 1_500_000,
                paths: ['app/page.tsx'], dependencyHash: 'dependencies' };
            Object.assign(f.row(f.state._id), { status: 'starting', leaseToken: 'worker', leaseUntil: 999_999 });
            expect(await runtimeReady(f.ctx, ready)).toBe(false);
            Object.assign(f.row(f.state._id), { leaseToken: 'replacement', leaseUntil: 1_100_000 });
            expect(await runtimeReady(f.ctx, ready)).toBe(false);
            expect(f.writes).toEqual([]);
            Object.assign(f.row(f.state._id), { leaseToken: 'worker', revision: 2 });
            expect(await runtimeReady(f.ctx, ready)).toBe(true);
            expect(f.row(f.state._id)).toMatchObject({ status: 'ready', revision: 2, appliedRevision: 1 });
            expect(f.scheduled).toHaveLength(1);
            expect(f.scheduled[0]?.args).toEqual({ projectId: f.projectId, branchId: f.branchId });
        } finally { clock.mockRestore(); }
    });
});
