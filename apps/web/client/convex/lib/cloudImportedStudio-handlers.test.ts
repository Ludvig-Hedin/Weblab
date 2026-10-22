import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { getFunctionName, type FunctionArgs } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import * as backend from '../cloudEditorImportedStudio';
import { commit, reapprove } from '../cloudEditorImportedStudioActions';
import { hashPreparationPolicy } from './cloudImportedState';
import { IMPORTED_STUDIO_CONFIG_PATH, IMPORTED_STUDIO_PAGE_PATH, IMPORTED_STUDIO_BLOCK_PATH,
    parseImportedStudioConfig, serializeImportedStudioConfig, serializeImportedStudioRecipe, type ImportedStudioOperation } from './cloudImportedStudioState';

const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const designer = 'users:designer' as Id<'users'>, customer = 'users:customer' as Id<'users'>;
const flags = ['WEBLAB_CLOUD_EDITOR_ENABLED', 'WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED', 'WEBLAB_CLOUD_IMPORTED_STUDIO_ENABLED'] as const;
const prior = new Map<string, string | undefined>();
beforeEach(() => { for (const flag of flags) { prior.set(flag, process.env[flag]); process.env[flag] = 'true'; } });
afterEach(() => { for (const flag of flags) { const value = prior.get(flag); if (value === undefined) delete process.env[flag]; else process.env[flag] = value; } });
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Row = Record<string, unknown> & { _id: string };
const capture: ImportedStudioOperation = { kind: 'capture', label: 'Information', blockLabel: 'Text section', slots: [{ key: 'body', max: 10 }] };

async function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _creationTime: 1, ...value, _id: id });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    const writes: string[] = [], scheduled: string[] = [];
    let subject = 'designer', sequence = 0, operationSequence = 0, beforeMutation: ((args: Record<string, unknown>) => void) | undefined;
    const metric = { used: 0, remaining: 20_000_000 };
    const ctx = { auth: { getUserIdentity: async () => ({ subject, tokenIdentifier: `issuer|${subject}` }) },
        meta: { getTransactionMetrics: async () => ({ bytesRead: metric, bytesWritten: metric, documentsRead: metric, documentsWritten: metric, databaseQueries: metric }) },
        db: { get: async (id: string) => get(id),
            insert: async (name: string, row: Record<string, unknown>) => { const id = `${name}:new${++sequence}`; put(name, id, row); writes.push(name); return id; },
            patch: async (id: string, row: Record<string, unknown>) => { Object.assign(get(id)!, row); writes.push(id); },
            replace: async (id: string, row: Record<string, unknown>) => { put(id.split(':')[0]!, id, row); writes.push(id); },
            query: (name: string) => {
                const filters: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { filters.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => filters.every(([key, value]) => row[key] === value));
                const query = { withIndex: (_name: string, build: (value: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => rows(), take: async (limit: number) => rows().slice(0, limit),
                    unique: async () => { if (rows().length > 1) throw Error('Duplicate'); return rows()[0] ?? null; } };
                return query;
            } }, scheduler: { runAfter: async (_delay: number, ref: Parameters<typeof getFunctionName>[0]) => { scheduled.push(getFunctionName(ref)); } },
    } as unknown as MutationCtx;
    put('workspaces', 'workspaces:one', { createdByUserId: designer });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const user of ['designer', 'customer', 'other']) {
        put('users', `users:${user}`, { clerkUserId: user });
        put('workspaceMembers', `workspaceMembers:${user}`, { workspaceId: 'workspaces:one', userId: `users:${user}`, role: user === 'designer' ? 'admin' : 'member' });
        put('projectMembers', `projectMembers:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'designer' ? 'manager' : 'viewer' });
        put('cloudEditorGrants', `cloudEditorGrants:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'designer' ? 'designer' : 'content' });
    }
    const styles = 'import styles from "@/components/sections/studio.module.css";';
    const sources: Record<string, string> = {
        'package.json': '{}', 'bun.lock': '{}', 'next.config.ts': 'export default {};',
        'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}', 'next-env.d.ts': '// types',
        'src/app/layout.tsx': 'export default function Layout({children}) { return <html><body>{children}</body></html>; }',
        'public/weblab-preload-script.js': 'void 0;', 'public/weblab-ix-runtime.js': 'void 0;',
        'src/components/sections/studio.module.css': '.root { display: block } .block { padding: 24px }',
        [IMPORTED_STUDIO_PAGE_PATH]: styles + 'export function BasicPage(){return <main className={styles.root} data-oid="recipe-main"><h1 data-oid="recipe-title" data-weblab-studio-text="title">Title</h1><p data-oid="recipe-intro" data-weblab-studio-text="intro">Intro</p><div data-oid="recipe-slot" data-weblab-studio-slot="body"></div></main>;}',
        [IMPORTED_STUDIO_BLOCK_PATH]: styles + 'export function TextBlock(){return <section className={styles.block} data-oid="block-root"><h2 data-oid="block-title" data-weblab-studio-text="title">Heading</h2><p data-oid="block-body" data-weblab-studio-text="body">Body</p></section>;}',
    };
    const file = (path: string) => [...table('cloudEditorFiles').values()].find(row => row.path === path)!;
    const replaceSource = (path: string, text: string) => Object.assign(file(path), { text, hash: hash(text), bytes: Buffer.byteLength(text) });
    for (const [path, text] of Object.entries(sources)) put('cloudEditorFiles', `cloudEditorFiles:${path}`, { ...scope, path, kind: 'file', text, hash: hash(text), bytes: Buffer.byteLength(text) });
    put('cloudEditorFiles', 'cloudEditorFiles:media', { ...scope, path: 'public/media/original.webp', kind: 'file', hash: hash('media'), bytes: 5, storageId: '_storage:original' });
    put('cloudEditorImports', 'cloudEditorImports:baseline', { ...scope, workspaceId: 'workspaces:one', state: 'finalized', manifestHash: 'a'.repeat(64),
        files: [...Object.keys(sources), 'public/media/original.webp'].map(path => ({ path })) });
    const pinPaths = ['package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'src/app/layout.tsx', 'public/weblab-preload-script.js', 'public/weblab-ix-runtime.js'];
    const policy = { kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: pinPaths.map(path => ({ path, hash: hash(sources[path]!), bytes: Buffer.byteLength(sources[path]!) })) };
    put('cloudEditorImportPreparations', 'cloudEditorImportPreparations:one', { ...scope, workspaceId: 'workspaces:one', baselineAttemptId: 'cloudEditorImports:baseline',
        generation: 1, profileVersion: 1, preparationVersion: 1, inputRevision: 1, preparedRevision: 2, baselineManifestHash: 'a'.repeat(64), inputManifestHash: 'a'.repeat(64), preparedManifestHash: 'b'.repeat(64), policy: { ...policy, policyHash: await hashPreparationPolicy(policy) } });
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId: 'workspaces:one', version: 1, profile: 'imported-next-v1', revision: 3, designRevision: 2,
        preparationId: 'cloudEditorImportPreparations:one', createdByUserId: designer, status: 'stopped',
        bytes: [...table('cloudEditorFiles').values()].reduce((sum, row) => sum + Number(row.bytes), 0), fileCount: table('cloudEditorFiles').size });
    const handlers = backend as unknown as Record<string, { _handler: (ctx: MutationCtx, args: never) => Promise<unknown> }>;
    const run = async (ref: Parameters<typeof getFunctionName>[0], args: unknown, mutation = false) => {
        if (mutation) beforeMutation?.(args as Record<string, unknown>);
        const snapshot = structuredClone(tables), count = writes.length, jobs = scheduled.length;
        try { return await handlers[getFunctionName(ref).split(':')[1]!]!._handler(ctx, args as never); }
        catch (error) { tables.clear(); for (const [name, rows] of snapshot) tables.set(name, rows); writes.splice(count); scheduled.splice(jobs); throw error; }
    };
    const action = { runQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => run(ref, args),
        runMutation: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => run(ref, args, true) } as unknown as ActionCtx;
    const config = () => parseImportedStudioConfig(file(IMPORTED_STUDIO_CONFIG_PATH).text as string);
    const authority = () => [...table('cloudEditorImportedStudioApprovals').values()][0];
    function pin() {
        return { ...scope, actorId: `users:${subject}` as Id<'users'>, expectedRevision: Number(get('cloudEditorStates:one')!.revision),
            expectedGeneration: Number(authority()?.generation ?? 0), expectedPreparationId: 'cloudEditorImportPreparations:one' as Id<'cloudEditorImportPreparations'>,
            expectedDesignRevision: 2, expectedRecipeFingerprint: String(authority()?.recipeFingerprint ?? '') };
    }
    const request = (operation: ImportedStudioOperation): FunctionArgs<typeof commit> => ({ ...pin(), transport: 'studio', transportVersion: 2,
        operationId: `studio_operation_${String(++operationSequence).padStart(8, '0')}`, operation });
    const execute = (operation: ImportedStudioOperation) => commit._handler(action, request(operation));
    async function created() { await execute(capture); subject = 'customer'; await execute({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'story' }); return config().pages[0]!; }
    const owner = () => [...table('cloudEditorContentContracts').values()][0]!;
    return { ctx, action, get, put, table, file, config, authority, owner, replaceSource, writes, scheduled, request, execute, pin, created,
        signIn: (value: string) => { subject = value; }, beforeMutation: (fn: (args: Record<string, unknown>) => void) => { beforeMutation = fn; } };
}

describe('imported Studio authority transactions', () => {
    it('atomically captures then creates a native page, text contract and exact counters while retaining original media', async () => {
        const f = await fixture(), original = structuredClone([...f.table('cloudEditorFiles').values()]);
        const page = await f.created();
        expect(f.file(page.routePath).text).toContain('export default function Page');
        expect(f.file(page.ownerPath).text).toContain('export function StudioPage');
        expect(f.owner()).toMatchObject({ version: 2, active: true, generation: 1, designRevision: 2 });
        for (const row of original) expect(f.get(row._id)).toEqual(row);
        expect(f.get('cloudEditorStates:one')).toMatchObject({ revision: 5, designRevision: 2, status: 'stopped', fileCount: f.table('cloudEditorFiles').size,
            bytes: [...f.table('cloudEditorFiles').values()].reduce((sum, row) => sum + Number(row.bytes), 0) });
        expect(f.scheduled).toEqual(['cloudEditorRuntime:sync', 'cloudEditorRuntime:sync']);
    });
    it('inserts, moves and removes only the selected owner and increments its text generation', async () => {
        const f = await fixture(), page = await f.created();
        await f.execute({ kind: 'insertBlock', pageId: page.id, slotKey: 'body', blockId: 'text-block-v1', position: 0 });
        const instanceId = f.config().pages[0]!.slots[0]!.instances[0]!.id;
        expect(f.owner().textBindings).toHaveLength(4);
        await f.execute({ kind: 'moveBlock', pageId: page.id, slotKey: 'body', instanceId, position: 0 });
        await f.execute({ kind: 'removeBlock', pageId: page.id, slotKey: 'body', instanceId });
        expect(f.owner()).toMatchObject({ generation: 4, active: true }); expect(f.owner().textBindings).toHaveLength(2);
        expect(f.authority()!.generation).toBe(1);
    });
    it.each(['revoked', 'reduced', 'mixed'] as const)('refuses customer structural regrant of %s text authority', async kind => {
        const f = await fixture(), page = await f.created(), row = f.owner();
        if (kind === 'revoked') row.active = false;
        if (kind === 'reduced') row.textBindings = (row.textBindings as unknown[]).slice(0, 1);
        if (kind === 'mixed') row.imageBindings = [{}];
        const count = f.writes.length;
        await expect(f.execute({ kind: 'insertBlock', pageId: page.id, slotKey: 'body', blockId: 'text-block-v1', position: 0 })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        expect(f.writes).toHaveLength(count);
    });
    it.each(['source', 'generation', 'active', 'leaves', 'revision', 'epoch'] as const)('rechecks %s across the Node planning boundary', async kind => {
        const f = await fixture(), page = await f.created(), count = f.writes.length;
        f.beforeMutation(() => {
            if (kind === 'source') f.replaceSource(page.ownerPath, String(f.file(page.ownerPath).text).replace('Title', 'Changed'));
            if (kind === 'generation') f.owner().generation = 99;
            if (kind === 'active') f.owner().active = false;
            if (kind === 'leaves') f.owner().textBindings = [];
            if (kind === 'revision') f.get('cloudEditorStates:one')!.revision = 6;
            if (kind === 'epoch') f.get('cloudEditorStates:one')!.designRevision = 5;
        });
        await expect(f.execute({ kind: 'insertBlock', pageId: page.id, slotKey: 'body', blockId: 'text-block-v1', position: 0 })).rejects.toThrow();
        expect(f.writes).toHaveLength(count);
    });
    it('reconciles an exact receipt after gate/grant/approval revocation but refuses another actor or changed operation', async () => {
        const f = await fixture(); await f.created();
        const request = f.request({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'second' });
        const receipt = await commit._handler(f.action, request), count = f.writes.length;
        process.env.WEBLAB_CLOUD_IMPORTED_STUDIO_ENABLED = 'false'; f.authority()!.active = false; f.table('cloudEditorGrants').delete('cloudEditorGrants:customer');
        expect(await commit._handler(f.action, request)).toEqual(receipt); expect(f.writes).toHaveLength(count);
        await expect(commit._handler(f.action, { ...request, operation: { ...request.operation, kind: 'createPage', templateId: 'basic-page-v1', slug: 'different' } })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        f.signIn('other'); await expect(commit._handler(f.action, request)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
    });
    it('requires agency capture and explicit reapproval after authority-free restoration', async () => {
        const f = await fixture(); f.signIn('customer'); await expect(f.execute(capture)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect(f.writes).toHaveLength(0); f.signIn('designer'); await f.created();
        const fingerprint = String(f.authority()!.recipeFingerprint); f.table('cloudEditorImportedStudioApprovals').clear(); f.table('cloudEditorContentContracts').clear();
        const count = f.writes.length;
        await expect(f.execute({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'blocked' })).rejects.toThrow('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
        expect(f.writes).toHaveLength(count); f.signIn('designer');
        const result = await reapprove._handler(f.action, { ...f.pin(), expectedRecipeFingerprint: fingerprint });
        expect(result).toMatchObject({ generation: 1, active: true, revision: 5 }); expect(f.owner()).toMatchObject({ active: true, generation: 1 });
        expect(f.get('cloudEditorStates:one')!.revision).toBe(5);
    });
    it('pause leaves text grants alone, while explicit unchanged reapproval can restore reduced text permissions', async () => {
        const f = await fixture(); await f.created(); f.signIn('designer'); const before = structuredClone(f.owner());
        await backend.pause._handler(f.ctx, f.pin()); expect(f.authority()!.active).toBe(false); expect(f.owner()).toEqual(before);
        f.owner().active = false; f.owner().textBindings = [];
        expect(await reapprove._handler(f.action, f.pin())).toMatchObject({ active: true, generation: 3, revision: 5 });
        expect(f.owner().textBindings).toHaveLength(2);
    });
    it('does not migrate an existing approval to a different valid captured recipe', async () => {
        const f = await fixture(); await f.created(); f.signIn('designer');
        const config = f.config(); config.recipe.label = 'Different valid recipe';
        f.replaceSource(IMPORTED_STUDIO_CONFIG_PATH, serializeImportedStudioConfig(config));
        const count = f.writes.length;
        await expect(reapprove._handler(f.action, { ...f.pin(), expectedRecipeFingerprint: hash(serializeImportedStudioRecipe(config)) }))
            .rejects.toThrow('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
        expect(f.writes).toHaveLength(count);
    });
    it('refuses reapproval after recipe changes and refuses cross-family overwrite', async () => {
        for (const kind of ['recipe', 'family'] as const) {
            const f = await fixture(); await f.created(); f.signIn('designer');
            if (kind === 'recipe') f.replaceSource(IMPORTED_STUDIO_PAGE_PATH, String(f.file(IMPORTED_STUDIO_PAGE_PATH).text).replace('Title', 'Changed'));
            else f.owner().version = 1;
            const count = f.writes.length; await expect(reapprove._handler(f.action, f.pin())).rejects.toThrow(); expect(f.writes).toHaveLength(count);
        }
    });
    it.each(['hash', 'path', 'bytes'] as const)('independently rejects a corrupted planned %s before writes', async kind => {
        const f = await fixture(); await f.created(); const count = f.writes.length;
        f.beforeMutation(args => {
            const changes = args.changes as Array<{ path: string; hash: string; bytes: number }>;
            if (kind === 'hash') changes[0]!.hash = '0'.repeat(64);
            if (kind === 'path') changes[0]!.path = 'src/app/layout.tsx';
            if (kind === 'bytes') changes[0]!.bytes++;
        });
        await expect(f.execute({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'second' })).rejects.toThrow();
        expect(f.writes).toHaveLength(count);
    });
    it('refuses a fresh operation after grant loss during planning and scope mismatch before planning', async () => {
        const f = await fixture(); await f.created(); const count = f.writes.length;
        const request = f.request({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'second' });
        await expect(commit._handler(f.action, { ...request, projectId: 'projects:foreign' as Id<'projects'> })).rejects.toThrow();
        f.beforeMutation(() => { f.table('cloudEditorGrants').delete('cloudEditorGrants:customer'); });
        await expect(commit._handler(f.action, request)).rejects.toThrow('CLOUD_IMPORTED_STUDIO_DISABLED');
        expect(f.writes).toHaveLength(count);
    });
});
