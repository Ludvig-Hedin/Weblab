import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getFunctionName } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { reserve, _input, _commit } from '../cloudEditorContentImages';
import { commit } from '../cloudEditorContentImageActions';
import { approveCloudContentBindings } from './cloudContentContract';
import { imageHash, imagePath } from './cloudContentImage';
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
const page = (id: string) => `export default function Page() { return <main data-oid="root-${id}"><img data-oid="photo-${id}" src="/one.png" alt="Before" /></main>; }`;
type Row = Record<string, unknown> & { _id: string };
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => {
        let result = tables.get(name);
        if (!result) { result = new Map(); tables.set(name, result); }
        return result;
    };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...value });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject: string | null = 'builder';
    let sequence = 0;
    let beforeCommit: (() => void) | null = null;
    const writes: string[] = [];
    const scheduled: Array<{ name: string; args: unknown }> = [];
    put('workspaces', workspaceId, { createdByUserId: 'users:owner' });
    put('projects', scope.projectId, { workspaceId, accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const user of ['builder', 'customer', 'other', 'viewer']) {
        put('users', `users:${user}`, { clerkUserId: user, email: `${user}@example.com` });
        put('workspaceMembers', `workspaceMembers:${user}`, { workspaceId, userId: `users:${user}`, role: 'member' });
        put('projectMembers', `projectMembers:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'builder' ? 'manager' : 'viewer' });
        if (user === 'customer' || user === 'other') put('cloudEditorGrants', `cloudEditorGrants:${user}`, {
            projectId: scope.projectId, userId: `users:${user}`, role: 'content', publish: false, updatedAt: 1 });
    }
    for (const [path, id] of [['app/page.tsx', 'one'], ['app/about/page.tsx', 'two']] as const) {
        const text = page(id);
        put('cloudEditorFiles', `cloudEditorFiles:${id}`, { ...scope, path, kind: 'file', text, bytes: Buffer.byteLength(text), hash: '0'.repeat(64) });
    }
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId, version: 1, createdByUserId: 'users:builder',
        revision: 1, bytes: Buffer.byteLength(page('one')) + Buffer.byteLength(page('two')), fileCount: 2, status: 'stopped' });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, value: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, value); writes.push(`insert:${name}`); return id; },
            patch: async (id: string, value: Record<string, unknown>) => { Object.assign(get(id)!, value); writes.push(`patch:${id}`); },
            replace: async (id: string, value: Record<string, unknown>) => { put(id.split(':')[0]!, id, value); writes.push(`replace:${id}`); },
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); writes.push(`delete:${id}`); },
            query: (name: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; }, gte: (_key: string, _value: number) => index };
                const rows = () => [...table(name).values()].filter(row => constraints.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    take: async (limit: number) => rows().slice(0, limit),
                    collect: async () => rows(),
                    unique: async () => { const found = rows(); if (found.length > 1) throw new Error('Nonunique row'); return found[0] ?? null; },
                };
                return query;
            },
        },
        scheduler: { runAfter: async (_delay: number, ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
            scheduled.push({ name: getFunctionName(ref), args });
        } },
    } as unknown as MutationCtx;
    const handlers: Record<string, (ctx: MutationCtx, args: never) => Promise<unknown>> = {
        'cloudEditorContentImages:_input': _input._handler,
        'cloudEditorContentImages:_commit': _commit._handler,
    };
    const run = async (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const name = getFunctionName(reference);
        if (name === 'cloudEditorContentImages:_commit') beforeCommit?.();
        const handler = handlers[name];
        if (!handler) throw new Error(`Unexpected reference ${name}`);
        return handler(ctx, args as never);
    };
    const action = { runQuery: run, runMutation: run } as unknown as ActionCtx;
    return { ctx, action, put, get, table, writes, scheduled,
        signIn: (name: string | null) => { subject = name; }, beforeCommit: (hook: () => void) => { beforeCommit = hook; } };
}

const oldGate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
beforeEach(() => { process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true'; });
afterEach(() => { if (oldGate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED; else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = oldGate; });
function imageFixture() {
    const f = fixture(); f.signIn('customer');
    const bytes = new Uint8Array([1, 2, 3]).buffer, hash = imageHash(bytes), assetPath = imagePath(hash);
    const actorId = 'users:customer' as Id<'users'>;
    const contract = approveCloudContentBindings({ path: 'app/page.tsx', source: page('one'), approvedAssetPaths: ['/one.png'],
        bindings: [{ oid: 'photo-one', fields: ['src'], allowImageUploads: true, allowedValues: { src: ['/one.png'] } }] });
    f.put('cloudEditorContentContracts', 'cloudEditorContentContracts:one', { ...scope, ...contract, active: true, generation: 1, approvedByUserId: 'users:builder' });
    f.put('cloudEditorFiles', 'cloudEditorFiles:oldimage', { ...scope, path: 'public/one.png', kind: 'file', storageId: '_storage:old', bytes: 3, hash: '0'.repeat(64) });
    const target = { ...scope, actorId, path: 'app/page.tsx', oid: 'photo-one', generation: 1, expectedRevision: 1 };
    const attemptId = 'cloudEditorContentImageAttempts:one' as Id<'cloudEditorContentImageAttempts'>;
    f.put('cloudEditorContentImageAttempts', attemptId, { ...target, operationId: 'preparation_operation_01', status: 'ready', createdAt: Date.now(), expiresAt: Date.now() + 10_000, hash, bytes: 3, assetPath, storageId: '_storage:new' });
    const request = () => ({ ...scope, actorId, expectedRevision: 1, operationId: 'image_operation_00001', transport: 'content-image' as const, transportVersion: 1 as const,
        image: { attemptId, path: target.path, oid: target.oid, generation: 1, assetPath }, changes: [{ path: target.path, content: page('one').replace('/one.png', assetPath.slice(6)) }, { path: assetPath, content: bytes }] });
    return { ...f, request, target, bytes, assetPath, actorId };
}
describe('customer image atomic boundary', () => {
    it('commits one src plus owned asset and preserves approval generation and previous choices', async () => {
        const f = imageFixture();
        expect(await commit._handler(f.action, f.request())).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.get('cloudEditorFiles:one')!.text).toContain(f.assetPath.slice(6));
        const contract = f.get('cloudEditorContentContracts:one')!;
        expect(contract.generation).toBe(1);
        expect(contract.bindings).toMatchObject([{ allowedValues: { src: ['/one.png', f.assetPath.slice(6)] }, allowImageUploads: true }]);
        const count = f.writes.length;
        expect(await commit._handler(f.action, f.request())).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.writes.length).toBe(count);
    });
    it('refuses changing another attribute during upload without a single write', async () => {
        const f = imageFixture(), request = f.request();
        request.changes[0]!.content = String(request.changes[0]!.content).replace('Before', 'Forged');
        await expect(commit._handler(f.action, request)).rejects.toThrow();
        expect(f.writes).toEqual([]);
    });
    it('rechecks source revision and contract generation at final commit', async () => {
        for (const change of [() => ({ revision: 2 }), () => ({ generation: 2 })]) {
            const f = imageFixture();
            f.beforeCommit(() => {
                const values = change();
                Object.assign(f.get('revision' in values ? 'cloudEditorStates:one' : 'cloudEditorContentContracts:one')!, values);
            });
            await expect(commit._handler(f.action, f.request())).rejects.toThrow();
            expect(f.writes).toEqual([]);
        }
    });
    it('requires current actor, content membership and designer upload permission', async () => {
        const f = imageFixture();
        f.signIn('other');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        f.signIn('customer');
        const contract = f.get('cloudEditorContentContracts:one')!;
        contract.bindings = [{ oid: 'photo-one', fields: ['src'], allowedValues: { src: ['/one.png'] } }];
        await expect(reserve._handler(f.ctx, { ...f.target, operationId: 'preparation_operation_02' })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        expect(f.writes).toEqual([]);
    });
});
