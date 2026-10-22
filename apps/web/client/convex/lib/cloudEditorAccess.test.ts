import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { access, assertImportedReleasePublisher, hasCloudPublicationGrant, listMembers, removeMember, requireCloudAccess, requireImportedReleaseAccess, setMember } from '../cloudEditorAccess';
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
                    paginate: async ({ numItems, cursor }: { numItems: number; cursor: string | null }) => {
                        const start = Number(cursor ?? 0), found = rows();
                        return { page: found.slice(start, start + numItems), isDone: start + numItems >= found.length, continueCursor: String(start + numItems) };
                    },
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
    it('offers source preparation only to current designers with ordinary edit access and both features enabled', async () => {
        const prior = process.env.WEBLAB_CLOUD_IMPORTS_ENABLED;
        try {
            process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'true';
            const f = fixture();
            f.get('cloudEditorStates:one')!.profile = 'imported-source-v1';
            expect(await access._handler(f.ctx, scope)).toMatchObject({ canPrepareImport: true, canDesign: false, canPreview: false, canEditContent: false, canPublish: false });
            f.get('projectMembers:creator')!.role = 'viewer';
            expect((await access._handler(f.ctx, scope)).canPrepareImport).toBe(false);
            f.get('projectMembers:creator')!.role = 'manager';
            process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'false';
            expect((await access._handler(f.ctx, scope)).canPrepareImport).toBe(false);
            process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'true';
            process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
            expect((await access._handler(f.ctx, scope)).canPrepareImport).toBe(false);
        } finally {
            if (prior === undefined) delete process.env.WEBLAB_CLOUD_IMPORTS_ENABLED;
            else process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = prior;
        }
    });

    it('gives only the enrolled creator implicit responsibility, with explicit grants taking precedence', async () => {
        const f = fixture();
        expect(await access._handler(f.ctx, scope)).toEqual({ actorId: 'users:creator', role: 'responsible', canDesign: true, canPrepareImport: false, canEditContent: true, canPreview: true, canPublish: true, canManage: true });
        f.grant('creator', 'responsible', false);
        expect((await access._handler(f.ctx, scope)).canPublish).toBe(false);
        for (const name of ['manager', 'admin', 'owner']) {
            f.signIn(name);
            expect(await access._handler(f.ctx, scope)).toEqual({ actorId: `users:${name}`, role: null, canDesign: false, canPrepareImport: false, canEditContent: false, canPreview: false, canPublish: false, canManage: false });
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
        expect(await access._handler(f.ctx, scope)).toEqual({ actorId: 'users:designer', role: 'responsible', canDesign: false, canPrepareImport: false, canEditContent: true, canPreview: true, canPublish: false, canManage: false });
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
        expect(await access._handler(f.ctx, scope)).toEqual({ actorId: 'users:content', role: 'content', canDesign: false, canPrepareImport: false, canEditContent: true, canPreview: true, canPublish: true, canManage: false });
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


describe('immutable imported version current access', () => {
    it('uses current cloud role and ordinary view without reading mutable preparation or source', async () => {
        const f = fixture(); Object.assign(f.get('cloudEditorStates:one')!, { profile: 'imported-next-v1', preparationId: 'cloudEditorImportPreparations:missing' });
        f.signIn('content'); f.grant('content', 'content', true);
        const current = await requireImportedReleaseAccess(f.ctx, scope);
        expect(current).toMatchObject({ role: 'content', canDesign: false, publicationGrant: true });
        expect(f.writes).toEqual([]);
        f.grant('content', 'content', false);
        expect((await requireImportedReleaseAccess(f.ctx, scope)).publicationGrant).toBe(false);
        f.table('projectMembers').delete('projectMembers:content'); f.table('workspaceMembers').delete('workspaceMembers:content');
        await expect(requireImportedReleaseAccess(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
    });
    it('keeps raw/unrelated scopes and ordinary-access-only users out of retained imported controls', async () => {
        const f = fixture();
        await expect(requireImportedReleaseAccess(f.ctx, scope)).rejects.toThrow('CLOUD_NOT_ENROLLED');
        f.get('cloudEditorStates:one')!.profile = 'imported-next-v1';
        f.signIn('admin'); await expect(requireImportedReleaseAccess(f.ctx, scope)).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        f.signIn('creator'); f.get('cloudEditorStates:one')!.workspaceId = 'workspaces:foreign';
        await expect(requireImportedReleaseAccess(f.ctx, scope)).rejects.toThrow('CLOUD_NOT_ENROLLED');
    });
    it('shares the exact independent grant rule and keeps public builds agency-only behind the default-off gate', async () => {
        expect(hasCloudPublicationGrant('responsible', undefined, true)).toBe(true);
        expect(hasCloudPublicationGrant('responsible', false, true)).toBe(false);
        expect(hasCloudPublicationGrant('content', true, false)).toBe(true);
        expect(hasCloudPublicationGrant(null, true, false)).toBe(false);
        const key = 'WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED', prior = process.env[key];
        try {
            delete process.env[key];
            expect(() => assertImportedReleasePublisher({ publicationGrant: true, canDesign: false })).toThrow('CLOUD_IMPORTED_PUBLICATION_DISABLED');
            process.env[key] = 'true';
            expect(() => assertImportedReleasePublisher({ publicationGrant: true, canDesign: false })).not.toThrow();
            expect(() => assertImportedReleasePublisher({ publicationGrant: true, canDesign: false }, true)).toThrow('CLOUD_RELEASE_NOT_ALLOWED');
            expect(() => assertImportedReleasePublisher({ publicationGrant: false, canDesign: true }, true)).toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        } finally { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; }
    });
});
