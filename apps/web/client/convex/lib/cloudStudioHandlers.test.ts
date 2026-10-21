import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { _input as studioInput, _commit as studioCommit } from '../cloudEditorStudio';
import { _input as cmsInput, _commit as cmsCommit } from '../cloudEditorCms';
import { commit as structure } from '../cloudEditorStudioActions';
import { commit as journal } from '../cloudEditorCmsActions';
import { STUDIO_JSON_PATH } from './cloudStudioContent';

type Row = Record<string, unknown> & { _id: string };
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const owner = 'users:builder' as Id<'users'>, customer = 'users:customer' as Id<'users'>;
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let value = tables.get(name); if (!value) { value = new Map(); tables.set(name, value); } return value; };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...value });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject = 'builder', sequence = 0;
    let beforeMutation: (() => void) | null = null;
    const writes: string[] = [];
    put('workspaces', 'workspaces:one', { createdByUserId: owner });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const user of ['builder', 'customer']) {
        put('users', `users:${user}`, { clerkUserId: user, email: `${user}@example.com` });
        put('workspaceMembers', `workspaceMembers:${user}`, { workspaceId: 'workspaces:one', userId: `users:${user}`, role: 'member' });
        put('projectMembers', `projectMembers:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'builder' ? 'manager' : 'viewer' });
    }
    put('cloudEditorGrants', 'cloudEditorGrants:customer', { projectId: scope.projectId, userId: customer, role: 'content', publish: false, updatedAt: 1 });
    const text = 'export default function Page() { return <main data-oid="ce-home-main"><h1 data-oid="hello">Hello</h1></main>; }';
    put('cloudEditorFiles', 'cloudEditorFiles:home', { ...scope, path: 'src/app/page.tsx', kind: 'file', text, bytes: Buffer.byteLength(text), hash: 'a'.repeat(64) });
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId: 'workspaces:one', version: 1,
        createdByUserId: owner, revision: 1, generation: 1, bytes: Buffer.byteLength(text), fileCount: 1, status: 'stopped' });
    const ctx = {
        auth: { getUserIdentity: async () => ({ subject, tokenIdentifier: `issuer|${subject}` }) },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, value: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, value); writes.push(`insert:${name}`); return id; },
            patch: async (id: string, value: Record<string, unknown>) => { Object.assign(get(id)!, value); writes.push(`patch:${id}`); },
            replace: async (id: string, value: Record<string, unknown>) => { put(id.split(':')[0]!, id, value); writes.push(`replace:${id}`); },
            query: (name: string) => {
                const conditions: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { conditions.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => conditions.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    take: async (count: number) => rows().slice(0, count),
                    collect: async () => rows(),
                    unique: async () => { const matches = rows(); if (matches.length > 1) throw new Error('Nonunique'); return matches[0] ?? null; },
                };
                return query;
            },
        },
        scheduler: { runAfter: async () => null },
    } as unknown as MutationCtx;
    const handlers: Record<string, (context: MutationCtx, args: never) => Promise<unknown>> = {
        'cloudEditorStudio:_input': studioInput._handler, 'cloudEditorStudio:_commit': studioCommit._handler,
        'cloudEditorCms:_input': cmsInput._handler, 'cloudEditorCms:_commit': cmsCommit._handler,
    };
    const run = async (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const name = getFunctionName(reference);
        if (name.endsWith(':_commit')) beforeMutation?.();
        const handler = handlers[name]; if (!handler) throw new Error(name);
        return handler(ctx, args as never);
    };
    const action = { runQuery: run, runMutation: run } as unknown as ActionCtx;
    const install = () => structure._handler(action, { ...scope, actorId: owner, expectedRevision: 1, expectedGeneration: 0,
        operationId: 'studio_install_0001', operation: { kind: 'install' } });
    const saveRequest = () => ({ ...scope, actorId: customer, expectedRevision: 2, expectedGeneration: 1,
        operationId: 'journal_save_00001', operation: { kind: 'save' as const, key: 'journal_entry_00001', expectedItemRevision: 0,
            slug: 'first-story', values: { title: 'First story', excerpt: 'Summary', body: 'Body' }, status: 'draft' as const } });
    return { tables, get, writes, action, install, saveRequest, setUser: (value: string) => { subject = value; },
        race: (callback: () => void) => { beforeMutation = callback; } };
}
let previous: string | undefined;
beforeEach(() => { previous = process.env.WEBLAB_CLOUD_EDITOR_ENABLED; process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true'; });
afterEach(() => { if (previous === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED; else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = previous; });

// Real handlers and authorization, with only DB/auth IO replaced. Transaction rollback
// itself remains a Convex guarantee; rejected-race assertions require no fixture writes.
describe('Cloud Studio semantic publication boundary', () => {
    it('saves cloud-owned Journal data, projection and one source receipt together', async () => {
        const f = fixture(); await f.install(); f.setUser('customer');
        const receipt = await journal._handler(f.action, f.saveRequest());
        expect(receipt.revision).toBe(3);
        expect(f.get('cloudEditorStates:one')!.revision).toBe(3);
        expect(f.tables.get('cloudEditorJournalItems')?.size).toBe(1);
        expect([...f.tables.get('cloudEditorFiles')!.values()].find(file => file.path === STUDIO_JSON_PATH)?.text).toContain('First story');
        expect(f.tables.has('cmsItems')).toBe(false);
        const before = f.writes.length;
        expect(await journal._handler(f.action, f.saveRequest())).toEqual(receipt);
        expect(f.writes.length).toBe(before);
    });
    it('denies a changed operation payload and current role revocation on retry', async () => {
        const f = fixture(); await f.install(); f.setUser('customer');
        const request = f.saveRequest(); await journal._handler(f.action, request);
        await expect(journal._handler(f.action, { ...request, operation: { ...request.operation, slug: 'different' } })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        f.tables.get('cloudEditorGrants')!.clear();
        await expect(journal._handler(f.action, request)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });
    it('returns typed domain refusal after checking the retry receipt', async () => {
        const f = fixture(); await f.install(); f.setUser('customer');
        await journal._handler(f.action, f.saveRequest());
        const duplicate = { ...f.saveRequest(), expectedRevision: 3, operationId: 'journal_save_00002',
            operation: { ...f.saveRequest().operation, key: 'journal_entry_00002' } };
        await expect(journal._handler(f.action, duplicate)).rejects.toBeInstanceOf(ConvexError);
        expect(f.tables.get('cloudEditorJournalItems')?.size).toBe(1);
        expect(f.get('cloudEditorStates:one')!.revision).toBe(3);
    });
    it('rechecks approval revocation after Node preparation before any write', async () => {
        const f = fixture(); await f.install(); f.setUser('customer');
        const before = f.writes.length;
        f.race(() => { [...f.tables.get('cloudEditorStudioContracts')!.values()][0]!.active = false; });
        await expect(journal._handler(f.action, f.saveRequest())).rejects.toThrow('CLOUD_STUDIO_UNAVAILABLE');
        expect(f.writes.length).toBe(before);
    });
    it('rechecks source revision after Node preparation and rejects designer operations from customers', async () => {
        const f = fixture(); await f.install(); f.setUser('customer');
        const before = f.writes.length;
        f.race(() => { f.get('cloudEditorStates:one')!.revision = 3; });
        await expect(journal._handler(f.action, f.saveRequest())).rejects.toThrow('CLOUD_CONFLICT');
        expect(f.writes.length).toBe(before);
        await expect(structure._handler(f.action, { ...scope, actorId: customer, expectedRevision: 3, expectedGeneration: 1,
            operationId: 'studio_config_0001', operation: { kind: 'configure', active: true, allowPages: true, allowedBlocks: ['text-v1'] } })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });
});
