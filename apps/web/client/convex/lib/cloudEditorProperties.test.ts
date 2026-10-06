import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { getFunctionName } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { _approvalInput, _selectionInput, _approve, _commit, _input, contracts, revoke } from '../cloudEditorProperties';
import { approve, commit, resolveSelection } from '../cloudEditorPropertyActions';
import { createCloudTextContract } from './cloudContentTextContract';
import { hashPreparationPolicy } from './cloudImportedState';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
const actor = (name: string) => `users:${name}` as Id<'users'>;
const preparationId = 'cloudEditorImportPreparations:ready' as Id<'cloudEditorImportPreparations'>;
const path = 'src/components/sections/hero.tsx';
const source = `'use client'; export function Hero() { return <header data-oid="hero"><h1 data-oid="title">Hello</h1><a className="glass" href="https://auth.stilta.com" data-oid="ypkjrq8">Log in</a></header>; }`;
const binding = { bindingId: 'hero-link', label: 'Login link', target: { kind: 'component-literal-href' as const, exportName: 'Hero', oid: 'ypkjrq8', field: 'href' as const },
    options: [{ id: 'login', label: 'Login', value: 'https://auth.stilta.com' }, { id: 'contact', label: 'Contact', value: '/contact' }] };
const textBindings = [{ bindingId: 'heading', target: { kind: 'component-literal' as const, exportName: 'Hero', oid: 'title' } }];
type Row = Record<string, unknown> & { _id: string };

// Real registered actions/handlers/permissions, with only auth and database IO
// replaced. This does not emulate Convex rollback or wire argument validators.
async function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
    const put = (name: string, id: string, row: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...row });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject: string | null = 'builder', sequence = 0;
    let beforeMutation: (() => void | Promise<void>) | undefined;
    const writes: string[] = [], scheduled: string[] = [];
    let budget = 20_000_000;
    put('workspaces', workspaceId, { createdByUserId: actor('owner') });
    put('projects', scope.projectId, { workspaceId, accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const name of ['builder', 'customer', 'other']) {
        put('users', actor(name), { clerkUserId: name, email: `${name}@example.com` });
        put('workspaceMembers', `workspaceMembers:${name}`, { workspaceId, userId: actor(name), role: 'member' });
        put('projectMembers', `projectMembers:${name}`, { projectId: scope.projectId, userId: actor(name), role: name === 'builder' ? 'manager' : 'viewer' });
        if (name !== 'builder') put('cloudEditorGrants', `cloudEditorGrants:${name}`, { projectId: scope.projectId, userId: actor(name), role: 'content', publish: false, updatedAt: 1 });
    }
    put('cloudEditorFiles', 'cloudEditorFiles:hero', { ...scope, path, kind: 'file', text: source, hash: hash(source), bytes: Buffer.byteLength(source) });
    const pins = [
        ['package.json', '{}'], ['bun.lock', '{}'], ['next.config.ts', 'export default {};'], ['tsconfig.json', '{}'],
        ['public/weblab-preload-script.js', 'globalThis.weblab = true;'], ['public/weblab-ix-runtime.js', 'globalThis.weblabIx = true;'],
        ['src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'],
    ].map(([path, text]) => ({ path: path!, text: text!, hash: hash(text!), bytes: Buffer.byteLength(text!) }));
    pins.forEach((pin, index) => put('cloudEditorFiles', `cloudEditorFiles:pin${index}`, { ...scope, kind: 'file', ...pin }));
    const policyBody = { kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: pins.map(({ path, hash, bytes }) => ({ path, hash, bytes })) };
    put('cloudEditorImports', 'cloudEditorImports:baseline', { ...scope, workspaceId, state: 'finalized', manifestHash: hash('baseline') });
    put('cloudEditorImportPreparations', preparationId, { ...scope, workspaceId, baselineAttemptId: 'cloudEditorImports:baseline',
        baselineManifestHash: hash('baseline'), inputManifestHash: hash('baseline'), preparedManifestHash: hash('prepared'),
        inputRevision: 1, preparedRevision: 2, generation: 1, profileVersion: 1, preparationVersion: 1,
        policy: { ...policyBody, policyHash: await hashPreparationPolicy(policyBody) } });
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId, version: 1, createdByUserId: actor('builder'),
        profile: 'imported-next-v1', preparationId, designRevision: 2, revision: 2, bytes: 1, fileCount: 1, status: 'stopped' });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null },
        meta: { getTransactionMetrics: async () => Object.fromEntries(['bytesRead', 'bytesWritten', 'documentsRead', 'documentsWritten', 'databaseQueries'].map(key => [key, { used: 0, remaining: budget }])) },
        db: {
            get: async (id: string) => structuredClone(get(id)),
            insert: async (name: string, value: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, value); writes.push(`insert:${name}`); return id; },
            patch: async (id: string, value: Record<string, unknown>) => { Object.assign(get(id)!, value); writes.push(`patch:${id}`); },
            replace: async (id: string, value: Record<string, unknown>) => { put(id.split(':')[0]!, id, value); writes.push(`replace:${id}`); },
            query: (name: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => constraints.every(([key, value]) => row[key] === value));
                const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    take: async (count: number) => structuredClone(rows().slice(0, count)),
                    collect: async () => structuredClone(rows()),
                    unique: async () => { const matches = rows(); if (matches.length > 1) throw new Error('Nonunique'); return structuredClone(matches[0] ?? null); } };
                return query;
            },
        }, scheduler: { runAfter: async (_delay: number, reference: Parameters<typeof getFunctionName>[0]) => { scheduled.push(getFunctionName(reference)); } },
    } as unknown as MutationCtx;
    const handlers: Record<string, (ctx: MutationCtx, args: never) => Promise<unknown>> = {
        'cloudEditorProperties:_approvalInput': _approvalInput._handler, 'cloudEditorProperties:_selectionInput': _selectionInput._handler,
        'cloudEditorProperties:_approve': _approve._handler, 'cloudEditorProperties:_input': _input._handler, 'cloudEditorProperties:_commit': _commit._handler,
    };
    const run = async (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const name = getFunctionName(reference);
        if (name === 'cloudEditorProperties:_approve' || name === 'cloudEditorProperties:_commit') await beforeMutation?.();
        const handler = handlers[name]; if (!handler) throw new Error(`Unknown function ${name}`);
        return handler(ctx, args as never);
    };
    const action = { runQuery: run, runMutation: run } as unknown as ActionCtx;
    const approval = () => ({ ...scope, actorId: actor('builder'), path, expectedRevision: Number(get('cloudEditorStates:one')!.revision),
        expectedGeneration: Number([...table('cloudEditorPropertyContracts').values()][0]?.generation ?? 0),
        expectedPreparationId: preparationId, expectedDesignRevision: 2, bindings: [binding] });
    const approvePath = () => approve._handler(action, approval());
    const request = (content = source.replace('https://auth.stilta.com', '/contact')) => ({ ...scope, actorId: actor('customer'),
        transport: 'content-property' as const, transportVersion: 1 as const, expectedRevision: 2, operationId: 'property_operation_0001',
        pin: { version: 1 as const, path, generation: 1, preparationId, designRevision: 2,
            definitionHash: String([...table('cloudEditorPropertyContracts').values()][0]!.definitionHash), bindingId: binding.bindingId },
        previousValue: 'https://auth.stilta.com', choiceId: 'contact', changes: [{ path, content }] });
    const sibling = (overrides: Record<string, unknown> = {}) => {
        const contract = createCloudTextContract(path, source, textBindings);
        put('cloudEditorContentContracts', 'cloudEditorContentContracts:text', { ...scope, workspaceId, path, version: 2, generation: 7, active: true,
            designRevision: 2, bindings: [], textBindings, fingerprint: contract.fingerprint, ...overrides });
        return get('cloudEditorContentContracts:text')!;
    };
    return { ctx, action, put, get, table, writes, scheduled, approval, approvePath, request, sibling,
        signIn: (name: string | null) => { subject = name; }, beforeMutation: (callback: () => void | Promise<void>) => { beforeMutation = callback; },
        budget: (remaining: number) => { budget = remaining; } };
}
const gates = ['WEBLAB_CLOUD_EDITOR_ENABLED', 'WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED', 'WEBLAB_CLOUD_IMPORTED_PROPERTIES_ENABLED'] as const;
const previous = gates.map(key => process.env[key]);
beforeEach(() => { gates.forEach(key => { process.env[key] = 'true'; }); });
afterEach(() => { gates.forEach((key, index) => { const value = previous[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }); });

describe('imported property authority and source commits', () => {
    it('requires explicit designer approval and returns exact selection pins', async () => {
        const f = await fixture();
        expect(await resolveSelection._handler(f.action, { ...scope, actorId: actor('builder'), expectedRevision: 2,
            selection: { kind: 'component-literal-href', path, exportName: 'Hero', oid: 'ypkjrq8' } })).toEqual({
            path, target: binding.target, value: 'https://auth.stilta.com', actorId: actor('builder'), revision: 2, preparationId, designRevision: 2, generation: 0 });
        await f.approvePath();
        f.signIn('customer'); f.writes.length = 0;
        expect((await contracts._handler(f.ctx, { ...scope, actorId: actor('customer') })).contracts[0]).toMatchObject({ active: true, current: true, generation: 1, bindings: [binding] });
        await expect(approve._handler(f.action, { ...f.approval(), actorId: actor('customer') })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect(f.writes).toEqual([]);
    });
    it('writes one owner, retains approval generations and refreshes only current sibling text', async () => {
        const f = await fixture(); await f.approvePath(); const sibling = f.sibling(); const previousFingerprint = sibling.fingerprint;
        f.signIn('customer'); f.writes.length = 0;
        const request = f.request(); expect(await commit._handler(f.action, request)).toEqual({ revision: 3, currentRevision: 3 });
        expect(f.get('cloudEditorFiles:hero')!.text).toBe(request.changes[0]!.content);
        expect(sibling.fingerprint).not.toBe(previousFingerprint); expect(sibling.generation).toBe(7);
        expect([...f.table('cloudEditorPropertyContracts').values()][0]!.generation).toBe(1);
        expect(sibling.fingerprint).toBe(createCloudTextContract(path, request.changes[0]!.content, textBindings).fingerprint);
        expect(f.get('cloudEditorStates:one')!.bytes).toBe([...f.table('cloudEditorFiles').values()].reduce((sum, row) => sum + Number(row.bytes), 0));
        expect(f.scheduled).toEqual(['cloudEditorRuntime:sync']);
        expect([...f.table('cloudEditorOperations').values()]).toHaveLength(1);
    });
    it('returns an immutable receipt after lost reply despite property gate off and approval revoked', async () => {
        const f = await fixture(); await f.approvePath(); f.signIn('customer'); const request = f.request();
        await commit._handler(f.action, request);
        f.signIn('builder'); await revoke._handler(f.ctx, { ...scope, actorId: actor('builder'), path, expectedGeneration: 1 });
        f.signIn('customer'); process.env.WEBLAB_CLOUD_IMPORTED_PROPERTIES_ENABLED = 'false'; f.writes.length = 0;
        expect(await commit._handler(f.action, request)).toEqual({ revision: 3, currentRevision: 3 });
        await expect(commit._handler(f.action, { ...request, choiceId: 'login' })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        expect(f.writes).toEqual([]);
    });
    it('requires current actor, membership, grant, prepared visibility even for exact receipts', async () => {
        for (const mutate of ['actor', 'member', 'grant', 'preparation', 'content-gate'] as const) {
            const f = await fixture(); await f.approvePath(); f.signIn('customer'); const request = f.request(); await commit._handler(f.action, request); f.writes.length = 0;
            if (mutate === 'actor') f.signIn('other');
            if (mutate === 'member') f.table('projectMembers').delete('projectMembers:customer');
            if (mutate === 'grant') f.table('cloudEditorGrants').delete('cloudEditorGrants:customer');
            if (mutate === 'preparation') f.get('cloudEditorImportPreparations:ready')!.preparedRevision = 4;
            if (mutate === 'content-gate') process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
            await expect(commit._handler(f.action, request)).rejects.toThrow(); expect(f.writes).toEqual([]);
            process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
        }
    });
    it('rejects current source, source inventory, approval or sibling races before any write', async () => {
        for (const mutate of ['source', 'inventory', 'property', 'sibling', 'gate', 'epoch'] as const) {
            const f = await fixture(); await f.approvePath(); const sibling = f.sibling(); f.signIn('customer'); f.writes.length = 0;
            f.beforeMutation(() => {
                if (mutate === 'source') f.get('cloudEditorFiles:hero')!.text = source.replace('Hello', 'Other');
                if (mutate === 'inventory') f.put('cloudEditorFiles', 'cloudEditorFiles:extra', { ...scope, path: 'src/extra.ts', kind: 'file', text: 'export const x=1;', hash: hash('export const x=1;'), bytes: 17 });
                if (mutate === 'property') [...f.table('cloudEditorPropertyContracts').values()][0]!.generation = 2;
                if (mutate === 'sibling') sibling.active = false;
                if (mutate === 'gate') process.env.WEBLAB_CLOUD_IMPORTED_PROPERTIES_ENABLED = 'false';
                if (mutate === 'epoch') f.get('cloudEditorStates:one')!.designRevision = 3;
            });
            await expect(commit._handler(f.action, f.request())).rejects.toThrow(); expect(f.writes).toEqual([]);
            process.env.WEBLAB_CLOUD_IMPORTED_PROPERTIES_ENABLED = 'true';
        }
    });
    it('does not reactivate revoked or stale sibling text contracts', async () => {
        for (const overrides of [{ active: false }, { designRevision: 1 }]) {
            const f = await fixture(); await f.approvePath(); const sibling = f.sibling(overrides), before = structuredClone(sibling);
            f.signIn('customer'); await commit._handler(f.action, f.request()); expect(sibling).toEqual(before);
        }
    });
    it('rejects forged or unrelated owner bytes and stale prior values without writing', async () => {
        const f = await fixture(); await f.approvePath(); f.signIn('customer'); f.writes.length = 0;
        for (const request of [f.request(source.replace('Hello', 'Injected')), { ...f.request(), previousValue: '/contact' }, { ...f.request(), choiceId: 'unknown' }])
            await expect(commit._handler(f.action, request)).rejects.toThrow();
        expect(f.writes).toEqual([]);
    });
    it('refuses active image-family owners, stale text fingerprints and missing transaction headroom', async () => {
        for (const kind of ['image', 'fingerprint', 'budget'] as const) {
            const f = await fixture(); await f.approvePath();
            if (kind === 'image') f.sibling({ imageBindings: [{}] });
            if (kind === 'fingerprint') f.sibling({ fingerprint: hash('unrelated') });
            if (kind === 'budget') f.budget(1);
            f.signIn('customer'); f.writes.length = 0;
            await expect(commit._handler(f.action, f.request())).rejects.toThrow(); expect(f.writes).toEqual([]);
        }
    });
    it('bounds the retained property table and rechecks source at approval commit', async () => {
        const f = await fixture(); await f.approvePath(); const approved = [...f.table('cloudEditorPropertyContracts').values()][0]!;
        for (let index = 0; index < 32; index++) f.put('cloudEditorPropertyContracts', `cloudEditorPropertyContracts:extra${index}`, { ...approved, path: `src/${index}.tsx` });
        await expect(contracts._handler(f.ctx, { ...scope, actorId: actor('builder') })).rejects.toThrow('CLOUD_PROPERTY_LIMIT');
        const other = await fixture(); other.beforeMutation(() => { other.get('cloudEditorFiles:hero')!.hash = hash('changed'); });
        await expect(other.approvePath()).rejects.toThrow('CLOUD_CONFLICT'); expect(other.writes).toEqual([]);
    });
});
