import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _create, _claim, list, revoke } from '../cloudEditorInvitations';

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
const tokenHash = 'a'.repeat(64);
async function invitation(f: ReturnType<typeof fixture>) {
    return _create._handler(f.ctx, { ...scope, subject: 'creator', email: ' NEW@example.com ', role: 'content', publish: true, tokenHash });
}
function claimArgs(invitationId: Id<'cloudEditorInvitations'>) {
    return { invitationId, tokenHash, subject: 'outsider', verifiedEmails: ['new@example.com'], verifiedAt: Date.now() };
}
describe('cloud invitation authority and one-use claim', () => {
    it('creates email-bound hash-only invitations and never returns tokens in the manager list', async () => {
        const f = fixture(); const id = await invitation(f);
        expect(f.get(id)?.email).toBe('new@example.com');
        const rows = await list._handler(f.ctx, scope);
        expect(rows).toHaveLength(1); expect(rows[0]).not.toHaveProperty('tokenHash');
        expect(f.get(id)).not.toHaveProperty('token');
    });
    it('requires current manager permission and pins the action actor', async () => {
        const f = fixture();
        await expect(_create._handler(f.ctx, { ...scope, subject: 'outsider', email: 'new@example.com', role: 'content', publish: true, tokenHash })).rejects.toThrow();
        f.grant('content', 'content'); f.signIn('content');
        await expect(invitation(f)).rejects.toThrow(); expect(f.table('cloudEditorInvitations').size).toBe(0);
    });
    it('claims atomically with project-only viewer and distinct publish grant, and retries without rewriting roles', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        expect(await _claim._handler(f.ctx, claimArgs(id))).toEqual(scope);
        const members = [...f.table('projectMembers').values()].filter(r => r.userId === 'users:outsider');
        expect(members).toHaveLength(1); expect(members[0]?.role).toBe('viewer');
        expect([...f.table('workspaceMembers').values()].some(r => r.userId === 'users:outsider')).toBe(false);
        const grants = [...f.table('cloudEditorGrants').values()].filter(r => r.userId === 'users:outsider');
        expect(grants[0]?.publish).toBe(true); expect(grants[0]?.role).toBe('content');
        const before = f.writes.length; expect(await _claim._handler(f.ctx, claimArgs(id))).toEqual(scope);
        expect(f.writes.length).toBe(before);
    });
    it('rejects mismatched email, token, actor and stale verification without consuming invitation', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        for (const patch of [{ verifiedEmails: ['wrong@example.com'] }, { tokenHash: 'b'.repeat(64) }, { subject: 'creator' }, { verifiedAt: Date.now() - 61_000 }, { verifiedAt: Date.now() + 60_000 }]) {
            await expect(_claim._handler(f.ctx, { ...claimArgs(id), ...patch })).rejects.toThrow();
        }
        expect(f.get(id)?.status).toBe('pending');
        expect([...f.table('cloudEditorGrants').values()]).toHaveLength(0);
    });
    it('rejects expired and revoked invitations', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        f.get(id)!.expiresAt = 0; await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow();
        f.get(id)!.expiresAt = Date.now() + 60_000; f.signIn('creator');
        await revoke._handler(f.ctx, { ...scope, invitationId: id }); f.signIn('outsider');
        await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow();
    });
    it('rechecks issuer authority after a role downgrade', async () => {
        const f = fixture(); const id = await invitation(f);
        f.get('projectMembers:creator')!.role = 'editor'; f.signIn('outsider');
        await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow();
        expect(f.get(id)?.status).toBe('pending');
    });
    it('does not overwrite an existing project membership or grant', async () => {
        const f = fixture(); const id = await invitation(f);
        f.put('projectMembers', 'projectMembers:outsider', { projectId: scope.projectId, userId: 'users:outsider', role: 'editor' });
        f.signIn('outsider'); await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow('CLOUD_INVITATION_MEMBER_EXISTS');
        expect(f.get('projectMembers:outsider')?.role).toBe('editor');
    });
    it('an accepted link never recreates removed membership', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        await _claim._handler(f.ctx, claimArgs(id));
        for (const [key,row] of f.table('projectMembers')) if (row.userId === 'users:outsider') f.table('projectMembers').delete(key);
        for (const [key,row] of f.table('cloudEditorGrants')) if (row.userId === 'users:outsider') f.table('cloudEditorGrants').delete(key);
        await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow();
        expect([...f.table('cloudEditorGrants').values()]).toHaveLength(0);
    });
    it('refuses customer role for a workspace administrator', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        f.put('workspaceMembers', 'workspaceMembers:outsider', { workspaceId, userId: 'users:outsider', role: 'admin' });
        await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow('CLOUD_WORKSPACE_AUTHORITY_CONFLICT');
    });
    it('refuses duplicate pending links and outsiders cannot list or revoke them', async () => {
        const f = fixture(); const id = await invitation(f);
        await expect(invitation(f)).rejects.toThrow('CLOUD_INVITATION_EXISTS');
        f.signIn('outsider'); await expect(list._handler(f.ctx, scope)).rejects.toThrow();
        await expect(revoke._handler(f.ctx, { ...scope, invitationId: id })).rejects.toThrow();
    });
    it('deleting or replacing enrollment invalidates pending claims', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        f.table('cloudEditorStates').clear();
        await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow();
    });
});

it('a removal tombstone invalidates invitations issued to a verified alias before removal', async () => {
    const f = fixture(); const id = await invitation(f);
    f.put('cloudEditorMemberRemovals', 'cloudEditorMemberRemovals:one', { projectId: scope.projectId, userId: 'users:outsider', removedAt: Date.now() });
    f.signIn('outsider');
    await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow('CLOUD_INVITATION_UNAVAILABLE');
    expect(f.get(id)?.status).toBe('pending');
    expect([...f.table('cloudEditorGrants').values()]).toHaveLength(0);
});
