import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { access, listMembers, removeMember, requireCloudAccess, setMember } from '../cloudEditorAccess';
import { requireCap } from './permissions';

const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
type Row = Record<string, unknown> & { _id: string };

// Exercises registered handlers and the real permissions matrix. Only database
// and auth IO are in memory; this does not simulate Convex rollback/validators.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => {
        let rows = tables.get(name);
        if (!rows) { rows = new Map(); tables.set(name, rows); }
        return rows;
    };
    const put = (name: string, id: string, values: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...values });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject: string | null = 'creator';
    let sequence = 0;
    const writes: string[] = [];
    put('workspaces', workspaceId, { createdByUserId: 'users:owner' });
    put('projects', scope.projectId, { workspaceId, accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId, version: 1, createdByUserId: 'users:creator' });
    for (const name of ['creator', 'designer', 'content', 'manager', 'admin', 'owner', 'outsider']) {
        put('users', `users:${name}`, { clerkUserId: name, email: `${name}@example.com`, displayName: name });
        if (name !== 'outsider') put('workspaceMembers', `workspaceMembers:${name}`, {
            workspaceId, userId: `users:${name}`, role: name === 'admin' ? 'admin' : name === 'owner' ? 'owner' : 'member',
        });
        if (name !== 'outsider') put('projectMembers', `projectMembers:${name}`, {
            projectId: scope.projectId, userId: `users:${name}`, role: name === 'content' ? 'viewer' : name === 'designer' ? 'editor' : 'manager',
        });
    }
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, values: Record<string, unknown>) => {
                const id = `${name}:${++sequence}`; put(name, id, values); writes.push(`insert:${name}`); return id;
            },
            patch: async (id: string, values: Record<string, unknown>) => { Object.assign(get(id)!, values); writes.push(`patch:${id}`); },
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); writes.push(`delete:${id}`); },
            query: (name: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => constraints.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => rows(), take: async (n: number) => rows().slice(0, n),
                    unique: async () => { const found = rows(); if (found.length > 1) throw new Error('Nonunique row'); return found[0] ?? null; },
                };
                return query;
            },
        },
    } as unknown as MutationCtx;
    const grant = (name: string, role: 'responsible' | 'designer' | 'content', publish = false) => put('cloudEditorGrants', `cloudEditorGrants:${name}`, {
        projectId: scope.projectId, userId: `users:${name}`, role, publish, updatedAt: 1,
    });
    return { ctx, table, put, get, writes, grant, signIn: (name: string | null) => { subject = name; } };
}

const oldGate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
beforeEach(() => { process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true'; });
afterEach(() => { if (oldGate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED; else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = oldGate; });

describe('cloud customer access foundation', () => {
    it('gives only the enrolled creator implicit responsibility, with explicit grants taking precedence', async () => {
        const f = fixture();
        expect(await access._handler(f.ctx, scope)).toEqual({ role: 'responsible', canDesign: true, canEditContent: true, canPublish: true, canManage: true });
        f.grant('creator', 'responsible', false);
        expect((await access._handler(f.ctx, scope)).canPublish).toBe(false);
        for (const name of ['manager', 'admin', 'owner']) {
            f.signIn(name);
            expect(await access._handler(f.ctx, scope)).toEqual({ role: null, canDesign: false, canEditContent: false, canPublish: false, canManage: false });
            await expect(listMembers._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
            await expect(setMember._handler(f.ctx, { ...scope, email: 'outsider@example.com', role: 'responsible', publish: true })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        }
        expect(f.writes).toEqual([]);
    });

    it('requires exact project, branch, workspace enrollment and current view before reading grants', async () => {
        const f = fixture();
        f.put('branches', 'branches:other', { projectId: 'projects:other' });
        await expect(access._handler(f.ctx, { ...scope, branchId: 'branches:other' as Id<'branches'> })).rejects.toThrow('CLOUD_NOT_ENROLLED');
        f.get('cloudEditorStates:one')!.workspaceId = 'workspaces:other';
        await expect(access._handler(f.ctx, scope)).rejects.toThrow('CLOUD_NOT_ENROLLED');
        f.table('cloudEditorStates').clear();
        f.get(scope.projectId)!.tags = ['cloud-editor-v1'];
        await expect(access._handler(f.ctx, scope)).rejects.toThrow('CLOUD_NOT_ENROLLED');
        f.signIn(null);
        await expect(access._handler(f.ctx, scope)).rejects.toThrow('UNAUTHORIZED');
    });

    it('revokes effective access when ordinary access is removed even though the grant remains', async () => {
        const f = fixture();
        f.grant('designer', 'designer', true);
        f.signIn('designer');
        expect((await access._handler(f.ctx, scope)).canDesign).toBe(true);
        f.table('projectMembers').delete('projectMembers:designer');
        await expect(access._handler(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        await expect(requireCloudAccess(f.ctx, scope, 'designer')).rejects.toThrow('FORBIDDEN');
        expect(f.get('cloudEditorGrants:designer')).not.toBeNull();
        f.signIn('creator');
        f.table('projectMembers').delete('projectMembers:creator');
        await expect(access._handler(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
    });

    it('does not restore source-write authority after a legacy membership downgrade', async () => {
        const f = fixture();
        f.grant('designer', 'responsible');
        f.get('projectMembers:designer')!.role = 'viewer';
        f.signIn('designer');
        expect(await access._handler(f.ctx, scope)).toEqual({ role: 'responsible', canDesign: false, canEditContent: true, canPublish: false, canManage: false });
        await expect(requireCloudAccess(f.ctx, scope, 'designer')).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(setMember._handler(f.ctx, { ...scope, email: 'designer@example.com', role: 'responsible', publish: true })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect(f.writes).toEqual([]);
    });

    it('does not let a responsible grant restore management after manager is downgraded to editor', async () => {
        const f = fixture();
        f.grant('designer', 'responsible');
        f.get('projectMembers:designer')!.role = 'editor';
        f.signIn('designer');
        expect((await access._handler(f.ctx, scope)).canDesign).toBe(true);
        expect((await access._handler(f.ctx, scope)).canManage).toBe(false);
        await requireCloudAccess(f.ctx, scope, 'designer');
        await expect(requireCloudAccess(f.ctx, scope, 'responsible')).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(listMembers._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(setMember._handler(f.ctx, { ...scope, email: 'designer@example.com', role: 'responsible', publish: true })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(removeMember._handler(f.ctx, { ...scope, userId: 'users:content' as Id<'users'> })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect(f.get('projectMembers:designer')!.role).toBe('editor');
        expect(f.writes).toEqual([]);
    });

    it('keeps content and publishing permissions separate from source editing and management', async () => {
        const f = fixture();
        await setMember._handler(f.ctx, { ...scope, email: ' CONTENT@EXAMPLE.COM ', role: 'content', publish: true });
        expect(f.get('projectMembers:content')!.role).toBe('viewer');
        f.signIn('content');
        expect(await access._handler(f.ctx, scope)).toEqual({ role: 'content', canDesign: false, canEditContent: true, canPublish: true, canManage: false });
        await requireCloudAccess(f.ctx, scope, 'content');
        await expect(requireCloudAccess(f.ctx, scope, 'designer')).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(requireCap(f.ctx, 'project.update', { projectId: scope.projectId })).rejects.toThrow('FORBIDDEN');
        await expect(listMembers._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });

    it('maps design to ordinary editor without legacy invite authority, and grants responsibility explicitly', async () => {
        const f = fixture();
        await setMember._handler(f.ctx, { ...scope, email: 'outsider@example.com', role: 'designer', publish: false });
        expect(f.table('workspaceMembers').size).toBe(6);
        f.signIn('outsider');
        expect((await access._handler(f.ctx, scope)).canDesign).toBe(true);
        await expect(requireCap(f.ctx, 'project.invite', { projectId: scope.projectId })).rejects.toThrow('FORBIDDEN');
        await expect(setMember._handler(f.ctx, { ...scope, email: 'outsider@example.com', role: 'responsible', publish: true })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        f.signIn('creator');
        await setMember._handler(f.ctx, { ...scope, email: 'outsider@example.com', role: 'responsible', publish: false });
        f.signIn('outsider');
        expect((await access._handler(f.ctx, scope)).canManage).toBe(true);
        expect((await access._handler(f.ctx, scope)).canPublish).toBe(false);
        expect((await listMembers._handler(f.ctx, scope)).some(member => member.isCreator)).toBe(true);
    });

    it('protects the initial creator and rejects content grants that workspace authority would bypass', async () => {
        const f = fixture();
        await expect(removeMember._handler(f.ctx, { ...scope, userId: 'users:creator' as Id<'users'> })).rejects.toThrow('CLOUD_CREATOR_PROTECTED');
        await expect(setMember._handler(f.ctx, { ...scope, email: 'creator@example.com', role: 'designer', publish: false })).rejects.toThrow('CLOUD_CREATOR_PROTECTED');
        for (const name of ['owner', 'admin']) await expect(setMember._handler(f.ctx, {
            ...scope, email: `${name}@example.com`, role: 'content', publish: false,
        })).rejects.toThrow('CLOUD_WORKSPACE_AUTHORITY_CONFLICT');
        expect(f.writes).toEqual([]);
    });

    it('removes only exact project grants and membership without changing workspace roles', async () => {
        const f = fixture();
        f.grant('content', 'content', true);
        f.put('cloudEditorGrants', 'cloudEditorGrants:other', { projectId: 'projects:other', userId: 'users:content', role: 'responsible', publish: true });
        f.put('projectMembers', 'projectMembers:other', { projectId: 'projects:other', userId: 'users:content', role: 'manager' });
        await removeMember._handler(f.ctx, { ...scope, userId: 'users:content' as Id<'users'> });
        expect(f.get('cloudEditorGrants:content')).toBeNull();
        expect(f.get('projectMembers:content')).toBeNull();
        expect(f.get('cloudEditorGrants:other')).not.toBeNull();
        expect(f.get('projectMembers:other')).not.toBeNull();
        expect(f.get('workspaceMembers:content')!.role).toBe('member');
        await removeMember._handler(f.ctx, { ...scope, userId: 'users:content' as Id<'users'> });
    });

    it('rejects unknown or ambiguous signup email and honors the write gate', async () => {
        const f = fixture();
        const args = { ...scope, email: 'missing@example.com', role: 'designer' as const, publish: false };
        await expect(setMember._handler(f.ctx, args)).rejects.toThrow('CLOUD_MEMBER_NOT_FOUND');
        f.put('users', 'users:duplicate', { clerkUserId: 'duplicate', email: 'outsider@example.com' });
        await expect(setMember._handler(f.ctx, { ...args, email: 'outsider@example.com' })).rejects.toThrow('CLOUD_MEMBER_NOT_FOUND');
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
        await expect(setMember._handler(f.ctx, args)).rejects.toThrow('CLOUD_DISABLED');
        await expect(removeMember._handler(f.ctx, { ...scope, userId: 'users:content' as Id<'users'> })).rejects.toThrow('CLOUD_DISABLED');
        await expect(requireCloudAccess(f.ctx, scope, 'designer')).rejects.toThrow('CLOUD_DISABLED');
        expect((await access._handler(f.ctx, scope)).role).toBe('responsible');
        expect(f.writes).toEqual([]);
    });
});
