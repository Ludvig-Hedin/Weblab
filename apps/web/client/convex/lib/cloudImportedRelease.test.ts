import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import { capture, _input, _seal, request, review, status } from '../cloudReleases';
import { _asset, list, manifest, restoreCopy } from '../cloudBackups';
import { getPreparedImport, hashPreparationPolicy } from './cloudImportedState';
import { IMPORTED_PUBLICATION_INTENT, IMPORTED_ARTIFACT_PROFILE, importedMetadata, captureImportedStudioConfig, importedArtifactProfile, importedDerivationVersion, assertSnapshotBudget, importedInventoryHash, importedReleaseSourceHash, originalImportFiles,
    snapshotCanonicalJson, snapshotDocumentBytes, validateSnapshotStage, type ImportedSnapshotFile } from './cloudImportedRelease';
import { IMPORTED_STUDIO_CONFIG_PATH, serializeImportedStudioConfig, type ImportedStudioConfigV1 } from './cloudImportedStudioState';

const actorId = 'users:agency' as Id<'users'>, workspaceId = 'workspaces:agency' as Id<'workspaces'>;
const projectId = 'projects:source' as Id<'projects'>, branchId = 'branches:source' as Id<'branches'>;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const text = (path: string, content: string): ImportedSnapshotFile => ({ path, kind: 'file', text: content, bytes: Buffer.byteLength(content), hash: hash(content) });
const flags = ['WEBLAB_CLOUD_IMPORTED_BACKUPS_ENABLED', 'WEBLAB_CLOUD_IMPORTS_ENABLED', 'WEBLAB_CLOUD_EDITOR_ENABLED'] as const;
const prior = new Map<string, string | undefined>();
beforeEach(() => { for (const key of flags) { prior.set(key, process.env[key]); process.env[key] = 'true'; } });
afterEach(() => { for (const key of flags) { const value = prior.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

type Row = Record<string, unknown> & { _id: string };
async function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
    const put = (name: string, id: string, fields: Record<string, unknown>) => table(name).set(id, { _creationTime: 1, ...fields, _id: id });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    const writes: string[] = [], schedules: unknown[] = [];
    let sequence = 0;
    const metric = () => ({ used: 0, remaining: 16_777_216 });
    const metrics = { bytesRead: metric(), bytesWritten: metric(), documentsRead: metric(), documentsWritten: metric(), databaseQueries: metric(), functionsScheduled: metric(), scheduledFunctionArgsBytes: metric() };
    const ctx = { auth: { getUserIdentity: async () => ({ subject: 'agency', tokenIdentifier: 'issuer|agency' }) },
        meta: { getTransactionMetrics: async () => metrics },
        db: { get: async (id: string) => get(id), system: { get: async (id: string) => get(id) },
            insert: async (name: string, fields: Record<string, unknown>) => { const id = `${name}:new_${++sequence}`; put(name, id, fields); writes.push(name); return id; },
            patch: async (id: string, fields: Record<string, unknown>) => { Object.assign(get(id)!, fields); writes.push(id.split(':')[0]!); },
            query: (name: string) => {
                const filters: Array<[string, unknown]> = [];
                const index = { eq: (field: string, value: unknown) => { filters.push([field, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => filters.every(([field, value]) => row[field] === value));
                const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; }, order: () => query,
                    first: async () => rows()[0] ?? null, collect: async () => rows(), take: async (count: number) => rows().slice(0, count),
                    unique: async () => { const matches = rows(); if (matches.length > 1) throw Error('Nonunique'); return matches[0] ?? null; },
                    paginate: async ({ numItems }: { numItems: number }) => ({ page: rows().slice(0, numItems), isDone: true, continueCursor: '' }) };
                return query;
            } }, scheduler: { runAfter: async (...args: unknown[]) => { schedules.push(args); return 'scheduled'; } },
    } as unknown as MutationCtx;
    put('users', actorId, { clerkUserId: 'agency' });
    put('workspaces', workspaceId, { createdByUserId: actorId });
    put('workspaceMembers', 'workspaceMembers:agency', { workspaceId, userId: actorId, role: 'admin' });
    put('projects', projectId, { workspaceId, accessMode: 'restricted', name: 'Imported site' });
    put('branches', branchId, { projectId });
    const original = [text('package.json', '{}'), text('bun.lock', '{}'), text('next.config.ts', 'export default {};'),
        text('tsconfig.json', '{}'), text('next-env.d.ts', '// declarations'),
        text('src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'),
        text('src/app/page.tsx', 'export default function Page() { return <p>Original</p>; }'),
        text('.env.example', 'NEXT_PUBLIC_SITE_URL=\n'),
        { path: 'public/movie.mp4', kind: 'file' as const, bytes: 22_695_161, hash: hash('retained media'), storageId: '_storage:movie' }];
    const runtime = [text('public/weblab-preload-script.js', 'void 0;'), text('public/weblab-ix-runtime.js', 'void 0;')];
    const source = [...original.map(file => file.path === 'src/app/page.tsx' ? text(file.path, file.text!.replace('Original', 'Current edit')) : file), ...runtime];
    const policyBody = { kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: source.filter(file => !['src/app/page.tsx', 'public/movie.mp4'].includes(file.path)).map(({ path, hash, bytes }) => ({ path, hash, bytes })) };
    const metadata: ImportedReleaseMetadata = { version: 1, capturedRevision: 7, originalManifestHash: await importedInventoryHash(original),
        preparation: { inputRevision: 1, preparedRevision: 2, inputManifestHash: await importedInventoryHash(original),
            preparedManifestHash: await importedInventoryHash([...original, ...runtime]), policy: { ...policyBody, policyHash: await hashPreparationPolicy(policyBody) },
            instrumentation: runtime.map(file => ({ path: file.path, beforeHash: null, afterHash: file.hash, addedOids: [], bootstrapChanges: true })) } };
    const baselineId = 'cloudEditorImports:original';
    put('cloudEditorImports', baselineId, { actorId, workspaceId, projectId, branchId, state: 'finalized', name: 'Original',
        files: originalImportFiles(original), bytes: original.reduce((sum, file) => sum + file.bytes, 0), manifestHash: metadata.originalManifestHash });
    original.forEach((file, index) => {
        if (file.storageId) { put('cloudEditorImportFiles', 'cloudEditorImportFiles:movie', { attemptId: baselineId, index, ...file, state: 'received', valid: true });
            put('_storage', file.storageId, { sha256: file.hash, size: file.bytes }); }
    });
    const preparationId = 'cloudEditorImportPreparations:source';
    put('cloudEditorImportPreparations', preparationId, { ...metadata.preparation, actorId, workspaceId, projectId, branchId,
        baselineAttemptId: baselineId, baselineManifestHash: metadata.originalManifestHash, generation: 1, profileVersion: 1, preparationVersion: 1 });
    put('cloudEditorStates', 'cloudEditorStates:source', { actorId, workspaceId, projectId, branchId, profile: 'imported-next-v1',
        version: 1, revision: 7, designRevision: 2, generation: 9, status: 'running', createdByUserId: actorId, preparationId });
    source.forEach(file => put('cloudEditorFiles', `cloudEditorFiles:${file.path}`, { ...file, projectId, branchId }));
    const take = (purpose: 'backup' | 'private-artifact' = 'backup') => capture._handler(ctx, { projectId, branchId, expectedRevision: 7,
        expectedActorId: actorId, operationKey: `imported_capture_${purpose}`, purpose });
    const seal = async (id: Id<'cloudReleases'>) => {
        const frozen = await _input._handler(ctx, { releaseId: id, expectedActorId: actorId });
        const captured = frozen.release.imported!;
        const sourceHash = await importedReleaseSourceHash(frozen.files);
        const artifactJson = snapshotCanonicalJson({ version: captured.version, artifactProfile: importedArtifactProfile(captured), purpose: 'backup', publicEligible: false,
            derivationVersion: importedDerivationVersion(captured), sourceHash, originalHash: captured.originalManifestHash, deployHash: null, metadata: captured, derivation: [] });
        await _seal._handler(ctx, { releaseId: id, sourceHash, hash: hash(artifactJson), artifactJson, files: [], expectedActorId: actorId });
    };
    const restore = (id: Id<'cloudReleases'>, operationKey = 'imported_restore_0001') => restoreCopy._handler(ctx, { backupId: id, name: 'Restored import', operationKey, expectedActorId: actorId });
    return { ctx, tables, table, get, put, writes, metrics, schedules, source, original, metadata, take, seal, restore };
}

describe('retained imported snapshots', () => {
    it('captures and restores the same media with current Base64 storage metadata', async () => {
        const f = await fixture();
        f.get('_storage:movie')!.sha256 = createHash('sha256').update('retained media').digest('base64');
        const id = await f.take();
        await f.seal(id);
        const restored = await f.restore(id);
        expect(restored.projectId).not.toBe(projectId);
        expect([...f.table('cloudEditorFiles').values()].some(file => file.branchId === restored.branchId && file.storageId === '_storage:movie')).toBe(true);
    });
    it('captures both exact trees with one reference per blob and exact operation replay', async () => {
        const f = await fixture(); const id = await f.take();
        expect(f.table('cloudReleaseFiles').size).toBe(f.source.length + f.original.length);
        expect(f.table('cloudReleaseAssets').size).toBe(1);
        const count = f.writes.length;
        expect(await f.take()).toBe(id); expect(f.writes).toHaveLength(count);
        expect(f.schedules).toHaveLength(0);
        expect(f.get(id)).toMatchObject({ imported: f.metadata, artifactProfile: IMPORTED_ARTIFACT_PROFILE, purpose: 'backup' });
    });
    it('seals and restores frozen data after mutable head preparation breaks, with a fresh design epoch', async () => {
        const f = await fixture(); const id = await f.take();
        f.get('cloudEditorFiles:next.config.ts')!.text = 'broken current config';
        expect((await _input._handler(f.ctx, { releaseId: id, expectedActorId: actorId })).files.find(file => file.path === 'next.config.ts')?.text).toBe('export default {};');
        await f.seal(id);
        const sealedWrites = f.writes.length;
        await f.seal(id);
        expect(f.writes).toHaveLength(sealedWrites);
        const result = await f.restore(id);
        const state = [...f.table('cloudEditorStates').values()].find(row => row.projectId === result.projectId)!;
        expect(state).toMatchObject({ profile: 'imported-next-v1', revision: 7, designRevision: 7, generation: 0, status: 'stopped', createdByUserId: actorId });
        expect(await getPreparedImport(f.ctx, state as Doc<'cloudEditorStates'>)).not.toBeNull();
        expect(f.table('cloudEditorGrants').size).toBe(0);
        expect(f.table('cloudEditorContentBindings').size).toBe(0);
        expect(f.schedules).toHaveLength(0);
        const count = f.writes.length;
        expect(await f.restore(id)).toEqual(result); expect(f.writes).toHaveLength(count);
        f.table('projects').delete(result.projectId);
        await expect(f.restore(id)).rejects.toThrow('CLOUD_BACKUP_RESTORE_REMOVED');
    });
    it('restores after source deletion using current workspace authority and retained private blobs', async () => {
        const f = await fixture(); const id = await f.take(); await f.seal(id);
        f.table('projects').delete(projectId); f.table('cloudEditorStates').delete('cloudEditorStates:source');
        expect((await list._handler(f.ctx, { workspaceId, paginationOpts: { numItems: 20, cursor: null } })).page[0]).toMatchObject({ id, canDownload: false, canRestore: true });
        expect(await f.restore(id)).toHaveProperty('projectId');
        f.get('workspaceMembers:agency')!.role = 'member';
        await expect(manifest._handler(f.ctx, { backupId: id })).rejects.toThrow('FORBIDDEN');
    });
    it('keeps retained reads available with admission off but refuses new capture/restore and legacy downloads', async () => {
        const f = await fixture(); const id = await f.take(); await f.seal(id);
        process.env.WEBLAB_CLOUD_IMPORTED_BACKUPS_ENABLED = 'false';
        expect((await list._handler(f.ctx, { workspaceId, paginationOpts: { numItems: 20, cursor: null } })).page[0]).toMatchObject({ canRestore: false, canDownload: false });
        expect((await manifest._handler(f.ctx, { backupId: id })).version).toBe(2);
        await expect(f.take()).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
        await expect(f.restore(id)).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
        await expect(_asset._handler(f.ctx, { backupId: id, path: 'public/movie.mp4' })).rejects.toThrow('CLOUD_IMPORTED_BACKUP_DOWNLOAD_UNAVAILABLE');
    });
    it('refuses a changed actor and content-only role before any write', async () => {
        const f = await fixture(); const id = await f.take(); await f.seal(id); const count = f.writes.length;
        await expect(_input._handler(f.ctx, { releaseId: id, expectedActorId: 'users:other' as Id<'users'> })).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        await expect(restoreCopy._handler(f.ctx, { backupId: id, name: 'Copy', operationKey: 'imported_restore_0002', expectedActorId: 'users:other' as Id<'users'> })).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        f.put('cloudEditorGrants', 'cloudEditorGrants:agency', { projectId, userId: actorId, role: 'content', publish: true });
        await expect(f.restore(id)).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        expect(f.writes).toHaveLength(count);
    });
    it('refuses a changed revision and oversized original manifest without capturing partial trees', async () => {
        const f = await fixture(); f.get('cloudEditorStates:source')!.revision = 8;
        await expect(f.take()).rejects.toThrow('CLOUD_CONFLICT'); expect(f.writes).toHaveLength(0);
        const g = await fixture();
        const original = g.get('cloudEditorImports:original')!;
        original.files = [...original.files as object[], { path: 'oversized.txt', kind: 'text', text: 'x'.repeat(800_001), bytes: 800_001, hash: hash('x'.repeat(800_001)) }];
        await expect(g.take()).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE'); expect(g.writes).toHaveLength(0);
    });
    it('refuses mismatched original receipt and missing retained media without partial writes', async () => {
        const f = await fixture(); f.get('cloudEditorImportFiles:movie')!.hash = 'f'.repeat(64);
        await expect(f.take()).rejects.toThrow('CLOUD_IMPORT_INCOMPLETE'); expect(f.writes).toHaveLength(0);
        const g = await fixture(); const id = await g.take(); await g.seal(id); const count = g.writes.length;
        g.table('_storage').clear(); await expect(g.restore(id)).rejects.toThrow('CLOUD_IMPORTED_MEDIA_INVALID'); expect(g.writes).toHaveLength(count);
    });
    it('never admits imported build, review or live switches and returns closed status', async () => {
        const f = await fixture(); const id = await f.take('private-artifact');
        for (const kind of ['build', 'publish', 'rollback'] as const) await expect(request._handler(f.ctx, { releaseId: id, operationKey: 'forged_release_operation', kind, expectedLiveReleaseId: null })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        await expect(review._handler(f.ctx, { releaseId: id, hash: 'a'.repeat(64) })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ canPublish: false, enabled: false, buildEnabled: false, operations: [], canRestoreBackup: true });
        expect(f.schedules).toHaveLength(0);
    });
    it('refuses transaction headroom and document/file overflow before snapshot writes', async () => {
        const f = await fixture(); f.metrics.bytesRead.used = 12_000_001;
        await expect(f.take()).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE'); expect(f.writes).toHaveLength(0);
        expect(() => snapshotDocumentBytes({ text: 'x'.repeat(800_001) })).toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
        await expect(validateSnapshotStage(Array.from({ length: 401 }, (_, i) => text(`file-${i}.txt`, 'x')), 'source')).rejects.toThrow('CLOUD_IMPORTED_SNAPSHOT_TOO_LARGE');
        f.metrics.bytesRead.used = 0; f.metrics.databaseQueries.used = 512;
        await expect(assertSnapshotBudget(f.ctx, { readCalls: 1 })).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
    });
});

async function mediaFixture() {
    const f = await fixture();
    const digest = hash('normalized uploaded image');
    const asset = { path: `public/weblab-upload-${digest}.webp`, hash: digest, bytes: 200, storageId: '_storage:upload', mime: 'image/webp', width: 1600, height: 900 };
    const origin = { version: 1, kind: 'upload', actorId, attemptId: 'cloudEditorContentImageAttempts:committed', operationId: 'image_upload_operation_1', sourceRevision: 7,
        approval: { ownerPath: 'src/content/about.ts', bindingId: 'hero', generation: 1, designRevision: 2, fingerprint: 'd'.repeat(64) } };
    f.put('cloudEditorFiles', `cloudEditorFiles:${asset.path}`, { projectId, branchId, path: asset.path, hash: asset.hash, bytes: asset.bytes, storageId: asset.storageId, kind: 'file' });
    f.put('_storage', asset.storageId, { sha256: asset.hash, size: asset.bytes });
    f.put('cloudEditorImportedMedia', 'cloudEditorImportedMedia:upload', { projectId, branchId, version: 1, asset, origin });
    return { ...f, asset };
}
describe('retained uploaded media version 2', () => {
    it('freezes uploaded ownership, restores it without permission, and can capture the restored copy again', async () => {
        const f = await mediaFixture(), id = await f.take();
        expect(f.get(id)).toMatchObject({ artifactProfile: 'imported-next-private-v2', imported: { version: 2 } });
        expect(f.table('cloudReleaseAssets').size).toBe(2);
        const frozen = [...f.table('cloudReleaseFiles').values()].find(row => row.path === f.asset.path)!;
        expect(frozen).toHaveProperty('media');
        await f.seal(id);
        f.table('cloudEditorImportedMedia').clear();
        f.table('cloudEditorContentImageAttempts').clear();
        f.get(`cloudEditorFiles:${f.asset.path}`)!.hash = 'e'.repeat(64);
        const restored = await f.restore(id);
        const owned = [...f.table('cloudEditorImportedMedia').values()];
        expect(owned).toHaveLength(1);
        expect(owned[0]).toMatchObject({ ...restored, asset: f.asset, origin: { kind: 'restore', backupId: id } });
        const files = [...f.table('cloudEditorFiles').values()].filter(row => row.branchId === restored.branchId);
        expect(files.find(row => row.path === f.asset.path)).not.toHaveProperty('media');
        expect(f.table('cloudEditorImportedImageAdmissions').size).toBe(0);
        expect(f.table('cloudEditorContentContracts').size).toBe(0);
        expect(f.table('cloudEditorGrants').size).toBe(0);
        const second = await capture._handler(f.ctx, { ...restored, expectedRevision: 7, expectedActorId: actorId, operationKey: 'restored_media_capture_1', purpose: 'backup' });
        expect(f.get(second)).toMatchObject({ imported: { version: 2 }, artifactProfile: 'imported-next-private-v2' });
    });
    it.each(['missing', 'duplicate', 'irrelevant', 'swapped'] as const)('refuses %s ownership before capture writes', async change => {
        const f = await mediaFixture();
        const row = f.get('cloudEditorImportedMedia:upload')!;
        if (change === 'missing') f.table('cloudEditorImportedMedia').clear();
        else if (change === 'duplicate') f.put('cloudEditorImportedMedia', 'cloudEditorImportedMedia:duplicate', row);
        else if (change === 'irrelevant') f.table('cloudEditorFiles').delete(`cloudEditorFiles:${f.asset.path}`);
        else row.asset = { ...f.asset, storageId: '_storage:forged' };
        await expect(f.take()).rejects.toThrow(change === 'duplicate' || change === 'irrelevant' ? 'CLOUD_IMPORTED_ARTIFACT_INVALID' : 'CLOUD_IMPORTED_MEDIA_INVALID');
        expect(f.writes).toHaveLength(0);
    });
    it('refuses corrupted frozen provenance or a missing uploaded blob before restore writes', async () => {
        const f = await mediaFixture(), id = await f.take(); await f.seal(id);
        const count = f.writes.length;
        f.table('_storage').delete(f.asset.storageId);
        await expect(f.restore(id)).rejects.toThrow('CLOUD_IMPORTED_MEDIA_INVALID');
        expect(f.writes).toHaveLength(count);
        const g = await mediaFixture(), other = await g.take(); await g.seal(other);
        const row = [...g.table('cloudReleaseFiles').values()].find(row => row.path === g.asset.path)!;
        delete row.media;
        const before = g.writes.length;
        await expect(g.restore(other)).rejects.toThrow(); expect(g.writes).toHaveLength(before);
    });
});

// Handler fixtures intentionally exercise V8 shape/provenance, not the separate Node AST proof.
function savedStudioConfig(): string {
    const page = text('src/components/weblab-templates/basic-page.tsx', 'captured page recipe');
    const block = text('src/components/weblab-templates/text-block.tsx', 'captured block recipe');
    const config: ImportedStudioConfigV1 = { version: 1, recipe: {
        id: 'basic-page-v1', label: 'Agency page',
        page: { path: page.path, hash: page.hash, bytes: page.bytes, source: page.text!, exportName: 'BasicPage' },
        block: { path: block.path, hash: block.hash, bytes: block.bytes, source: block.text!, exportName: 'TextBlock', id: 'text-block-v1', label: 'Text' },
        stylesheet: { path: 'src/styles/agency.module.css', specifier: '@/styles/agency.module.css', hash: hash('.page{}'), bytes: 7 },
        assets: [], slots: [{ key: 'body', blockId: 'text-block-v1', min: 0, max: 3 }],
    }, pages: [] };
    return serializeImportedStudioConfig(config);
}
function addStudioSource(f: Awaited<ReturnType<typeof fixture>>, content = savedStudioConfig()) {
    const file = text(IMPORTED_STUDIO_CONFIG_PATH, content);
    f.put('cloudEditorFiles', `cloudEditorFiles:${file.path}`, { ...file, projectId, branchId });
    return file;
}

describe('retained imported Studio config', () => {
    it.each([false, true])('retains exact config with media=%s and restores no authority after original deletion', async withMedia => {
        const f = withMedia ? await mediaFixture() : await fixture(), file = addStudioSource(f), id = await f.take();
        const marker = { path: file.path, hash: file.hash, bytes: file.bytes };
        expect(f.get(id)).toMatchObject({ imported: { version: withMedia ? 2 : 1, studioConfig: marker }, studioInputJson: 'null' });
        await f.seal(id);
        expect(JSON.parse(String(f.get(id)!.artifactJson))).toMatchObject({ derivationVersion: 2, deployHash: null, derivation: [] });
        for (const table of ['cloudEditorStudioContracts', 'cloudEditorContentContracts', 'cloudEditorImportedImageAdmissions']) {
            f.put(table, `${table}:old`, { projectId, branchId, active: true });
        }
        f.table('projects').delete(projectId); f.table('cloudEditorStates').delete('cloudEditorStates:source');
        const beforeRestore = f.writes.length;
        const restored = await f.restore(id);
        const restoredConfig = [...f.table('cloudEditorFiles').values()].find(row => row.branchId === restored.branchId && row.path === file.path);
        expect(restoredConfig).toMatchObject(file);
        expect(f.writes.slice(beforeRestore).filter(name => /Studio|Contracts|Bindings|Admissions|Grants/.test(name))).toEqual([]);
        for (const table of ['cloudEditorGrants', 'cloudEditorContentBindings', 'cloudEditorContentContracts', 'cloudEditorStudioContracts', 'cloudEditorImportedImageAdmissions']) {
            expect([...f.table(table).values()].some(row => row.projectId === restored.projectId)).toBe(false);
        }
        expect([...f.table('projectMembers').values()].filter(row => row.projectId === restored.projectId)).toHaveLength(1);
        expect([...f.table('cloudEditorImportedMedia').values()].filter(row => row.projectId === restored.projectId)).toHaveLength(withMedia ? 1 : 0);
        const again = await capture._handler(f.ctx, { ...restored, expectedRevision: 7, expectedActorId: actorId,
            operationKey: 'studio_restored_capture_1', purpose: 'backup' });
        expect(f.get(again)).toMatchObject({ imported: { studioConfig: marker, version: withMedia ? 2 : 1 } });
        expect(await f.restore(id)).toEqual(restored);
    });

    it.each(['invalid-json', 'unknown-authority', 'binary', 'oversized'] as const)('refuses newly introduced %s config before capture writes', async kind => {
        const f = await fixture();
        const file = addStudioSource(f, kind === 'invalid-json' ? '{' : kind === 'unknown-authority'
            ? JSON.stringify({ ...JSON.parse(savedStudioConfig()), active: true }) : kind === 'oversized' ? ' '.repeat(131073) : savedStudioConfig());
        if (kind === 'binary') { const row = f.get(`cloudEditorFiles:${file.path}`)!; delete row.text; row.storageId = '_storage:studio'; }
        await expect(f.take()).rejects.toThrow(kind === 'binary' ? 'CLOUD_IMPORTED_MEDIA_INVALID' : 'CLOUD_IMPORTED_ARTIFACT_INVALID');
        expect(f.writes).toHaveLength(0);
    });

    it('never claims an original customer file and rejects ancestor or descendant collisions', () => {
        const file = text(IMPORTED_STUDIO_CONFIG_PATH, savedStudioConfig());
        expect(captureImportedStudioConfig([file], [file])).toBeUndefined();
        expect(captureImportedStudioConfig([], [file])).toBeUndefined();
        for (const path of ['src/weblab', `${IMPORTED_STUDIO_CONFIG_PATH}/customer.txt`]) {
            expect(() => captureImportedStudioConfig([file], [text(path, 'customer content')])).toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        }
    });

    it('independently refuses altered marker or derivation version even with a recomputed descriptor hash', async () => {
        const f = await fixture(); addStudioSource(f); const id = await f.take();
        const input = await _input._handler(f.ctx, { releaseId: id, expectedActorId: actorId });
        const sourceHash = await importedReleaseSourceHash(input.files);
        const descriptor = { version: 1, artifactProfile: IMPORTED_ARTIFACT_PROFILE, purpose: 'backup', publicEligible: false,
            derivationVersion: 1, sourceHash, originalHash: input.release.imported!.originalManifestHash,
            deployHash: null, metadata: input.release.imported!, derivation: [] };
        const artifactJson = snapshotCanonicalJson(descriptor), count = f.writes.length;
        await expect(_seal._handler(f.ctx, { releaseId: id, sourceHash, hash: hash(artifactJson), artifactJson, files: [], expectedActorId: actorId })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        expect(f.writes).toHaveLength(count);
        const imported = f.get(id)!.imported as ImportedReleaseMetadata;
        imported.studioConfig!.hash = 'f'.repeat(64);
        await expect(f.seal(id)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        expect(f.writes).toHaveLength(count);
    });
});



describe('imported snapshot retry authority', () => {
    it('requires current gates and designer role before capture, preparation, seal and restore receipts', async () => {
        const f = await fixture(), id = await f.take(); await f.seal(id); await f.restore(id);
        const writes = f.writes.length, saved = f.get(id)!;
        const repeatSeal = (actor = actorId) => _seal._handler(f.ctx, { releaseId: id, expectedActorId: actor,
            sourceHash: String(saved.sourceHash), hash: String(saved.hash), artifactJson: String(saved.artifactJson), files: [] });
        await expect(repeatSeal('users:other' as Id<'users'>)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        const readInput = () => _input._handler(f.ctx, { releaseId: id, expectedActorId: actorId });
        for (const flag of flags) {
            process.env[flag] = 'false';
            await expect(f.take()).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
            await expect(readInput()).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
            await expect(repeatSeal()).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
            await expect(f.restore(id)).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
            process.env[flag] = 'true';
        }
        f.put('cloudEditorGrants', 'cloudEditorGrants:agency', { projectId, userId: actorId, role: 'content' });
        await expect(f.take()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        await expect(readInput()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        await expect(repeatSeal()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        await expect(f.restore(id)).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        expect(f.writes).toHaveLength(writes);
    });
    it('refuses public release capture without writing any source or release row', async () => {
        const f = await fixture();
        await expect(capture._handler(f.ctx, { projectId, branchId, expectedActorId: actorId, expectedRevision: 7,
            operationKey: 'public-capture-refused-0001', purpose: 'release' })).rejects.toThrow('CLOUD_IMPORTED_PUBLICATION_DISABLED');
        expect(f.writes).toHaveLength(0); expect(f.schedules).toHaveLength(0);
    });
});


describe('frozen snapshot family isolation', () => {
    it('refuses every partial hosting marker mixed into a frozen source snapshot', async () => {
        for (const marker of ['importedHosting', 'importedHostingRequest', 'importedHostingBuildPolicyJson']) {
            const f = await fixture(), id = await f.take(); await f.seal(id);
            f.get(id)![marker] = marker.endsWith('Json') ? '{}' : {};
            const writes = f.writes.length;
            await expect(manifest._handler(f.ctx, { backupId: id })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
            await expect(f.restore(id)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
            expect(f.writes).toHaveLength(writes);
        }
    });
});

async function withPublicCapture(run: () => Promise<void>) {
    const key = 'WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED', previous = process.env[key];
    process.env[key] = 'true';
    try { await run(); } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
}
const publicCaptureArgs = { projectId, branchId, expectedActorId: actorId, expectedRevision: 7,
    operationKey: 'public-capture-version-0001', purpose: 'release' as const, publicationIntent: IMPORTED_PUBLICATION_INTENT };

describe('explicit eligible imported capture authority', () => {
    it('captures and replays a distinct public source format without changing source profile or prior private rows', () => withPublicCapture(async () => {
        const f = await fixture(), privateId = await f.take('private-artifact'), privateBefore = structuredClone(f.get(privateId));
        const id = await capture._handler(f.ctx, publicCaptureArgs), before = f.writes.length;
        expect(f.get(id)).toMatchObject({ purpose: 'release', artifactProfile: 'imported-next-public-v1', publicationIntent: IMPORTED_PUBLICATION_INTENT,
            status: 'captured', revision: 7, actorId });
        expect(await capture._handler(f.ctx, publicCaptureArgs)).toBe(id); expect(f.writes).toHaveLength(before);
        expect(f.get('cloudEditorStates:source')?.profile).toBe('imported-next-v1'); expect(f.get(privateId)).toEqual(privateBefore);
        expect(f.schedules).toEqual([]);
        await expect(capture._handler(f.ctx, { ...publicCaptureArgs, operationKey: 'imported_capture_private-artifact' })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        await expect(f.restore(id)).rejects.toThrow('CLOUD_BACKUP_NOT_READY');
    }));

    it('requires the default-off gate, explicit intent, design and separate Publish permission before any write', () => withPublicCapture(async () => {
        for (const changed of ['gate', 'intent', 'content', 'publish', 'actor'] as const) {
            const f = await fixture(); const args: Parameters<typeof capture._handler>[1] = { ...publicCaptureArgs };
            if (changed === 'gate') delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
            if (changed === 'intent') delete args.publicationIntent;
            if (changed === 'content' || changed === 'publish') f.put('cloudEditorGrants', 'cloudEditorGrants:agency', {
                projectId, userId: actorId, role: changed === 'content' ? 'content' : 'designer', publish: changed !== 'publish' });
            if (changed === 'actor') args.expectedActorId = 'users:other' as Id<'users'>;
            await expect(capture._handler(f.ctx, args)).rejects.toThrow(); expect(f.writes).toEqual([]); expect(f.schedules).toEqual([]);
            process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED = 'true';
        }
        const f = await fixture();
        for (const purpose of ['backup', 'private-artifact'] as const) await expect(capture._handler(f.ctx, { ...publicCaptureArgs, purpose })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        expect(f.writes).toEqual([]);
    }));

    it('rechecks grant, actor and gate on exact capture replay, preparation and final seal', () => withPublicCapture(async () => {
        for (const changed of ['gate', 'publish', 'role', 'membership'] as const) {
            const f = await fixture(), id = await capture._handler(f.ctx, publicCaptureArgs), before = f.writes.length;
            if (changed === 'gate') delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
            else if (changed === 'membership') f.table('workspaceMembers').clear();
            else f.put('cloudEditorGrants', 'cloudEditorGrants:agency', { projectId, userId: actorId, role: changed === 'role' ? 'content' : 'designer', publish: changed !== 'publish' });
            await expect(capture._handler(f.ctx, publicCaptureArgs)).rejects.toThrow();
            await expect(_input._handler(f.ctx, { releaseId: id, expectedActorId: actorId })).rejects.toThrow();
            await expect(_seal._handler(f.ctx, { releaseId: id, expectedActorId: actorId, sourceHash: 'a'.repeat(64), hash: 'b'.repeat(64), artifactJson: '{}', files: [] })).rejects.toThrow();
            expect(f.writes).toHaveLength(before); process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED = 'true';
        }
    }));

    it('refuses malformed purpose/profile/intent pairs instead of treating them as starter releases or backups', async () => {
        const f = await fixture(), id = await f.take(), original = structuredClone(f.get(id)!);
        for (const patch of [{ artifactProfile: 'imported-next-public-v1' }, { purpose: 'release' }, { publicationIntent: IMPORTED_PUBLICATION_INTENT },
            { purpose: 'release', artifactProfile: 'imported-next-public-v1' }, { importedHosting: {} }, { importedHostingRequest: {} }, { importedHostingBuildPolicyJson: '{}' }]) {
            expect(() => importedMetadata({ ...original, ...patch } as unknown as Doc<'cloudReleases'>)).toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        }
    });
});
