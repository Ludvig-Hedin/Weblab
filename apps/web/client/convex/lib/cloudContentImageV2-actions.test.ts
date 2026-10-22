import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import * as backend from '../cloudEditorContentImages';
import { approveV2, commitV2, prepareV2, resolveSelection } from '../cloudEditorContentImageActions';
import { createCloudImageContract, type ContentImageBinding } from './cloudContentImageContract';
import { imageHash, imageMetadataProof, imagePath } from './cloudContentImage';
import { importedImageApprovalIdentity } from './cloudImportedMedia';
import { hashPreparationPolicy } from './cloudImportedState';
import { resolveContentImageRenderMapping } from '@weblab/parser/src/code-edit/content-image-render-mapping';
import { readContentImageTarget, replaceContentImageTarget } from '@weblab/parser/src/code-edit/content-image-target';

const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const actorId = 'users:customer' as Id<'users'>, designerId = 'users:designer' as Id<'users'>;
const ownerPath = 'src/content/about.ts';
const ownerText = 'export const aboutHero = { imageSrc: "/media/hero.webp", imageAlt: "Before", imageWidth: 1600, imageHeight: 900, heading: ["Keep"] } as const;';
const selection = { oid: 'hero-img', mappingId: 'about-hero', itemId: 'single' as const };
const secret = 'server-image-secret'.repeat(3);
const flags = ['WEBLAB_CLOUD_EDITOR_ENABLED', 'WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED', 'WEBLAB_CLOUD_IMPORTED_IMAGES_ENABLED', 'WEBLAB_CLOUD_IMAGE_SECRET'] as const;
const prior = new Map<string, string | undefined>();
beforeEach(() => { for (const flag of flags) { prior.set(flag, process.env[flag]); process.env[flag] = flag === 'WEBLAB_CLOUD_IMAGE_SECRET' ? secret : 'true'; } });
afterEach(() => { for (const flag of flags) { if (prior.get(flag) === undefined) delete process.env[flag]; else process.env[flag] = prior.get(flag); } });
type Row = Record<string, unknown> & { _id: string };
async function fixture(withSibling = false) {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _creationTime: 1, ...value, _id: id });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    const writes: string[] = [], scheduled: string[] = [], blobs = new Map<string, Blob>();
    let subject = 'customer', sequence = 0, beforeCommit: (() => void) | null = null;
    const metric = { used: 0, remaining: 20_000_000 };
    const ctx = { auth: { getUserIdentity: async () => ({ subject, tokenIdentifier: `issuer|${subject}` }) },
        meta: { getTransactionMetrics: async () => ({ bytesRead: metric, bytesWritten: metric, documentsRead: metric, documentsWritten: metric, databaseQueries: metric }) },
        storage: { getUrl: async (id: string) => `https://test.convex.cloud/api/storage/${id}` },
        db: { get: async (id: string) => get(id), system: { get: async (id: string) => get(id) },
            insert: async (name: string, row: Record<string, unknown>) => { const id = `${name}:new${++sequence}`; put(name, id, row); writes.push(name); return id; },
            patch: async (id: string, row: Record<string, unknown>) => { Object.assign(get(id)!, row); writes.push(id); },
            replace: async (id: string, row: Record<string, unknown>) => { put(id.split(':')[0]!, id, row); writes.push(id); },
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); writes.push(id); },
            query: (name: string) => {
                const filters: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { filters.push([key, value]); return index; }, gte: () => index };
                const rows = () => [...table(name).values()].filter(row => filters.every(([key, value]) => key === 'asset.path' ? (row.asset as { path: string }).path === value : row[key] === value));
                const query = { withIndex: (_index: string, build: (value: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => rows(), take: async (limit: number) => rows().slice(0, limit),
                    unique: async () => { if (rows().length > 1) throw Error('Duplicate'); return rows()[0] ?? null; } };
                return query;
            } }, scheduler: { runAfter: async (_delay: number, ref: Parameters<typeof getFunctionName>[0]) => { scheduled.push(getFunctionName(ref)); } },
    } as unknown as MutationCtx;
    put('workspaces', 'workspaces:one', { createdByUserId: designerId });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' }); put('branches', scope.branchId, { projectId: scope.projectId });
    for (const user of ['customer', 'designer', 'other']) {
        put('users', `users:${user}`, { clerkUserId: user });
        put('workspaceMembers', `workspaceMembers:${user}`, { workspaceId: 'workspaces:one', userId: `users:${user}`, role: user === 'designer' ? 'admin' : 'member' });
        put('projectMembers', `projectMembers:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'designer' ? 'manager' : 'viewer' });
        put('cloudEditorGrants', `cloudEditorGrants:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'designer' ? 'designer' : 'content' });
    }
    const sources: Record<string, string> = {
        'package.json': '{}', 'bun.lock': '{}', 'next.config.ts': 'export default {};', 'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
        'next-env.d.ts': '// types', 'src/app/layout.tsx': 'export default function Layout({children}) { return <html><body>{children}</body></html>; }',
        'public/weblab-preload-script.js': 'void 0;', 'public/weblab-ix-runtime.js': 'void 0;', [ownerPath]: ownerText,
        'src/app/about/page.tsx': 'import { aboutHero } from "@/content/about"; import { PageHero } from "@/components/page-hero"; export default function AboutPage() { return <PageHero {...aboutHero} data-oid="about-call" weblabContentMapping="about-hero" />; }',
        'src/components/page-hero.tsx': 'type Props = { imageSrc: string; imageAlt: string; imageWidth: number; imageHeight: number; weblabContentMapping?: string }; export function PageHero({ imageSrc, imageAlt, imageWidth, imageHeight, weblabContentMapping }: Props) { return <section><img data-oid="hero-img" data-weblab-content-map={weblabContentMapping} data-weblab-content-item="single" src={imageSrc} alt={imageAlt} width={imageWidth} height={imageHeight} /></section>; }',
    };
    if (withSibling) {
        sources[ownerPath] += '\n' + ownerText.replace('aboutHero', 'otherHero');
        sources['src/app/other/page.tsx'] = sources['src/app/about/page.tsx']!.replaceAll('aboutHero', 'otherHero').replaceAll('AboutPage', 'OtherPage').replaceAll('about-call', 'other-call').replaceAll('about-hero', 'other-hero');
    }
    for (const [path, text] of Object.entries(sources)) put('cloudEditorFiles', `cloudEditorFiles:${path}`, { ...scope, path, kind: 'file', text, hash: imageHash(text), bytes: Buffer.byteLength(text) });
    const asset = { path: 'public/media/hero.webp', hash: imageHash('original'), bytes: 8 };
    put('cloudEditorFiles', 'cloudEditorFiles:original', { ...scope, ...asset, kind: 'file', storageId: '_storage:original' });
    put('_storage', '_storage:original', { size: 8, sha256: asset.hash });
    put('cloudEditorImports', 'cloudEditorImports:baseline', { ...scope, workspaceId: 'workspaces:one', state: 'finalized', manifestHash: 'a'.repeat(64), files: [{ ...asset, kind: 'binary' }] });
    put('cloudEditorImportFiles', 'cloudEditorImportFiles:original', { attemptId: 'cloudEditorImports:baseline', index: 0, ...asset, state: 'received', valid: true, storageId: '_storage:original' });
    const pinPaths = ['package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'src/app/layout.tsx', 'public/weblab-preload-script.js', 'public/weblab-ix-runtime.js'];
    const policy = { kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: pinPaths.map(path => ({ path, hash: imageHash(sources[path]!), bytes: Buffer.byteLength(sources[path]!) })) };
    put('cloudEditorImportPreparations', 'cloudEditorImportPreparations:one', { ...scope, workspaceId: 'workspaces:one', baselineAttemptId: 'cloudEditorImports:baseline',
        generation: 1, profileVersion: 1, preparationVersion: 1, inputRevision: 1, preparedRevision: 2, baselineManifestHash: 'a'.repeat(64), inputManifestHash: 'a'.repeat(64), preparedManifestHash: 'b'.repeat(64), policy: { ...policy, policyHash: await hashPreparationPolicy(policy) } });
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId: 'workspaces:one', version: 1, profile: 'imported-next-v1', revision: 3, designRevision: 2,
        preparationId: 'cloudEditorImportPreparations:one', createdByUserId: designerId, status: 'stopped' });
    const binding: ContentImageBinding = { bindingId: 'about-hero', target: { kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' },
        fields: ['src', 'alt'], allowImageUploads: true, originalAsset: asset, allowedAssets: [asset], aspectRatio: { width: 16, height: 9 },
        renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about-hero', callsite: { path: 'src/app/about/page.tsx', exportName: 'AboutPage', oid: 'about-call' },
            renderer: { path: 'src/components/page-hero.tsx', exportName: 'PageHero', oid: 'hero-img' } } };
    // Fail fixture setup at its real grammar boundary, rather than letting negative authority cases pass for the wrong reason.
    const resolved = resolveContentImageRenderMapping(sources, selection);
    expect(resolved.path).toBe(ownerPath);
    expect(resolved.renderMapping).toEqual(binding.renderMapping);
    const sibling: ContentImageBinding = { ...binding, bindingId: 'other-hero', target: { ...binding.target, exportName: 'otherHero' },
        renderMapping: { ...binding.renderMapping, mappingId: 'other-hero', callsite: { path: 'src/app/other/page.tsx', exportName: 'OtherPage', oid: 'other-call' } } };
    const contract = createCloudImageContract(ownerPath, sources[ownerPath]!, withSibling ? [binding, sibling] : [binding]);
    put('cloudEditorContentContracts', 'cloudEditorContentContracts:one', { ...scope, ...contract, bindings: [], imageBindings: contract.bindings, active: true, generation: 1, designRevision: 2 });
    const pin = { version: 2 as const, path: ownerPath, generation: 1, designRevision: 2, fingerprint: contract.fingerprint, binding: contract.bindings[0]! };
    const handlers: Record<string, { _handler: (ctx: MutationCtx, args: never) => Promise<unknown> }> = backend as unknown as Record<string, { _handler: (ctx: MutationCtx, args: never) => Promise<unknown> }>;
    const run = async (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const name = getFunctionName(ref).split(':')[1]!;
        if (name === '_commitV2') beforeCommit?.();
        const snapshot = structuredClone(tables), count = writes.length;
        try { return await handlers[name]!._handler(ctx, args as never); }
        catch (error) { tables.clear(); for (const [key, value] of snapshot) tables.set(key, value); writes.splice(count); throw error; }
    };
    const action = { runQuery: run, runMutation: run, storage: {
        store: async (blob: Blob) => { const id = `_storage:new${++sequence}`; blobs.set(id, blob); put('_storage', id, { size: blob.size, sha256: imageHash(await blob.arrayBuffer()) }); return id; },
        delete: async (id: string) => { blobs.delete(id); table('_storage').delete(id); },
    } } as unknown as ActionCtx;
    function request(patch: Partial<{ src: string; alt: string }>, operationId = 'image_values_operation_1'): FunctionArgs<typeof commitV2> {
        const source = get(`cloudEditorFiles:${ownerPath}`)!.text as string, previous = readContentImageTarget(source, pin.binding.target);
        return { ...scope, actorId, expectedRevision: get('cloudEditorStates:one')!.revision as number, operationId,
            transport: 'content-image', transportVersion: 2, pin, previous, image: { kind: 'values' },
            changes: [{ path: ownerPath, content: replaceContentImageTarget(source, pin.binding.target, previous, { ...previous, ...patch }) }] };
    }
    async function upload() {
        const operationId = 'image_upload_operation_1';
        const attemptId = await backend.reserveV2._handler(ctx, { ...scope, actorId, expectedRevision: 3, operationId, pin });
        const bytes = Uint8Array.from([1, 2, 3]).buffer, hash = imageHash(bytes);
        const proof = imageMetadataProof(secret, { kind: 'upload', attemptId, hash, bytes: 3, width: 1600, height: 900 });
        await prepareV2._handler(action, { attemptId, actorId, bytes, width: 1600, height: 900, proof });
        const candidate = request({ src: imagePath(hash).slice(6) }, operationId);
        candidate.image = { kind: 'upload', attemptId }; candidate.changes.push({ path: imagePath(hash), content: bytes });
        return { candidate, attemptId, bytes, hash };
    }
    return { ctx, action, get, put, table, writes, scheduled, pin, asset, request, upload, signIn: (value: string) => { subject = value; }, beforeCommit: (fn: () => void) => { beforeCommit = fn; } };
}

describe('imported image v2 authority actions', () => {
    it('edits only the approved alt and replays its receipt after gate and approval revocation', async () => {
        const f = await fixture(), request = f.request({ alt: 'After' });
        expect(await commitV2._handler(f.action, request)).toEqual({ revision: 4, currentRevision: 4 });
        const before = f.writes.length;
        f.get('cloudEditorContentContracts:one')!.active = false; process.env.WEBLAB_CLOUD_IMPORTED_IMAGES_ENABLED = 'false';
        expect(await commitV2._handler(f.action, request)).toEqual({ revision: 4, currentRevision: 4 });
        expect(f.writes).toHaveLength(before);
        await expect(commitV2._handler(f.action, { ...request, operationId: 'new_image_operation_1' })).rejects.toThrow('CLOUD_IMPORTED_IMAGES_DISABLED');
        f.signIn('other'); await expect(commitV2._handler(f.action, request)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
    });
    it('commits upload ownership and admission once; undo/redo survive attempt cleanup without changing the pin', async () => {
        const f = await fixture(), upload = await f.upload();
        expect(await commitV2._handler(f.action, upload.candidate)).toEqual({ revision: 4, currentRevision: 4 });
        expect(f.table('cloudEditorImportedMedia').size).toBe(1); expect(f.table('cloudEditorImportedImageAdmissions').size).toBe(1);
        expect(f.get('cloudEditorContentContracts:one')).toMatchObject({ generation: 1, fingerprint: f.pin.fingerprint, designRevision: 2 });
        f.table('cloudEditorContentImageAttempts').clear();
        await commitV2._handler(f.action, f.request({ src: '/media/hero.webp' }, 'undo_image_operation_1'));
        await commitV2._handler(f.action, f.request({ src: imagePath(upload.hash).slice(6) }, 'redo_image_operation_1'));
        expect(f.get('cloudEditorStates:one')).toMatchObject({ revision: 6, designRevision: 2, status: 'stopped' });
        expect(f.table('cloudEditorImportedMedia').size).toBe(1);
    });
    it('refuses fingerprint/pin changes, sibling edits, mismatched previous values and wrong actor without writes', async () => {
        for (const change of ['pin', 'sibling', 'previous', 'actor'] as const) {
            const f = await fixture(), request = f.request({ alt: 'After' });
            if (change === 'pin') request.pin = { ...request.pin, binding: { ...request.pin.binding, fields: ['alt'] } };
            if (change === 'sibling') request.changes[0]!.content = String(request.changes[0]!.content).replace('Keep', 'Changed');
            if (change === 'previous') request.previous.alt = 'Not current';
            if (change === 'actor') f.signIn('other');
            await expect(commitV2._handler(f.action, request)).rejects.toThrow(); expect(f.writes).toHaveLength(0);
        }
    });
    it('rechecks generation and CAS in the committing transaction', async () => {
        for (const kind of ['generation', 'revision'] as const) {
            const f = await fixture(); f.beforeCommit(() => { f.get(kind === 'generation' ? 'cloudEditorContentContracts:one' : 'cloudEditorStates:one')![kind] = 10; });
            await expect(commitV2._handler(f.action, f.request({ alt: 'After' }))).rejects.toThrow(); expect(f.writes).toHaveLength(0);
        }
    });
    it('rejects mismatched binary envelopes and never stores commit bytes twice', async () => {
        const f = await fixture(), upload = await f.upload(), count = f.table('_storage').size;
        upload.candidate.changes[1]!.content = Uint8Array.from([9, 9, 9]).buffer;
        await expect(commitV2._handler(f.action, upload.candidate)).rejects.toThrow('CLOUD_INVALID_UPLOAD');
        expect(f.table('_storage').size).toBe(count); expect(f.table('cloudEditorImportedMedia').size).toBe(0);
    });
    it('resolves and approves only a signed current private image with designer authority', async () => {
        const f = await fixture(); f.signIn('designer'); f.table('cloudEditorContentContracts').clear();
        const resolved = await resolveSelection._handler(f.action, { ...scope, actorId: designerId, expectedRevision: 3, ...selection });
        expect(resolved).toMatchObject({ path: ownerPath, generation: 0, asset: f.asset, conflictingFamily: null });
        const inspection = { ...f.asset, width: 1600, height: 900, proof: imageMetadataProof(secret, { kind: 'approval', ...scope, actorId: designerId, revision: 3, ...f.asset, width: 1600, height: 900 }) };
        const request = { ...scope, actorId: designerId, expectedRevision: 3, expectedGeneration: 0, selection, bindingId: 'about-hero', fields: ['src', 'alt'] as Array<'src' | 'alt'>, allowImageUploads: true, inspection };
        await expect(approveV2._handler(f.action, { ...request, inspection: { ...inspection, width: 1601 } })).rejects.toThrow('CLOUD_INVALID_UPLOAD');
        expect(f.table('cloudEditorContentContracts').size).toBe(0);
        expect(await approveV2._handler(f.action, request)).toMatchObject({ generation: 1, designRevision: 2, version: 2 });
    });
    it('keeps text-family approval and revoke separate and refuses v2 attempts on legacy preparation', async () => {
        const f = await fixture(), upload = await f.upload();
        await expect(backend._preparation._handler(f.ctx, { attemptId: upload.attemptId })).rejects.toThrow('CLOUD_INVALID_UPLOAD');
        f.signIn('designer'); const row = f.get('cloudEditorContentContracts:one')!;
        row.textBindings = [{ bindingId: 'text', target: { kind: 'data-leaf', exportName: 'value', itemId: 'one', property: 'title' } }]; delete row.imageBindings;
        expect((await backend.imageContracts._handler(f.ctx, scope)).contracts).toHaveLength(0);
        await expect(backend.revokeV2._handler(f.ctx, { ...scope, actorId: designerId, path: ownerPath, expectedGeneration: 1 })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
    });
});


describe('v2 upload retention boundaries', () => {
    it('refuses reapproval that would strand a retained sibling on an old upload admission', async () => {
        const f = await fixture(true), upload = await f.upload();
        await commitV2._handler(f.action, upload.candidate);
        f.signIn('designer');
        const writes = f.writes.length;
        const inspection = { ...f.asset, width: 1600, height: 900, proof: imageMetadataProof(secret, {
            kind: 'approval', ...scope, actorId: designerId, revision: 4, ...f.asset, width: 1600, height: 900,
        }) };
        await expect(approveV2._handler(f.action, { ...scope, actorId: designerId, expectedRevision: 4,
            expectedGeneration: 1, selection: { ...selection, mappingId: 'other-hero' }, bindingId: 'other-hero',
            fields: ['src', 'alt'], allowImageUploads: true, inspection })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        expect(f.writes).toHaveLength(writes);
        expect(f.get('cloudEditorContentContracts:one')).toMatchObject({ generation: 1, fingerprint: f.pin.fingerprint });
        expect(f.get('cloudEditorStates:one')!.revision).toBe(4);
    });
    it.each(['resolve', 'approve', 'commit'] as const)('refuses a hidden public executable before %s writes', async operation => {
        const f = await fixture();
        const hidden = 'import { aboutHero } from "../src/content/about"; console.log(aboutHero);';
        f.put('cloudEditorFiles', 'cloudEditorFiles:hidden', { ...scope, path: 'public/hidden.ts', kind: 'file',
            storageId: '_storage:hidden', hash: imageHash(hidden), bytes: Buffer.byteLength(hidden) });
        let result: Promise<unknown>;
        if (operation === 'commit') result = commitV2._handler(f.action, f.request({ alt: 'After' }));
        else {
            f.signIn('designer');
            if (operation === 'resolve') result = resolveSelection._handler(f.action, { ...scope, actorId: designerId, expectedRevision: 3, ...selection });
            else result = approveV2._handler(f.action, { ...scope, actorId: designerId, expectedRevision: 3,
                expectedGeneration: 1, selection, bindingId: 'about-hero', fields: ['src', 'alt'], allowImageUploads: true,
                inspection: { ...f.asset, width: 1600, height: 900, proof: imageMetadataProof(secret, {
                    kind: 'approval', ...scope, actorId: designerId, revision: 3, ...f.asset, width: 1600, height: 900,
                }) } });
        }
        await expect(result).rejects.toThrow('CLOUD_CONTENT_INVALID_TARGET');
        expect(f.writes).toHaveLength(0);
        expect(f.get(`cloudEditorFiles:${ownerPath}`)!.text).toBe(ownerText);
        expect(f.get('cloudEditorStates:one')!.revision).toBe(3);
    });
    it('deduplicates to the existing source storage tuple while retaining the unused attempt for cleanup', async () => {
        const f = await fixture(), first = await f.upload(); await commitV2._handler(f.action, first.candidate);
        const sourceAsset = [...f.table('cloudEditorFiles').values()].find(row => row.path === imagePath(first.hash))!;
        const storageId = sourceAsset.storageId;
        const operationId = 'image_upload_operation_2';
        const attemptId = await backend.reserveV2._handler(f.ctx, { ...scope, actorId, expectedRevision: 4, operationId, pin: f.pin });
        await prepareV2._handler(f.action, { attemptId, actorId, bytes: first.bytes, width: 1600, height: 900,
            proof: imageMetadataProof(secret, { kind: 'upload', attemptId, hash: first.hash, bytes: 3, width: 1600, height: 900 }) });
        expect(f.get(attemptId)!.storageId).not.toBe(storageId);
        const request = f.request({ alt: 'After duplicate upload' }, operationId); request.image = { kind: 'upload', attemptId };
        await commitV2._handler(f.action, request);
        expect([...f.table('cloudEditorFiles').values()].find(row => row.path === imagePath(first.hash))!.storageId).toBe(storageId);
        expect(f.table('cloudEditorImportedMedia').size).toBe(1); expect(f.table('cloudEditorImportedImageAdmissions').size).toBe(1);
        expect([...f.table('cloudEditorOperations').values()].find(row => row.operationId === operationId)!.storageIds).toEqual([storageId]);
    });
    it('refuses a65th distinct admission atomically but permits preparation to identify a duplicate', async () => {
        const f = await fixture();
        const approval = { ownerPath, bindingId: f.pin.binding.bindingId, generation: f.pin.generation, designRevision: f.pin.designRevision, fingerprint: f.pin.fingerprint };
        const approvalIdentity = await importedImageApprovalIdentity(scope, approval);
        for (let i = 0; i < 64; i++) {
            const hash = i.toString(16).padStart(64, '0');
            f.put('cloudEditorImportedImageAdmissions', `cloudEditorImportedImageAdmissions:${i}`, { ...scope, approval, approvalIdentity,
                asset: { path: imagePath(hash), hash, bytes: 3, storageId: `_storage:${i}`, mime: 'image/webp', width: 1600, height: 900 } });
        }
        const upload = await f.upload(), before = f.writes.length;
        await expect(commitV2._handler(f.action, upload.candidate)).rejects.toThrow('CLOUD_IMPORTED_IMAGE_ADMISSION_LIMIT');
        expect(f.writes).toHaveLength(before); expect(f.get(`cloudEditorFiles:${ownerPath}`)!.text).toBe(ownerText);
        expect(f.table('cloudEditorImportedMedia').size).toBe(0);
    });
    it('refuses ratio and actual storage-digest mismatches before source writes', async () => {
        const f = await fixture(), operationId = 'image_upload_operation_1';
        const attemptId = await backend.reserveV2._handler(f.ctx, { ...scope, actorId, expectedRevision: 3, operationId, pin: f.pin });
        const bytes = Uint8Array.from([1, 2, 3]).buffer, hash = imageHash(bytes);
        await expect(prepareV2._handler(f.action, { attemptId, actorId, bytes, width: 900, height: 1600,
            proof: imageMetadataProof(secret, { kind: 'upload', attemptId, hash, bytes: 3, width: 900, height: 1600 }) })).rejects.toThrow('CLOUD_IMAGE_RATIO_MISMATCH');
        f.put('_storage', '_storage:forged', { size: 3, sha256: 'f'.repeat(64) });
        expect(await backend._readyV2._handler(f.ctx, { attemptId, storageId: '_storage:forged' as Id<'_storage'>, hash, bytes: 3, width: 1600, height: 900 })).toBe(false);
        expect(f.get(attemptId)!.status).toBe('open'); expect(f.table('cloudEditorImportedMedia').size).toBe(0);
    });
});
