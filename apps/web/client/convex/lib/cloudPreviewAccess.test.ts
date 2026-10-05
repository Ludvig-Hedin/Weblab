import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHmac, createHash } from 'node:crypto';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { authorize, getCloudPreviewTicket, issue } from '../cloudPreviewAccess';

const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const privateToken = 'ab'.repeat(32);
const verifier = createHmac('sha256', privateToken).update('weblab-preview-verifier-v1').digest('hex');
type Row = Record<string, unknown> & { _id: string };

// Real registered handlers and permission code, with only auth/database IO replaced.
// This fixture does not simulate Convex rollback or argument validation.
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
    put('workspaces', 'workspaces:one', { createdByUserId: 'users:owner' });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    put('cloudEditorStates', 'cloudEditorStates:one', {
        ...scope, workspaceId: 'workspaces:one', version: 1, createdByUserId: 'users:creator',
        status: 'ready', sandboxId: 'runtime-one', expiresAt: Date.now() + 900_000,
        previewToken: privateToken, previewGatewayVersion: 2,
    });
    for (const name of ['creator', 'content', 'outsider']) {
        put('users', `users:${name}`, { clerkUserId: name, email: `${name}@example.com` });
        put('projectMembers', `projectMembers:${name}`, { projectId: scope.projectId, userId: `users:${name}`, role: name === 'creator' ? 'manager' : 'viewer' });
    }
    put('cloudEditorGrants', 'cloudEditorGrants:content', { projectId: scope.projectId, userId: 'users:content', role: 'content', publish: false });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, values: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, values); return id; },
            replace: async (id: string, values: Record<string, unknown>) => put(id.split(':')[0]!, id, values),
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); },
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
    return { ctx, table, get, put, signIn: (name: string | null) => { subject = name; } };
}
const oldGate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
beforeEach(() => { process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true'; });
afterEach(() => { if (oldGate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED; else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = oldGate; });
const denied = { allowed: false, expiresAt: null };

describe('actor-bound cloud preview tickets', () => {
    it('stores only a hash, reuses one actor row, and keeps the private runtime capability secret', async () => {
        const f = fixture();
        expect(await getCloudPreviewTicket(f.ctx, scope)).toBeNull();
        const first = await issue._handler(f.ctx, scope);
        expect(first.previewToken).toMatch(/^[a-f0-9]{64}$/);
        expect(first.previewToken).not.toBe(privateToken);
        expect(await issue._handler(f.ctx, scope)).toEqual(first);
        expect(await getCloudPreviewTicket(f.ctx, scope)).toBe(first.previewToken);
        expect(f.table('cloudPreviewTickets').size).toBe(1);
        const row = [...f.table('cloudPreviewTickets').values()][0]!;
        expect(row.ticketHash).toBe(createHash('sha256').update(first.previewToken).digest('hex'));
        expect(JSON.stringify(row)).not.toContain(first.previewToken);
        expect(JSON.stringify(row)).not.toContain(privateToken);
    });

    it('allows a content member to view without publish or design permission, and requires a cloud role to issue', async () => {
        const f = fixture();
        f.signIn('content');
        const ticket = await issue._handler(f.ctx, scope);
        expect(await authorize._handler(f.ctx, { ...scope, sandboxId: 'runtime-one', verifier, ticket: ticket.previewToken })).toEqual({ allowed: true, expiresAt: ticket.expiresAt });
        f.signIn('outsider');
        await expect(issue._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        f.signIn(null);
        await expect(issue._handler(f.ctx, scope)).rejects.toThrow('UNAUTHORIZED');
    });

    it('requires the exact runtime verifier, project, branch, and ticket, without trusting caller auth', async () => {
        const f = fixture();
        const ticket = await issue._handler(f.ctx, scope);
        const args = { ...scope, sandboxId: 'runtime-one', verifier, ticket: ticket.previewToken };
        f.signIn(null);
        expect((await authorize._handler(f.ctx, args)).allowed).toBe(true);
        for (const overrides of [
            { verifier: 'ef'.repeat(32) }, { ticket: privateToken }, { sandboxId: 'runtime-two' },
            { projectId: 'projects:other' as Id<'projects'> }, { branchId: 'branches:other' as Id<'branches'> },
        ]) expect(await authorize._handler(f.ctx, { ...args, ...overrides })).toEqual(denied);
    });

    it('rechecks both current project access and current cloud grant on every authorization', async () => {
        for (const revoke of ['membership', 'grant', 'user', 'clerk', 'enrollment'] as const) {
            const f = fixture();
            f.signIn('content');
            const ticket = await issue._handler(f.ctx, scope);
            const args = { ...scope, sandboxId: 'runtime-one', verifier, ticket: ticket.previewToken };
            expect((await authorize._handler(f.ctx, args)).allowed).toBe(true);
            if (revoke === 'membership') f.table('projectMembers').delete('projectMembers:content');
            if (revoke === 'grant') f.table('cloudEditorGrants').clear();
            if (revoke === 'user') f.table('users').delete('users:content');
            if (revoke === 'clerk') delete f.get('users:content')!.clerkUserId;
            if (revoke === 'enrollment') f.table('cloudEditorStates').clear();
            expect(await authorize._handler(f.ctx, args)).toEqual(denied);
        }
    });

    it('invalidates replaced runtimes and old gateway versions while retaining only one actor row', async () => {
        const f = fixture();
        const first = await issue._handler(f.ctx, scope);
        const state = f.get('cloudEditorStates:one')!;
        state.sandboxId = 'runtime-two';
        expect(await getCloudPreviewTicket(f.ctx, scope)).toBeNull();
        const second = await issue._handler(f.ctx, scope);
        expect(second.previewToken).not.toBe(first.previewToken);
        expect(f.table('cloudPreviewTickets').size).toBe(1);
        expect(await authorize._handler(f.ctx, { ...scope, sandboxId: 'runtime-one', verifier, ticket: first.previewToken })).toEqual(denied);
        const args = { ...scope, sandboxId: 'runtime-two', verifier, ticket: second.previewToken };
        expect((await authorize._handler(f.ctx, args)).allowed).toBe(true);
        state.previewGatewayVersion = 1;
        expect(await authorize._handler(f.ctx, args)).toEqual(denied);
        await expect(issue._handler(f.ctx, scope)).rejects.toThrow('CLOUD_PREVIEW_UNAVAILABLE');
        state.previewGatewayVersion = 2;
        state.expiresAt = Date.now() - 1;
        expect(await authorize._handler(f.ctx, args)).toEqual(denied);
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
        expect(await authorize._handler(f.ctx, args)).toEqual(denied);
    });
});
