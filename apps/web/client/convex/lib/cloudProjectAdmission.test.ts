import { describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { can } from './auth';
import { createCloudProjectCapabilityResolver } from './cloudProjectAdmission';
import { getUserByClerkIdSafe, requireCap } from './permissions';

const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
type Row = Record<string, unknown> & { _id: string; _creationTime: number };

function fixture() {
    const rows = new Map<string, Row>();
    const put = (id: string, value: Record<string, unknown>) => rows.set(id, { _id: id, _creationTime: 1, ...value });
    let subject: string | null = 'client';
    put('users:client', { clerkUserId: 'client', email: 'client@example.com' });
    put('workspaces:one', { createdByUserId: 'users:owner' });
    put(scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put(scope.branchId, { projectId: scope.projectId });
    put('cloudEditorStates:one', { ...scope, workspaceId: 'workspaces:one', version: 1, createdByUserId: 'users:owner' });
    put('projectMembers:client', { projectId: scope.projectId, userId: 'users:client', role: 'viewer' });
    put('cloudEditorGrants:client', { projectId: scope.projectId, userId: 'users:client', role: 'content', publish: false });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, email: `${subject}@example.com`, tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => rows.get(id) ?? null,
            query: (table: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const matches = () => [...rows.values()].filter(row => row._id.startsWith(`${table}:`) && constraints.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => matches(),
                    unique: async () => { const values = matches(); if (values.length > 1) throw new Error('Nonunique'); return values[0] ?? null; },
                };
                return query;
            },
        },
    } as unknown as MutationCtx;
    // Explicitly mirror the preserved remote getOptionalUser gate. Local main
    // does not contain this gate; tests must not accidentally exercise only it.
    const remoteOptional = async (context: Parameters<typeof requireCap>[0]) => {
        const identity = await context.auth.getUserIdentity();
        if (!identity) return null;
        const user = await getUserByClerkIdSafe(context, identity.subject);
        const email = (user?.email ?? identity.email)?.trim().toLowerCase();
        return user && email === 'owner@example.com' ? user : null;
    };
    const ordinaryCalls: string[] = [];
    const remoteCap: typeof requireCap = async (context, capability, target) => {
        ordinaryCalls.push(capability);
        if (!await remoteOptional(context)) throw new Error('UNAUTHORIZED');
        return requireCap(context, capability, target);
    };
    return { ctx, rows, put, remoteOptional, remoteCap, ordinaryCalls,
        admit: createCloudProjectCapabilityResolver({ getOptionalUser: remoteOptional, requireCap: remoteCap }),
        signIn: (value: string | null) => { subject = value; } };
}

describe('explicit cloud project admission behind the remote sign-in allowlist', () => {
    it('admits only the current exact project member and grant, without general admission', async () => {
        const f = fixture();
        expect(await f.remoteOptional(f.ctx)).toBeNull();
        await expect(f.remoteCap(f.ctx, 'project.view', scope)).rejects.toThrow('UNAUTHORIZED');
        const result = await f.admit(f.ctx, scope);
        expect(result.user._id).toBe('users:client');
        expect(result.project?._id).toBe(scope.projectId);
        expect(result.workspaceRole).toBeNull();
        expect(result.projectRole).toBe('viewer');
        expect(can('project.update', { workspace: { id: result.workspace._id, createdByUserId: result.workspace.createdByUserId },
            workspaceRole: result.workspaceRole, project: { id: scope.projectId, workspaceId: result.workspace._id, accessMode: 'restricted' },
            projectRole: result.projectRole })).toBe(false);
        expect(await f.remoteOptional(f.ctx)).toBeNull();
        expect(f.ordinaryCalls).toEqual(['project.view']);
    });

    it('delegates admitted users unchanged and never retries a capability failure through the exception', async () => {
        const f = fixture(); f.rows.get('users:client')!.email = 'owner@example.com';
        expect((await f.admit(f.ctx, scope)).user._id).toBe('users:client');
        expect(f.ordinaryCalls).toEqual(['project.view']);
        const resolver = createCloudProjectCapabilityResolver({ getOptionalUser: f.remoteOptional,
            requireCap: async () => { throw new Error('ordinary capability failure'); } });
        await expect(resolver(f.ctx, scope)).rejects.toThrow('ordinary capability failure');
    });

    it('does not convert a failed identity lookup into scoped admission', async () => {
        const f = fixture();
        const resolver = createCloudProjectCapabilityResolver({
            getOptionalUser: async () => { throw new Error('identity unavailable'); }, requireCap: f.remoteCap,
        });
        await expect(resolver(f.ctx, scope)).rejects.toThrow('identity unavailable');
    });

    it('keeps current admission available for receipt reads when the editor write gate is paused', async () => {
        const prior = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
        try {
            process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
            const f = fixture();
            expect((await f.admit(f.ctx, scope)).user._id).toBe('users:client');
            f.rows.delete('cloudEditorGrants:client');
            await expect(f.admit(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        } finally {
            if (prior === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
            else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = prior;
        }
    });

    for (const removed of ['projectMembers:client', 'cloudEditorGrants:client']) {
        it(`ends the exception immediately after removing ${removed}`, async () => {
            const f = fixture(); await f.admit(f.ctx, scope); f.rows.delete(removed);
            await expect(f.admit(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        });
    }

    it('requires an authenticated existing canonical user and never performs JIT', async () => {
        const f = fixture(); f.signIn(null);
        await expect(f.admit(f.ctx, scope)).rejects.toThrow('UNAUTHORIZED');
        f.signIn('client'); f.rows.delete('users:client');
        await expect(f.admit(f.ctx, scope)).rejects.toThrow('UNAUTHORIZED');
        expect([...f.rows.keys()].some(id => id.startsWith('users:'))).toBe(false);
    });

    it('uses only the earliest canonical actor when duplicate identity rows exist', async () => {
        const f = fixture();
        f.put('users:earliest', { clerkUserId: 'client', email: 'client@example.com', _creationTime: 0 });
        await expect(f.admit(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        f.rows.get('projectMembers:client')!.userId = 'users:earliest';
        f.rows.get('cloudEditorGrants:client')!.userId = 'users:earliest';
        expect((await f.admit(f.ctx, scope)).user._id).toBe('users:earliest');
        expect(f.rows.has('users:client')).toBe(true);
    });

    it('does not infer admission from workspace ownership, creator status or workspace access mode', async () => {
        const f = fixture();
        f.rows.get(scope.projectId)!.accessMode = 'workspace';
        f.rows.get('workspaces:one')!.createdByUserId = 'users:client';
        f.rows.get('cloudEditorStates:one')!.createdByUserId = 'users:client';
        f.put('workspaceMembers:client', { workspaceId: 'workspaces:one', userId: 'users:client', role: 'owner' });
        f.rows.delete('projectMembers:client');
        await expect(f.admit(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        f.put('projectMembers:client', { projectId: scope.projectId, userId: 'users:client', role: 'manager' });
        f.rows.delete('cloudEditorGrants:client');
        await expect(f.admit(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
    });

    for (const [row, field, value] of [
        [scope.branchId, 'projectId', 'projects:other'],
        ['cloudEditorStates:one', 'projectId', 'projects:other'],
        ['cloudEditorStates:one', 'workspaceId', 'workspaces:other'],
        ['cloudEditorStates:one', 'version', 2],
    ] as const) {
        it(`rejects a changed ${row}.${field}`, async () => {
            const f = fixture(); f.rows.get(row)![field] = value;
            await expect(f.admit(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        });
    }

    for (const removed of [scope.projectId, scope.branchId, 'cloudEditorStates:one', 'workspaces:one']) {
        it(`requires current enrollment and linkage after ${removed} disappears`, async () => {
            const f = fixture(); f.rows.delete(removed);
            await expect(f.admit(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        });
    }

    it('cannot use one project grant for another enrolled project or branch', async () => {
        const f = fixture();
        f.put('projects:other', { workspaceId: 'workspaces:one', accessMode: 'restricted' });
        f.put('branches:other', { projectId: 'projects:other' });
        f.put('cloudEditorStates:other', { projectId: 'projects:other', branchId: 'branches:other', workspaceId: 'workspaces:one', version: 1 });
        await expect(f.admit(f.ctx, { projectId: 'projects:other' as Id<'projects'>, branchId: 'branches:other' as Id<'branches'> })).rejects.toThrow('FORBIDDEN');
        await expect(f.admit(f.ctx, { ...scope, branchId: 'branches:other' as Id<'branches'> })).rejects.toThrow('FORBIDDEN');
    });
});
