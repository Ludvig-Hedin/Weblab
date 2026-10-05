import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getFunctionName } from 'convex/server';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _reserveRuntime, _sealDependencies, ensurePreview } from '../cloudEditor';
import { authorizeCloudPreviewStart, setPreviewAllowance } from '../cloudEditorAccess';

type Row = Record<string, unknown> & { _id: string };
const scope = {
    projectId: 'projects:one' as Id<'projects'>,
    branchId: 'branches:one' as Id<'branches'>,
};
const builder = 'users:builder' as Id<'users'>;
const customer = 'users:customer' as Id<'users'>;
const stateId = 'cloudEditorStates:one';

// Real handlers and permission logic; this fixture replaces only database/session IO.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string): Map<string, Row> => {
        let rows = tables.get(name);
        if (!rows) {
            rows = new Map();
            tables.set(name, rows);
        }
        return rows;
    };
    const put = (name: string, id: string, data: Record<string, unknown>) =>
        table(name).set(id, { _id: id, _creationTime: 1, ...data });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let actor = 'builder';
    let sequence = 0;
    const scheduled: Array<{ name: string; args: unknown }> = [];
    put('workspaces', 'workspaces:one', { createdByUserId: builder });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const name of ['builder', 'customer']) {
        put('users', `users:${name}`, { clerkUserId: name });
        put('workspaceMembers', `workspaceMembers:${name}`, {
            workspaceId: 'workspaces:one',
            userId: `users:${name}`,
            role: 'member',
        });
        put('projectMembers', `projectMembers:${name}`, {
            projectId: scope.projectId,
            userId: `users:${name}`,
            role: name === 'builder' ? 'manager' : 'viewer',
        });
    }
    put('cloudEditorGrants', 'cloudEditorGrants:customer', {
        projectId: scope.projectId,
        userId: customer,
        role: 'content',
        publish: false,
    });
    put('cloudEditorStates', stateId, {
        ...scope,
        workspaceId: 'workspaces:one',
        createdByUserId: builder,
        version: 1,
        revision: 1,
        generation: 0,
        status: 'stopped',
        bytes: 10,
        fileCount: 1,
        contentPreviewAllowance: {
            remainingStarts: 2,
            expiresAt: Date.now() + 60_000,
            generation: 1,
        },
    });
    put('cloudEditorFiles', 'cloudEditorFiles:lock', {
        ...scope,
        path: 'bun.lock',
        kind: 'file',
        text: '{}',
        bytes: 2,
    });
    const ctx = {
        auth: {
            getUserIdentity: async () => ({ subject: actor, tokenIdentifier: `issuer|${actor}` }),
        },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, data: Record<string, unknown>) => {
                const id = `${name}:${++sequence}`;
                put(name, id, data);
                return id;
            },
            patch: async (id: string, data: Record<string, unknown>) => {
                Object.assign(get(id)!, data);
            },
            replace: async (id: string, data: Record<string, unknown>) => {
                put(id.split(':')[0]!, id, data);
            },
            query: (name: string) => {
                const clauses: Array<[string, unknown]> = [];
                const index = {
                    eq: (key: string, value: unknown) => {
                        clauses.push([key, value]);
                        return index;
                    },
                };
                const rows = () =>
                    [...table(name).values()].filter((row) =>
                        clauses.every(([key, value]) => row[key] === value),
                    );
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => {
                        build(index);
                        return query;
                    },
                    collect: async () => rows(),
                    take: async (limit: number) => rows().slice(0, limit),
                    unique: async () => {
                        const found = rows();
                        if (found.length > 1) throw new Error('Duplicate');
                        return found[0] ?? null;
                    },
                };
                return query;
            },
        },
        scheduler: {
            runAfter: async (
                _delay: number,
                ref: Parameters<typeof getFunctionName>[0],
                args: unknown,
            ) => {
                scheduled.push({ name: getFunctionName(ref), args });
            },
        },
    } as unknown as MutationCtx;
    const state = () => get(stateId)!;
    const request = () =>
        state().previewStartRequest as {
            generation: number;
            actorId: Id<'users'>;
            kind: string;
            expiresAt: number;
            reservedToken?: string;
        };
    const lease = () =>
        Object.assign(state(), { leaseToken: 'lease-one', leaseUntil: Date.now() + 60_000 });
    const reserve = () =>
        _reserveRuntime._handler(ctx, {
            ...scope,
            token: 'lease-one',
            requestGeneration: request().generation,
        });
    return {
        ctx,
        get,
        put,
        table,
        state,
        request,
        lease,
        reserve,
        scheduled,
        signIn: (name: string) => {
            actor = name;
        },
    };
}

const gate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
beforeEach(() => {
    process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true';
});
afterEach(() => {
    if (gate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
    else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = gate;
});

describe('cloud preview start reservations', () => {
    it('deduplicates queued customer requests and allocates each reservation once', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        await ensurePreview._handler(f.ctx, scope);
        expect(f.scheduled).toHaveLength(1);
        expect(f.scheduled[0]).toEqual({
            name: 'cloudEditorRuntime:sync',
            args: { ...scope, allowCreate: true, requestGeneration: 1 },
        });
        expect(f.state().contentPreviewAllowance).toMatchObject({ remainingStarts: 1 });
        expect(f.request()).toMatchObject({ actorId: customer, kind: 'content' });
        f.lease();
        expect(await f.reserve()).toBe(true);
        expect(await f.reserve()).toBe(false);
        expect(f.table('cloudEditorSlots').size).toBe(1);
        expect(f.state().runtimeStarts).toHaveLength(1);
    });

    it('revoking the role or ordinary project access after scheduling prevents allocation', async () => {
        for (const revokedTable of ['cloudEditorGrants', 'projectMembers']) {
            const f = fixture();
            f.signIn('customer');
            await ensurePreview._handler(f.ctx, scope);
            f.lease();
            f.table(revokedTable).delete(`${revokedTable}:customer`);
            expect(await f.reserve()).toBe(false);
            expect(f.table('cloudEditorSlots').size).toBe(0);
            expect(f.state().runtimeStarts).toBeUndefined();
        }
    });

    it('changing the allowance cancels queued work without reviving it after regrant', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        const requestGeneration = f.request().generation;
        f.signIn('builder');
        await setPreviewAllowance._handler(f.ctx, { ...scope, starts: 0 });
        expect(f.state().previewStartRequest).toBeUndefined();
        expect(f.state().contentPreviewAllowance).toMatchObject({
            remainingStarts: 0,
            generation: 2,
        });
        f.lease();
        expect(
            await _reserveRuntime._handler(f.ctx, {
                ...scope,
                token: 'lease-one',
                requestGeneration,
            }),
        ).toBe(false);
        await setPreviewAllowance._handler(f.ctx, { ...scope, starts: 2 });
        expect(await authorizeCloudPreviewStart(f.ctx, scope, requestGeneration)).toBe(false);
    });

    it('rechecks cancellation after allocation and binds the request to its worker token', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        f.lease();
        const generation = f.request().generation;
        expect(await f.reserve()).toBe(true);
        expect(await authorizeCloudPreviewStart(f.ctx, scope, generation, 'wrong-worker')).toBe(
            false,
        );
        expect(await authorizeCloudPreviewStart(f.ctx, scope, generation, 'lease-one')).toBe(true);
        f.signIn('builder');
        await setPreviewAllowance._handler(f.ctx, { ...scope, starts: 0 });
        expect(await authorizeCloudPreviewStart(f.ctx, scope, generation, 'lease-one')).toBe(false);
    });

    it('does not reserve allowance for missing builder preparation and rechecks the lock before allocation', async () => {
        const f = fixture();
        f.signIn('customer');
        f.table('cloudEditorFiles').delete('cloudEditorFiles:lock');
        await expect(ensurePreview._handler(f.ctx, scope)).rejects.toThrow(
            'CLOUD_PREVIEW_PREPARATION_REQUIRED',
        );
        expect(f.state().contentPreviewAllowance).toMatchObject({ remainingStarts: 2 });
        expect(f.scheduled).toHaveLength(0);
        const g = fixture();
        g.signIn('customer');
        await ensurePreview._handler(g.ctx, scope);
        g.lease();
        g.table('cloudEditorFiles').delete('cloudEditorFiles:lock');
        expect(await g.reserve()).toBe(false);
        await expect(
            _sealDependencies._handler(g.ctx, {
                ...scope,
                token: 'lease-one',
                revision: 1,
                text: '{}',
                hash: '0'.repeat(64),
            }),
        ).rejects.toThrow('CLOUD_PREVIEW_PREPARATION_REQUIRED');
    });

    it('rejects expired reservations, disabled gate and exhausted allowances', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        f.lease();
        f.request().expiresAt = Date.now() - 1;
        expect(await f.reserve()).toBe(false);
        f.request().expiresAt = Date.now() + 60_000;
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
        await expect(f.reserve()).rejects.toThrow('CLOUD_DISABLED');
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true';
        const g = fixture();
        g.signIn('customer');
        g.state().contentPreviewAllowance = {
            remainingStarts: 0,
            expiresAt: Date.now() + 60_000,
            generation: 1,
        };
        await expect(ensurePreview._handler(g.ctx, scope)).rejects.toThrow(
            'CLOUD_PREVIEW_ALLOWANCE_REQUIRED',
        );
    });

    it('preserves designer preparation, but rechecks designer authority before allocation', async () => {
        const f = fixture();
        f.table('cloudEditorFiles').delete('cloudEditorFiles:lock');
        f.state().contentPreviewAllowance = undefined;
        await ensurePreview._handler(f.ctx, scope);
        f.lease();
        expect(f.request().kind).toBe('design');
        expect(await f.reserve()).toBe(true);
        const g = fixture();
        await ensurePreview._handler(g.ctx, scope);
        g.lease();
        g.get('projectMembers:builder')!.role = 'viewer';
        expect(await g.reserve()).toBe(false);
    });

    it('syncing an existing customer preview schedules no permission to create', async () => {
        const f = fixture();
        f.signIn('customer');
        Object.assign(f.state(), {
            status: 'ready',
            previewGatewayVersion: 2,
            sandboxId: 'existing',
            expiresAt: Date.now() + 120_000,
            appliedRevision: 0,
        });
        await ensurePreview._handler(f.ctx, scope);
        expect(f.scheduled).toEqual([{ name: 'cloudEditorRuntime:sync', args: scope }]);
        expect(f.state().previewStartRequest).toBeUndefined();
        expect(f.state().contentPreviewAllowance).toMatchObject({ remainingStarts: 2 });
    });
});
