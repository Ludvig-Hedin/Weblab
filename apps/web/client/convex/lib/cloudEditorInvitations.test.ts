import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _create, _claim, list, revoke } from '../cloudEditorInvitations';
import { hashPreparationPolicy } from './cloudImportedState';

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
const oldImportedGate = process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED;
beforeEach(() => {
    process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true';
    process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
});
afterEach(() => {
    if (oldGate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED; else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = oldGate;
    if (oldImportedGate === undefined) delete process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED;
    else process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = oldImportedGate;
});
const tokenHash = 'a'.repeat(64);
async function invitation(f: ReturnType<typeof fixture>) {
    return _create._handler(f.ctx, { ...scope, subject: 'creator', email: ' NEW@example.com ', role: 'content', publish: true, tokenHash });
}
function claimArgs(invitationId: Id<'cloudEditorInvitations'>) {
    return { invitationId, tokenHash, subject: 'outsider', verifiedEmails: ['new@example.com'], verifiedAt: Date.now() };
}

/** Actual prepared-source authority, including the current policy and file pins. */
async function importedFixture() {
    const f = fixture();
    const sources = {
        'package.json': '{}', 'bun.lock': '{}', 'next.config.ts': 'export default {};',
        'tsconfig.json': '{}', 'public/weblab-preload-script.js': 'void 0;',
        'public/weblab-ix-runtime.js': 'void 0;',
        'src/app/layout.tsx': 'export default function Layout({children}) { return <html><body>{children}</body></html>; }',
    };
    const pinnedFiles = Object.entries(sources).map(([path, text]) => {
        const file = { path, hash: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) };
        f.put('cloudEditorFiles', `cloudEditorFiles:${path}`, { ...scope, ...file, text, kind: 'file' });
        return file;
    });
    const policy = {
        kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const,
        next: '16.3.1' as const, install: 'frozen-ignore-scripts' as const,
        dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed', pinnedFiles,
    };
    f.put('cloudEditorImports', 'cloudEditorImports:baseline', {
        ...scope, workspaceId, state: 'finalized', manifestHash: 'a'.repeat(64),
    });
    f.put('cloudEditorImportPreparations', 'cloudEditorImportPreparations:one', {
        ...scope, workspaceId, baselineAttemptId: 'cloudEditorImports:baseline',
        generation: 1, profileVersion: 1, preparationVersion: 1, inputRevision: 1, preparedRevision: 2,
        baselineManifestHash: 'a'.repeat(64), inputManifestHash: 'a'.repeat(64), preparedManifestHash: 'b'.repeat(64),
        policy: { ...policy, policyHash: await hashPreparationPolicy(policy) },
    });
    Object.assign(f.get('cloudEditorStates:one')!, {
        profile: 'imported-next-v1', revision: 3, designRevision: 2, preparationId: 'cloudEditorImportPreparations:one',
    });
    const id = await invitation(f);
    f.signIn('outsider');
    await _claim._handler(f.ctx, claimArgs(id));
    return { ...f, id };
}

describe('accepted imported invitation reconciliation', () => {
    it('reconciles a lost claim reply and reopens later without restoring changed grants', async () => {
        const f = await importedFixture();
        const before = f.writes.length;
        expect(await _claim._handler(f.ctx, claimArgs(f.id))).toEqual(scope);
        const grant = [...f.table('cloudEditorGrants').values()].find(row => row.userId === 'users:outsider')!;
        grant.publish = false;
        f.get(f.id)!.expiresAt = 0;
        f.signIn(null); f.signIn('outsider');
        expect(await _claim._handler(f.ctx, claimArgs(f.id))).toEqual(scope);
        expect(grant.role).toBe('content'); expect(grant.publish).toBe(false);
        expect(f.writes.length).toBe(before);
        expect([...f.table('projectMembers').values()].filter(row => row.userId === 'users:outsider')).toHaveLength(1);
        expect([...f.table('cloudEditorGrants').values()].filter(row => row.userId === 'users:outsider')).toHaveLength(1);
    });
    for (const table of ['projectMembers', 'cloudEditorGrants']) {
        it(`refuses reopening after current ${table} removal without recreating access`, async () => {
            const f = await importedFixture();
            for (const [key, row] of f.table(table)) if (row.userId === 'users:outsider') f.table(table).delete(key);
            const before = f.writes.length;
            await expect(_claim._handler(f.ctx, claimArgs(f.id))).rejects.toThrow();
            expect(f.writes.length).toBe(before);
            expect([...f.table(table).values()].some(row => row.userId === 'users:outsider')).toBe(false);
        });
    }
    it('refuses reopening when imported customer source visibility is paused', async () => {
        const f = await importedFixture(); const before = f.writes.length;
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
        await expect(_claim._handler(f.ctx, claimArgs(f.id))).rejects.toThrow('CLOUD_INVITATION_UNAVAILABLE');
        expect(f.writes.length).toBe(before);
    });
    it('refuses reopening after preparation revocation or pinned source drift', async () => {
        const f = await importedFixture(); const before = f.writes.length;
        const state = f.get('cloudEditorStates:one')!;
        state.preparationId = 'cloudEditorImportPreparations:missing';
        await expect(_claim._handler(f.ctx, claimArgs(f.id))).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
        state.preparationId = 'cloudEditorImportPreparations:one';
        f.get('cloudEditorFiles:next.config.ts')!.text = 'export default {changed: true};';
        await expect(_claim._handler(f.ctx, claimArgs(f.id))).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
        expect(f.writes.length).toBe(before);
    });
    it('still binds accepted receipts to the verified email, token and canonical accepting actor', async () => {
        const f = await importedFixture(); const before = f.writes.length;
        for (const patch of [{ verifiedEmails: ['wrong@example.com'] }, { tokenHash: 'b'.repeat(64) },
            { subject: 'creator' }, { verifiedAt: Date.now() - 61_000 }]) {
            await expect(_claim._handler(f.ctx, { ...claimArgs(f.id), ...patch })).rejects.toThrow('CLOUD_INVITATION_UNAVAILABLE');
        }
        f.signIn('creator');
        await expect(_claim._handler(f.ctx, { ...claimArgs(f.id), subject: 'creator' })).rejects.toThrow('CLOUD_INVITATION_UNAVAILABLE');
        expect(f.writes.length).toBe(before);
    });
});
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

describe('invitation-only canonical identity admission', () => {
    it('validates token, email, expiry and current issuer before creating a missing canonical user', async () => {
        for (const failure of ['token', 'email', 'expiry', 'issuer'] as const) {
            const f = fixture(); const id = await invitation(f);
            f.table('users').delete('users:outsider'); f.signIn('outsider');
            const args = claimArgs(id);
            if (failure === 'token') args.tokenHash = 'b'.repeat(64);
            if (failure === 'email') args.verifiedEmails = ['wrong@example.com'];
            if (failure === 'expiry') f.get(id)!.expiresAt = 0;
            if (failure === 'issuer') f.get('projectMembers:creator')!.role = 'editor';
            const before = f.writes.length;
            await expect(_claim._handler(f.ctx, args)).rejects.toThrow('CLOUD_INVITATION_UNAVAILABLE');
            expect(f.writes.length).toBe(before);
            expect([...f.table('users').values()].some(row => row.clerkUserId === 'outsider')).toBe(false);
        }
    });

    it('can create a missing Convex identity for an existing authenticated Clerk account during claim', async () => {
        const f = fixture(); const id = await invitation(f);
        f.table('users').delete('users:outsider'); f.signIn('outsider');
        expect(await _claim._handler(f.ctx, claimArgs(id))).toEqual(scope);
        const user = [...f.table('users').values()].find(row => row.clerkUserId === 'outsider')!;
        expect(user).toBeDefined();
        expect(f.get(id)?.acceptedBy).toBe(user._id);
        expect([...f.table('projectMembers').values()].find(row => row.userId === user._id)?.role).toBe('viewer');
        expect([...f.table('cloudEditorGrants').values()].find(row => row.userId === user._id)?.publish).toBe(true);
        expect([...f.table('workspaceMembers').values()].some(row => row.userId === user._id)).toBe(false);
    });

    it('preserves the primary stored email when a different verified alias accepts', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        await _claim._handler(f.ctx, claimArgs(id));
        expect(f.get('users:outsider')?.email).toBe('outsider@example.com');
    });

    it('accepted replay cannot recreate a missing user or remove duplicate identity rows', async () => {
        const f = fixture(); const id = await invitation(f); f.signIn('outsider');
        await _claim._handler(f.ctx, claimArgs(id));
        f.put('users', 'users:later', { clerkUserId: 'outsider', email: 'later@example.com', _creationTime: 2 });
        const before = f.writes.length;
        expect(await _claim._handler(f.ctx, claimArgs(id))).toEqual(scope);
        expect(f.get('users:later')).not.toBeNull();
        expect(f.writes.length).toBe(before);
        f.table('users').delete('users:outsider'); f.table('users').delete('users:later');
        await expect(_claim._handler(f.ctx, claimArgs(id))).rejects.toThrow('CLOUD_INVITATION_UNAVAILABLE');
        expect(f.writes.length).toBe(before);
        expect([...f.table('users').values()].some(row => row.clerkUserId === 'outsider')).toBe(false);
    });
});
