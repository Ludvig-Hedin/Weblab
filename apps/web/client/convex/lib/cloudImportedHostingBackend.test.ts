import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { getFunctionName } from 'convex/server';
import { planNextProjectPreparation } from '@weblab/parser/src/project-preparation';
import { WEBLAB_DEV_IX_RUNTIME_PATH, WEBLAB_DEV_PRELOAD_SCRIPT_PATH } from '@weblab/constants';
import type { Doc, Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import { assertImportedPublicTarget, _hostingInput, _sealHosting, _input, _seal, _workerInput, _beginSend, _result, _settle, request, review, status } from '../cloudReleases';
import { prepare as prepareSourceArtifact, prepareHosting, work } from '../cloudReleaseActions';
import { restoreCopy } from '../cloudBackups';
import { prepareImportedHostingCandidate, type ImportedHostingPrepared } from './cloudImportedHosting';
import { prepareImportedNextConfig, prepareImportedNextDeclarations } from './cloudImportedNextConfig';
import { validateImportedNextProfile } from './cloudImportedNextProfile';
import { originalImportFiles, importedInventoryHash, type ImportedSnapshotFile } from './cloudImportedRelease';
import { prepareImportedReleaseArtifact } from './cloudImportedReleaseArtifact';
import { sha256 } from './cloudReleaseArtifact';
import { readImportedHostingExecution, type HostingPrepareRequest, type HostingSealRequest } from './cloudImportedHostingBackend';
import { destinationKey } from './cloudReleasePolicy';
import { sourceProfileCapabilities } from './cloudImportManifest';
import { serializeImportedHostingCandidate, type ImportedHostingCandidate } from './cloudImportedHostingState';
import { sealReleaseCredential } from './cloudReleaseCredentialEnvelope';
import { CloudReleaseVercel } from './cloudReleaseVercel';
import { issue as issueReview, exchange as exchangeReview, authorize as authorizeReview, _credentialContext, reviewDigest } from '../cloudReleaseReviewAccess';

const actorId = 'users:colleague' as Id<'users'>, historicalActorId = 'users:creator' as Id<'users'>;
const projectId = 'projects:one' as Id<'projects'>, branchId = 'branches:one' as Id<'branches'>, workspaceId = 'workspaces:one' as Id<'workspaces'>;
const artifactId = 'cloudReleases:private' as Id<'cloudReleases'>;
const flags = ['WEBLAB_CLOUD_IMPORTED_BACKUPS_ENABLED', 'WEBLAB_CLOUD_IMPORTS_ENABLED', 'WEBLAB_CLOUD_EDITOR_ENABLED'] as const;
const old = new Map<string, string | undefined>();
beforeEach(() => { for (const key of flags) { old.set(key, process.env[key]); process.env[key] = 'true'; } });
afterEach(() => { for (const key of flags) { const value = old.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
type Row = Record<string, unknown> & { _id: string };
const text = (path: string, value: string): ImportedSnapshotFile => ({ path, kind: 'file', text: value, bytes: Buffer.byteLength(value), hash: sha256(value) });

async function retainedFixture() {
    const dependencies = { next: '16.3.1', react: '19.2.8' }, devDependencies = { typescript: '5.9.3' };
    const pkg = { name: 'atomic-hosting', packageManager: 'bun@1.3.11', dependencies, devDependencies,
        scripts: { dev: 'next dev', build: 'next build --webpack' } };
    const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
    const lock = { lockfileVersion: 1, configVersion: 1, workspaces: { '': { name: pkg.name, dependencies, devDependencies } },
        packages: Object.fromEntries([['next', '16.3.1'], ['react', '19.2.8'], ['typescript', '5.9.3']].map(([name, version]) => [name, [`${name}@${version}`, '', {}, integrity]])) };
    const declarations = ['/// <reference types="next" />', '/// <reference types="next/image-types/global" />',
        'import "./.next/types/routes.d.ts";', 'import "./.next/types/root-params.d.ts";', '',
        '// NOTE: This file should not be edited', '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.', ''].join('\n');
    const media = 'retained-media';
    const original = [text('package.json', JSON.stringify(pkg)), text('bun.lock', JSON.stringify(lock)),
        text('next.config.ts', 'const config = { poweredByHeader: false }; export default config;'),
        text('tsconfig.json', '{"compilerOptions":{"strict":true}}'), text('next-env.d.ts', declarations),
        text('src/app/layout.tsx', 'export default function Layout({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }'),
        text('src/app/page.tsx', 'export default function Page() { return <main>Saved page</main>; }'),
        { path: 'public/photo.webp', kind: 'file' as const, hash: sha256(media), bytes: Buffer.byteLength(media), storageId: '_storage:media' },
        { path: 'public/photo-copy.webp', kind: 'file' as const, hash: sha256(media), bytes: Buffer.byteLength(media), storageId: '_storage:media' }];
    const plan = await planNextProjectPreparation({ files: original.flatMap(file => file.text === undefined ? [] : [{ path: file.path, text: file.text }]),
        layoutPath: 'src/app/layout.tsx', assets: [{ path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH, text: '// Weblab stale domId lookup blocked:\nvoid 0;' }, { path: WEBLAB_DEV_IX_RUNTIME_PATH, text: 'void 0;' }] });
    for (const path of ['next.config.ts', 'next-env.d.ts']) {
        const before = original.find(file => file.path === path)!.text!;
        const updated = path === 'next.config.ts' ? await prepareImportedNextConfig(before) : prepareImportedNextDeclarations(before);
        if (before !== updated) plan.files.push({ path, original: before, updated, addedOids: [], bootstrapChanges: path === 'next.config.ts' });
    }
    const sourceMap = new Map(original.map(file => [file.path, file]));
    for (const file of plan.files) sourceMap.set(file.path, text(file.path, file.updated));
    const source = [...sourceMap.values()], originalManifestHash = await importedInventoryHash(original);
    const metadata: ImportedReleaseMetadata = { version: 1, capturedRevision: 2, originalManifestHash,
        preparation: { inputRevision: 1, preparedRevision: 2, inputManifestHash: originalManifestHash,
            preparedManifestHash: await importedInventoryHash(source), policy: validateImportedNextProfile(source),
            instrumentation: plan.files.map(file => ({ path: file.path, beforeHash: original.find(before => before.path === file.path)?.hash ?? null,
                afterHash: sha256(file.updated), addedOids: file.addedOids, bootstrapChanges: file.bootstrapChanges })) } };
    const privateArtifact = await prepareImportedReleaseArtifact({ source, original, metadata, purpose: 'private-artifact' });
    return { source, original, metadata, privateArtifact, media };
}

/** Real handlers/permission code, simulated IO only. Native Convex atomicity is a separate acceptance check. */
async function fixture(allowScheduling = false) {
    const retained = await retainedFixture(), tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
    const put = (name: string, id: string, values: Record<string, unknown>) => { const row = { _creationTime: 1, ...values, _id: id }; table(name).set(id, row); return row; };
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject = 'colleague', sequence = 0, blob: Blob | null = new Blob([retained.media]), blobHook = () => {};
    const writes: string[] = [], blobReads: string[] = [], queries: string[] = [];
    const operationReads: Array<{ index: string; limit: number }> = [];
    const metric = () => ({ used: 0, remaining: 16_777_216 });
    const metrics = { bytesRead: metric(), bytesWritten: metric(), documentsRead: metric(), documentsWritten: metric(), databaseQueries: metric(), functionsScheduled: metric(), scheduledFunctionArgsBytes: metric() };
    const ctx = { auth: { getUserIdentity: async () => ({ subject, tokenIdentifier: `issuer|${subject}` }) }, meta: { getTransactionMetrics: async () => metrics },
        db: { get: async (id: string) => structuredClone(get(id)), system: { get: async (id: string) => structuredClone(get(id)) },
            insert: async (name: string, values: Record<string, unknown>) => { const id = `${name}:new_${++sequence}`; put(name, id, values); writes.push(name); return id; },
            patch: async (id: string, values: Record<string, unknown>) => { Object.assign(get(id)!, structuredClone(values)); writes.push(`patch:${id}`); },
            replace: async (id: string, values: Record<string, unknown>) => { put(id.split(':')[0]!, id, structuredClone(values)); writes.push(`replace:${id}`); },
            query: (name: string) => {
                queries.push(name);
                let descending = false, indexName = '';
                const note = (limit: number) => { if (name === 'cloudReleaseOperations') operationReads.push({ index: indexName, limit }); };
                const filters: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { filters.push([key, value]); return index; } };
                const rows = () => { const matching = [...table(name).values()].filter(row => filters.every(([key, value]) => row[key] === value)); return descending ? matching.reverse() : matching; };
                const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { indexName = _name; build(index); return query; }, order: (direction: string) => { descending = direction === 'desc'; return query; },
                    take: async (count: number) => { note(count); return structuredClone(rows().slice(0, count)); }, collect: async () => structuredClone(rows()),
                    first: async () => { note(1); return structuredClone(rows()[0] ?? null); },
                    unique: async () => { note(1); const matching = rows(); if (matching.length > 1) throw Error('Nonunique'); return structuredClone(matching[0] ?? null); } };
                return query;
            } }, scheduler: { runAfter: async () => {
                if (!allowScheduling) throw Error('Hosting preparation must never schedule');
                const id = `_scheduled_functions:job_${++sequence}`; put('_scheduled_functions', id, { state: { kind: 'pending' } });
                writes.push('schedule'); return id;
            } },
    } as unknown as MutationCtx;
    put('users', actorId, { clerkUserId: 'colleague' }); put('users', historicalActorId, { clerkUserId: 'creator' });
    put('workspaces', workspaceId, { createdByUserId: historicalActorId });
    put('workspaceMembers', 'workspaceMembers:colleague', { workspaceId, userId: actorId, role: 'admin' });
    put('projects', projectId, { workspaceId, accessMode: 'restricted', name: 'Retained customer site' });
    put('projectMembers', 'projectMembers:creator', { projectId, userId: historicalActorId, role: 'manager' });
    put('branches', branchId, { projectId });
    put('cloudEditorGrants', 'cloudEditorGrants:colleague', { projectId, userId: actorId, role: 'designer', publish: false });
    put('cloudEditorStates', 'cloudEditorStates:one', { projectId, branchId, workspaceId, version: 1, profile: 'imported-next-v1', revision: 9, createdByUserId: historicalActorId });
    put('cloudReleases', artifactId, { projectId, branchId, workspaceId, actorId: historicalActorId, operationKey: 'private-artifact-0001',
        revision: 2, purpose: 'private-artifact', status: 'frozen', artifactProfile: 'imported-next-private-v1', imported: retained.metadata,
        sourceHash: retained.privateArtifact.sourceHash, hash: retained.privateArtifact.hash, artifactJson: retained.privateArtifact.artifactJson,
        studioInputJson: '', previousArtifactJson: '', createdAt: 1 });
    for (const [stage, files] of [['source', retained.source], ['original', retained.original], ['deploy', retained.privateArtifact.files]] as const) {
        for (const file of files) put('cloudReleaseFiles', `cloudReleaseFiles:${stage}:${file.path}`, { ...file, releaseId: artifactId, stage });
    }
    put('_storage', '_storage:media', { size: Buffer.byteLength(retained.media), sha256: sha256(retained.media) });
    put('cloudReleaseAssets', 'cloudReleaseAssets:private', { releaseId: artifactId, storageId: '_storage:media' });
    const args: HostingPrepareRequest = { projectId, branchId, expectedActorId: actorId, artifactId, expectedArtifactHash: retained.privateArtifact.hash,
        operationKey: 'hosting-prepare-0001', visibility: 'protected-only', expectedLiveReleaseId: null };
    const actionCtx = { runQuery: async (_ref: unknown, request: HostingPrepareRequest) => _hostingInput._handler(ctx, request),
        runMutation: async (_ref: unknown, request: HostingSealRequest) => _sealHosting._handler(ctx, request),
        storage: { get: async (id: string) => { blobReads.push(id); blobHook(); return blob; } },
    } as unknown as ActionCtx;
    const prepare = () => prepareHosting._handler(actionCtx, args);
    const plan = async () => { const input = await _hostingInput._handler(ctx, args); if (input.kind !== 'new') throw Error('Expected fresh input'); return prepareImportedHostingCandidate(input.input); };
    const sealArgs = (prepared: ImportedHostingPrepared): HostingSealRequest => ({ ...args, hash: prepared.hash, sourceHash: prepared.sourceHash,
        artifactJson: prepared.artifactJson, buildPolicyJson: prepared.buildPolicyJson,
        files: prepared.files.map(file => ({ ...file, ...(file.storageId ? { storageId: file.storageId as Id<'_storage'> } : {}) })) as HostingSealRequest['files'] });
    return { ...retained, ctx, actionCtx, args, table, put, get, writes, metrics, blobReads, queries, operationReads, prepare, plan, sealArgs,
        signIn: (value: string) => { subject = value; }, setBlob: (value: Blob | null) => { blob = value; }, onBlob: (hook: () => void) => { blobHook = hook; } };
}

describe('atomic imported hosting preparation', () => {
    it('fences an exact old candidate receipt and a late seal after removal begins', async () => {
        const f = await fixture(), result = await f.prepare();
        f.get(result.releaseId)!.removal = {};
        const before = f.writes.length;
        await expect(f.prepare()).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        await expect(readImportedHostingExecution(f.ctx, f.get(result.releaseId)! as unknown as Doc<'cloudReleases'>)).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        expect(f.writes.length).toBe(before);
        const pending = await fixture(), prepared = await pending.plan();
        pending.get(artifactId)!.removedAt = 123;
        const pendingBefore = pending.writes.length;
        await expect(_sealHosting._handler(pending.ctx, pending.sealArgs(prepared))).rejects.toThrow('CLOUD_RELEASE_REMOVED');
        expect(pending.writes.length).toBe(pendingBefore);
    });

    it('lets a current agency colleague freeze old exact bytes once with deduplicated media references', async () => {
        const f = await fixture(), privateBefore = structuredClone(f.get(artifactId));
        const result = await f.prepare(), row = f.get(result.releaseId)!;
        expect(row).toMatchObject({ status: 'frozen', purpose: 'release', actorId, revision: 2, hash: result.hash,
            importedHostingRequest: { version: 1, artifactId, expectedLiveReleaseId: null, visibility: 'protected-only' }, studioInputJson: '', previousArtifactJson: '' });
        expect(row.imported).toBeUndefined(); expect(row.artifactProfile).toBeUndefined();
        expect(f.get(artifactId)).toEqual(privateBefore);
        expect(f.blobReads).toEqual(['_storage:media']);
        expect([...f.table('cloudReleaseFiles').values()].filter(file => file.releaseId === result.releaseId)).toHaveLength(f.privateArtifact.files.length);
        expect([...f.table('cloudReleaseFiles').values()].filter(file => file.releaseId === result.releaseId).every(file => file.stage === 'deploy')).toBe(true);
        expect([...f.table('cloudReleaseAssets').values()].filter(file => file.releaseId === result.releaseId)).toHaveLength(1);
        expect(f.get('cloudEditorStates:one')?.revision).toBe(9);
        expect(f.table('cloudReleaseOperations').size).toBe(0); expect(f.table('cloudReleaseReviewTickets').size).toBe(0);
        expect((await status._handler(f.ctx, { projectId, branchId })).releases.find(release => release.id === result.releaseId)).toMatchObject({ kind: 'protected-version', canManageVersions: true, canDownload: false });
    });

    it('resolves immutable execution facts independently of later source edits', async () => {
        const f = await fixture(), result = await f.prepare();
        f.get('cloudEditorStates:one')!.revision = 99;
        const row = f.get(result.releaseId)! as unknown as Doc<'cloudReleases'>;
        const facts = await readImportedHostingExecution(f.ctx, row);
        expect(facts.candidate.revision).toBe(row.revision);
        expect(facts.deployFiles).toHaveLength(f.privateArtifact.files.length);
        expect(facts.candidate.importedHosting.deployHash).toBe(row.importedHosting!.deployHash);
        expect(f.table('cloudReleaseOperations').size).toBe(0);
    });

    it('refuses altered execution candidate, parent, retained files or storage descriptors', async () => {
        for (const changed of ['policy', 'visibility', 'parent', 'parentRevision', 'sourceHash', 'file', 'storage', 'partial'] as const) {
            const f = await fixture(), result = await f.prepare();
            const row = f.get(result.releaseId)!;
            if (changed === 'policy') row.importedHostingBuildPolicyJson += '\n';
            else if (changed === 'visibility') (row.importedHostingRequest as Record<string, unknown>).visibility = 'publishable';
            else if (changed === 'parent') f.table('cloudReleases').delete(artifactId);
            else if (changed === 'parentRevision') f.get(artifactId)!.revision = 99;
            else if (changed === 'sourceHash') row.sourceHash = 'f'.repeat(64);
            else if (changed === 'storage') f.table('_storage').clear();
            else if (changed === 'partial') delete row.importedHostingRequest;
            else {
                const file = [...f.table('cloudReleaseFiles').values()].find(file => file.releaseId === result.releaseId)!;
                f.table('cloudReleaseFiles').delete(file._id);
            }
            await expect(readImportedHostingExecution(f.ctx, row as unknown as Doc<'cloudReleases'>)).rejects.toThrow();
        }
    });

    it('requires every current snapshot gate before a completed preparation receipt', async () => {
        const f = await fixture(); const proposal = await f.plan(); await f.prepare();
        const writes = f.writes.length;
        for (const flag of flags) {
            process.env[flag] = 'false';
            await expect(f.prepare()).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
            await expect(_sealHosting._handler(f.ctx, f.sealArgs(proposal))).rejects.toThrow('CLOUD_IMPORTED_BACKUPS_DISABLED');
            process.env[flag] = 'true';
        }
        f.put('cloudEditorGrants', 'cloudEditorGrants:creator', { projectId, userId: historicalActorId, role: 'designer', publish: false });
        f.signIn('creator');
        await expect(f.prepare()).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        expect(f.writes).toHaveLength(writes);
    });

    it('returns a completed lost-reply receipt before new live/budget/blob checks, but after current actor access', async () => {
        const f = await fixture(), result = await f.prepare(), writes = f.writes.length;
        f.put('cloudReleaseDestinations', 'cloudReleaseDestinations:one', { projectId, branchId, liveReleaseId: 'cloudReleases:new-live', drifted: true });
        for (let i = 0; i < 12; i++) f.put('cloudReleases', `cloudReleases:other${i}`, { projectId, branchId });
        f.setBlob(null);
        expect(await f.prepare()).toEqual(result); expect(f.writes).toHaveLength(writes); expect(f.blobReads).toHaveLength(1);
        await expect(prepareHosting._handler(f.actionCtx, { ...f.args, expectedLiveReleaseId: 'cloudReleases:new-live' as Id<'cloudReleases'> })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        f.get('cloudEditorGrants:colleague')!.role = 'content';
        await expect(f.prepare()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
    });

    it('has no pending row and refuses a live target change before the single seal', async () => {
        const f = await fixture(), prepared = await f.plan();
        expect(f.table('cloudReleases').size).toBe(1); expect(f.writes).toEqual([]);
        f.put('cloudReleaseDestinations', 'cloudReleaseDestinations:one', { projectId, branchId, liveReleaseId: 'cloudReleases:new-live' });
        await expect(_sealHosting._handler(f.ctx, f.sealArgs(prepared))).rejects.toThrow('CLOUD_RELEASE_LIVE_CHANGED');
        expect(f.writes).toEqual([]);
    });

    it('pins the initiating account through byte verification and refuses revoked access or missing scope', async () => {
        for (const changed of ['actor', 'role', 'branch', 'profile'] as const) {
            const f = await fixture();
            f.onBlob(() => {
                if (changed === 'actor') f.signIn('creator');
                else if (changed === 'role') f.get('cloudEditorGrants:colleague')!.role = 'content';
                else if (changed === 'branch') f.table('branches').delete(branchId);
                else f.get('cloudEditorStates:one')!.profile = 'starter-v1';
            });
            await expect(f.prepare()).rejects.toThrow(); expect(f.writes).toEqual([]);
        }
    });

    it('refuses missing or wrong actual blob bytes without writing a candidate', async () => {
        for (const blob of [null, new Blob(['wrong-size']), new Blob(['x'.repeat('retained-media'.length)])]) {
            const f = await fixture(); f.setBlob(blob);
            await expect(f.prepare()).rejects.toThrow(); expect(f.writes).toEqual([]);
        }
    });

    it('deduplicates simultaneous prepared proposals and refuses changed exact retry payloads', async () => {
        const f = await fixture(), first = await f.plan(), second = await f.plan();
        const receipt = await _sealHosting._handler(f.ctx, f.sealArgs(first)), writes = f.writes.length;
        expect(await _sealHosting._handler(f.ctx, f.sealArgs(second))).toEqual(receipt); expect(f.writes).toHaveLength(writes);
        await expect(_sealHosting._handler(f.ctx, { ...f.sealArgs(second), sourceHash: 'f'.repeat(64) })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        await expect(_hostingInput._handler(f.ctx, { ...f.args, expectedArtifactHash: 'f'.repeat(64) })).rejects.toThrow('CLOUD_INVALID_OPERATION');
    });

    it('checks storage metadata again at seal and reserves write budget before inserting', async () => {
        for (const changed of ['storage', 'budget'] as const) {
            const f = await fixture(), prepared = await f.plan();
            if (changed === 'storage') f.table('_storage').clear(); else f.metrics.bytesWritten.used = 5_999_999;
            await expect(_sealHosting._handler(f.ctx, f.sealArgs(prepared))).rejects.toThrow(); expect(f.writes).toEqual([]);
        }
    });

    it('rejects changed candidate facts, canonical policy bytes, files and retained private seal', async () => {
        for (const change of ['hash', 'policy', 'file', 'storage', 'omission', 'parent'] as const) {
            const f = await fixture(), args = f.sealArgs(await f.plan());
            if (change === 'hash') args.hash = 'd'.repeat(64);
            else if (change === 'policy') args.buildPolicyJson += '\n';
            else if (change === 'file') args.files.push({ path: 'public/extra.txt', kind: 'file', text: 'extra', bytes: 5, hash: sha256('extra') });
            else if (change === 'storage') args.files.find(file => file.storageId)!.storageId = '_storage:foreign' as Id<'_storage'>;
            else if (change === 'omission') args.files.pop();
            else f.get(artifactId)!.artifactJson = '{}';
            await expect(_sealHosting._handler(f.ctx, args)).rejects.toThrow(); expect(f.writes).toEqual([]);
        }
    });

    it('never exposes a prepared hosting candidate through backup, starter prepare, review or publication paths', async () => {
        const f = await fixture(), result = await f.prepare(), writes = f.writes.length;
        await expect(restoreCopy._handler(f.ctx, { backupId: result.releaseId, operationKey: 'restore-hosting-0001', name: 'No', expectedActorId: actorId })).rejects.toThrow('CLOUD_BACKUP_NOT_READY');
        await expect(_input._handler(f.ctx, { releaseId: result.releaseId, expectedActorId: actorId })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        await expect(_seal._handler(f.ctx, { releaseId: result.releaseId, expectedActorId: actorId, sourceHash: 'a'.repeat(64), hash: result.hash, artifactJson: '{}', files: [] })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        await expect(review._handler(f.ctx, { releaseId: result.releaseId, hash: result.hash })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        for (const kind of ['build', 'publish', 'rollback'] as const) await expect(request._handler(f.ctx, {
            releaseId: result.releaseId, expectedActorId: actorId, kind, operationKey: 'never-send-000001', expectedLiveReleaseId: null })).rejects.toThrow(kind === 'build' ? 'CLOUD_RELEASE_SETUP_REQUIRED' : 'CLOUD_RELEASE_NOT_ALLOWED');
        expect(f.writes).toHaveLength(writes);
    });
});

const releaseEnvironment = { WEBLAB_CLOUD_RELEASES_ENABLED: 'true', WEBLAB_CLOUD_RELEASE_REVIEW_SECRET: 'a'.repeat(64),
    WEBLAB_CLOUD_RELEASE_APP_ORIGIN: 'https://app.example.com', WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX: 'review.example.net',
    CLERK_JWT_ISSUER_DOMAIN: 'https://auth.example.org', WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS: 'team_test',
    PROVIDER_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64') };
async function withReleaseEnvironment(run: () => Promise<void>) {
    const saved = Object.fromEntries(Object.keys(releaseEnvironment).map(key => [key, process.env[key]]));
    Object.assign(process.env, releaseEnvironment);
    try { await run(); } finally { for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    } }
}
async function lifecycleFixture(publicVersion = false) {
    const f = publicVersion ? await eligibleFixture(true) : await fixture(true);
    const candidate = await f.prepare();
    const hostingProfile = 'imported-next-hosting-v1', teamId = 'team_test', providerProjectId = 'prj_test', hostname = 'site.vercel.app';
    const destinationId = 'cloudReleaseDestinations:one', credentialId = 'cloudReleaseCredentials:one';
    const destination = f.put('cloudReleaseDestinations', destinationId, { projectId, branchId, workspaceId, hostingProfile,
        teamId, providerProjectId, hostname, key: destinationKey(teamId, providerProjectId, hostname), generation: 1,
        registrationVersion: 2, credentialId, credentialVersion: 1, credentialHash: 'a'.repeat(64), providerProof: 'b'.repeat(64),
        approvedUntil: Date.now() + 60_000, remainingBuilds: 1, reviewGatewayVerified: false, publicAliasVerified: false, drifted: false });
    const sealed = sealReleaseCredential({ destinationId, projectId, branchId, workspaceId, hostingProfile: 'imported-next-hosting-v1',
        teamId, providerProjectId, hostname, version: 1 }, { token: 'synthetic-test-token', bypass: 'synthetic-test-bypass' });
    destination.credentialHash = sealed.ciphertextHash;
    const credential = f.put('cloudReleaseCredentials', credentialId, { destinationId, projectId, branchId, workspaceId, hostingProfile,
        teamId, providerProjectId, hostname, version: 1, ...sealed,
        providerProof: 'b'.repeat(64), expiresAt: Date.now() + 60_000 });
    const buildArgs = { releaseId: candidate.releaseId, expectedActorId: actorId, kind: 'build' as const, operationKey: 'imported-build-0001', expectedLiveReleaseId: null };
    async function queue() {
        const operationId = await request._handler(f.ctx, buildArgs), op = f.get(operationId)!;
        f.get(String(op.schedulerId))!.state = { kind: 'inProgress' };
        return { operationId, nonce: String(op.nonce), op };
    }
    return { ...f, candidate, destination, credential, buildArgs, queue };
}

describe('protected imported build lifecycle', () => {
    it('projects imported private controls without inventories or public admission', () => withReleaseEnvironment(async () => {
        const f = await lifecycleFixture(); f.queries.length = 0;
        const value = await status._handler(f.ctx, { projectId, branchId });
        expect(value).toMatchObject({ canBuildPrivateReview: true, privateBuildReason: null, canPublish: false, enabled: false, remainingBuilds: 1 });
        expect(value.releases.find(row => row.id === artifactId)).toMatchObject({ canPreparePrivateReview: true, kind: 'private-artifact' });
        expect(value.releases.find(row => row.id === f.candidate.releaseId)).toMatchObject({ canBuildPrivateReview: true, kind: 'protected-version', hostingArtifactId: artifactId });
        expect(f.queries).not.toContain('cloudReleaseFiles'); expect(f.queries).not.toContain('cloudReleaseAssets');
        expect(JSON.stringify(value)).not.toContain('ciphertext'); expect(JSON.stringify(value)).not.toContain('artifactJson');
        f.destination.remainingBuilds = 0;
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ canBuildPrivateReview: false, privateBuildReason: 'no-builds', remainingBuilds: 0 });
        f.destination.approvedUntil = 1;
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ privateBuildReason: 'paused' });
        f.destination.registrationVersion = 1;
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ privateBuildReason: 'not-configured' });
    }));
    it('requires the canonical imported actor before initial admission and exact request replay', () => withReleaseEnvironment(async () => {
        const f = await lifecycleFixture(), before = f.writes.length;
        const { expectedActorId: _actor, ...unpinned } = f.buildArgs;
        await expect(request._handler(f.ctx, unpinned)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        await expect(request._handler(f.ctx, { ...f.buildArgs, expectedActorId: historicalActorId })).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        expect(f.writes).toHaveLength(before);
        const queued = await f.queue(); const after = f.writes.length;
        await expect(request._handler(f.ctx, unpinned)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        expect(await request._handler(f.ctx, f.buildArgs)).toBe(queued.operationId); expect(f.writes).toHaveLength(after);
        const result = await status._handler(f.ctx, { projectId, branchId });
        expect(result.operations[0]).toMatchObject({ id: queued.operationId, operationKey: f.buildArgs.operationKey, actorId, releaseId: f.candidate.releaseId, kind: 'build', expectedLiveReleaseId: null });
    }));
    it('keeps creator-only finish, malformed rows hidden and deleting rows without actions', () => withReleaseEnvironment(async () => {
        const f = await lifecycleFixture();
        f.get(artifactId)!.status = 'captured';
        expect((await status._handler(f.ctx, { projectId, branchId })).releases.find(row => row.id === artifactId)?.canFinishPreparing).toBe(false);
        f.get(artifactId)!.actorId = actorId;
        expect((await status._handler(f.ctx, { projectId, branchId })).releases.find(row => row.id === artifactId)?.canFinishPreparing).toBe(true);
        f.put('cloudReleases', 'cloudReleases:malformed', { ...f.get(artifactId), purpose: 'release', importedHosting: {} });
        expect((await status._handler(f.ctx, { projectId, branchId })).releases.some(row => row.id === 'cloudReleases:malformed')).toBe(false);
        const candidate = f.get(f.candidate.releaseId)!;
        candidate.removal = { version: 1, actorId, operationKey: 'removal-operation-0001', expectedHash: candidate.hash, expectedStatus: candidate.status, revision: candidate.revision, requestedAt: 1, phase: 'files' };
        expect((await status._handler(f.ctx, { projectId, branchId })).releases.find(row => row.id === f.candidate.releaseId)).toMatchObject({ canBuildPrivateReview: false, reviewUrl: null });
    }));

    it('admits an agency build without publish permission and binds all immutable operation pins once', () => withReleaseEnvironment(async () => {
        const f = await lifecycleFixture(), queued = await f.queue();
        const row = f.get(f.candidate.releaseId)! as unknown as Doc<'cloudReleases'>;
        expect(sourceProfileCapabilities('imported-next-v1').release).toBe(false);
        expect(f.get('cloudEditorGrants:colleague')!.publish).toBe(false);
        expect(queued.op).toMatchObject({ actorId, sourceHash: row.hash, deployHash: row.importedHosting!.deployHash,
            buildPolicyHash: row.importedHosting!.buildPolicyHash, generation: 1, credentialId: f.credential._id });
        expect(f.destination.remainingBuilds).toBe(0);
        const before = f.writes.length;
        expect(await request._handler(f.ctx, f.buildArgs)).toBe(queued.operationId); expect(f.writes).toHaveLength(before);
        const reads = f.blobReads.length;
        expect(await f.prepare()).toEqual(f.candidate); expect(f.writes).toHaveLength(before); expect(f.blobReads).toHaveLength(reads);
        f.signIn('creator'); // A scheduler must use the stored initiating actor, not an ambient browser session.
        expect(await _workerInput._handler(f.ctx, queued)).not.toBeNull();
        expect(await _beginSend._handler(f.ctx, queued)).toBe(true);
        expect(queued.op.stage).toBe('sending');
    }));

    it('refuses missing profile2 credentials, agency access or allowance before scheduling', () => withReleaseEnvironment(async () => {
        for (const changed of ['profile', 'registration', 'credential', 'content-role', 'membership', 'budget', 'expired'] as const) {
            const f = await lifecycleFixture();
            if (changed === 'profile') delete f.destination.hostingProfile;
            else if (changed === 'registration') f.destination.registrationVersion = 1;
            else if (changed === 'credential') delete f.credential.hostingProfile;
            else if (changed === 'content-role') f.get('cloudEditorGrants:colleague')!.role = 'content';
            else if (changed === 'membership') f.table('workspaceMembers').clear();
            else if (changed === 'budget') f.destination.remainingBuilds = 0;
            else f.credential.expiresAt = 1;
            const before = f.writes.length;
            await expect(request._handler(f.ctx, f.buildArgs)).rejects.toThrow();
            expect(f.writes).toHaveLength(before); expect(f.table('cloudReleaseOperations').size).toBe(0);
        }
    }));

    it('rechecks canonical actor, scope, current role and exact pins immediately before send', () => withReleaseEnvironment(async () => {
        for (const changed of ['actor', 'workspace', 'role', 'deployHash', 'policyHash', 'candidateHash', 'generation', 'credential', 'gate'] as const) {
            const f = await lifecycleFixture(), queued = await f.queue();
            expect(await _workerInput._handler(f.ctx, queued)).not.toBeNull();
            if (changed === 'actor') f.put('users', 'users:canonical-replacement', { clerkUserId: 'colleague', _creationTime: 0 });
            else if (changed === 'workspace') f.get('cloudEditorStates:one')!.workspaceId = 'workspaces:foreign';
            else if (changed === 'role') f.get('cloudEditorGrants:colleague')!.role = 'content';
            else if (changed === 'deployHash') queued.op.deployHash = 'd'.repeat(64);
            else if (changed === 'policyHash') queued.op.buildPolicyHash = 'd'.repeat(64);
            else if (changed === 'candidateHash') queued.op.sourceHash = 'd'.repeat(64);
            else if (changed === 'generation') f.destination.generation = 2;
            else if (changed === 'credential') f.credential.revokedAt = Date.now();
            else process.env.WEBLAB_CLOUD_RELEASES_ENABLED = 'false';
            const before = f.writes.length;
            try { expect(await _beginSend._handler(f.ctx, queued)).toBe(false); expect(f.writes).toHaveLength(before); }
            finally { process.env.WEBLAB_CLOUD_RELEASES_ENABLED = 'true'; }
            expect(queued.op.stage).toBe('queued');
        }
    }));

    it('revalidates frozen deploy bytes at begin-send without rejecting newer source revisions', () => withReleaseEnvironment(async () => {
        const f = await lifecycleFixture(), queued = await f.queue();
        f.get('cloudEditorStates:one')!.revision = 99;
        expect(await _workerInput._handler(f.ctx, queued)).not.toBeNull();
        const file = [...f.table('cloudReleaseFiles').values()].find(row => row.releaseId === f.candidate.releaseId && row.text !== undefined)!;
        file.text = 'changed after request';
        const before = f.writes.length;
        await expect(_beginSend._handler(f.ctx, queued)).rejects.toThrow();
        expect(f.writes).toHaveLength(before); expect(queued.op.stage).toBe('queued');
    }));

    it('settles only a completed protected build and never changes live pointers', () => withReleaseEnvironment(async () => {
        const f = await lifecycleFixture(), queued = await f.queue();
        expect(await _beginSend._handler(f.ctx, queued)).toBe(true);
        await _result._handler(f.ctx, { ...queued, outcome: 'confirmed', deploymentId: 'dpl_protected', deploymentUrl: 'https://protected.vercel.app' });
        f.get(String(queued.op.schedulerId))!.state = { kind: 'success' };
        await _settle._handler(f.ctx, { operationId: queued.operationId });
        expect(f.get(f.candidate.releaseId)).toMatchObject({ status: 'ready', deploymentId: 'dpl_protected', builtDestinationKey: f.destination.key });
        expect(f.destination).toMatchObject({ remainingBuilds: 0, publicAliasVerified: false });
        expect(f.destination.lockOperationId).toBeUndefined(); expect(f.destination.liveDeploymentId).toBeUndefined(); expect(f.destination.liveReleaseId).toBeUndefined();
        const before = f.writes.length, reads = f.blobReads.length;
        expect(await f.prepare()).toEqual(f.candidate); expect(f.writes).toHaveLength(before); expect(f.blobReads).toHaveLength(reads);
    }));

    it('keeps post-send uncertainty locked while pre-send failure can settle without refund', () => withReleaseEnvironment(async () => {
        for (const sent of [false, true]) {
            const f = await lifecycleFixture(), queued = await f.queue();
            if (sent) expect(await _beginSend._handler(f.ctx, queued)).toBe(true);
            await _result._handler(f.ctx, { ...queued, outcome: 'failed', error: 'CLOUD_RELEASE_PROVIDER_UNCERTAIN' });
            expect(queued.op.stage).toBe(sent ? 'unknown' : 'failed');
            f.get(String(queued.op.schedulerId))!.state = { kind: 'success' };
            await _settle._handler(f.ctx, { operationId: queued.operationId });
            expect(f.destination.lockOperationId).toBe(sent ? queued.operationId : undefined);
            expect(f.destination.remainingBuilds).toBe(0); expect(f.destination.liveDeploymentId).toBeUndefined();
        }
    }));

    it('refuses public kinds at request, send and confirmed-result settlement even on a registered imported destination', () => withReleaseEnvironment(async () => {
        for (const kind of ['publish', 'rollback'] as const) {
            const f = await lifecycleFixture();
            await expect(request._handler(f.ctx, { ...f.buildArgs, kind })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
            const queued = await f.queue(); queued.op.kind = kind;
            const before = f.writes.length;
            expect(await _workerInput._handler(f.ctx, queued)).toBeNull(); expect(await _beginSend._handler(f.ctx, queued)).toBe(false);
            await _result._handler(f.ctx, { ...queued, outcome: 'confirmed', deploymentId: 'never-public' });
            queued.op.stage = 'confirmed'; queued.op.resultDeploymentId = 'never-public';
            f.get(String(queued.op.schedulerId))!.state = { kind: 'success' };
            await _settle._handler(f.ctx, { operationId: queued.operationId });
            expect(f.writes).toHaveLength(before); expect(f.destination.liveDeploymentId).toBeUndefined();
        }
    }));
});

describe('protected imported review and retained media', () => {
    const verifier = releaseEnvironment.WEBLAB_CLOUD_RELEASE_REVIEW_SECRET, session = 'c'.repeat(64);
    async function readyReviewFixture() {
        const f = await lifecycleFixture(), queued = await f.queue();
        expect(await _beginSend._handler(f.ctx, queued)).toBe(true);
        await _result._handler(f.ctx, { ...queued, outcome: 'confirmed', deploymentId: 'dpl_protected', deploymentUrl: 'https://protected.vercel.app' });
        f.get(String(queued.op.schedulerId))!.state = { kind: 'success' };
        await _settle._handler(f.ctx, { operationId: queued.operationId });
        expect(f.get(f.candidate.releaseId)?.status).toBe('ready');
        // Customer review needs ordinary view access and a cloud role, never agency design/publish authority.
        f.table('workspaceMembers').clear();
        f.put('projectMembers', 'projectMembers:colleague', { projectId, userId: actorId, role: 'viewer' });
        f.get('cloudEditorGrants:colleague')!.role = 'content';
        f.destination.reviewGatewayVerified = true;
        const args = { protocol: 2 as const, releaseId: f.candidate.releaseId, verifier, session };
        async function open() {
            const issued = await issueReview._handler(f.ctx, { releaseId: f.candidate.releaseId });
            const target = await exchangeReview._handler(f.ctx, { protocol: 2, releaseId: f.candidate.releaseId, verifier,
                ticket: issued.ticket, sessionHash: await reviewDigest(session) });
            expect(target).not.toBeNull();
            return { issued, target };
        }
        return { ...f, reviewArgs: args, open };
    }
    function expectPublicOnly(value: unknown) {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            expect(['credential', 'ciphertext', 'token', 'bypass', 'storageId', 'deployFiles', 'hosting', 'media']).not.toContain(key);
            expectPublicOnly(child);
        }
        expect(JSON.stringify(value)).not.toContain('_storage:');
    }

    it('opens the exact ready candidate for a content viewer and supplies only frozen retained media privately', () => withReleaseEnvironment(async () => {
        const f = await readyReviewFixture(), opened = await f.open();
        expectPublicOnly(opened);
        expect(opened.target).toMatchObject({ hash: f.candidate.hash, hostingProfile: 'imported-next-hosting-v1',
            deploymentId: 'dpl_protected', credentialId: f.credential._id });
        const publicTarget = await authorizeReview._handler(f.ctx, f.reviewArgs);
        expect(publicTarget).toEqual(opened.target); expectPublicOnly(publicTarget);
        const queryStart = f.queries.length;
        const context = await _credentialContext._handler(f.ctx, { releaseId: f.candidate.releaseId, session,
            mediaRequest: { path: ['photo.webp'], search: '' } });
        expect(context?.target).toEqual(publicTarget);
        expect(context?.media).toEqual({ kind: 'imported-retained-media-v1', releaseHash: f.candidate.hash,
            path: 'public/photo.webp', hash: sha256(f.media), bytes: Buffer.byteLength(f.media), contentType: 'image/webp' });
        expect(context?.media).not.toHaveProperty('storageId');
        // One execution validation reads candidate deploy and parent deploy once each.
        expect(f.queries.slice(queryStart).filter(name => name === 'cloudReleaseFiles')).toHaveLength(2);
        expect(f.blobReads).toEqual(['_storage:media']); // Preparation only; review reads descriptors, not bodies.
        for (const mediaRequest of [
            { path: ['photo.webp'], search: '?download=1' }, { path: ['_next', 'image'], search: '' },
            { path: ['generated.webp'], search: '' }, { path: [], search: '' },
        ]) {
            const other = await _credentialContext._handler(f.ctx, { releaseId: f.candidate.releaseId, session, mediaRequest });
            expect(other?.target).toEqual(publicTarget); expect(other).not.toHaveProperty('media');
        }
        expect(f.destination.liveDeploymentId).toBeUndefined(); expect(f.destination.publicAliasVerified).toBe(false);
    }));

    it('requires manager bootstrap before gateway proof and rechecks that proof on an existing session', () => withReleaseEnvironment(async () => {
        const f = await readyReviewFixture(); f.destination.reviewGatewayVerified = false;
        await expect(issueReview._handler(f.ctx, { releaseId: f.candidate.releaseId })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        expect(f.table('cloudReleaseReviewTickets').size).toBe(0);
        f.get('cloudEditorGrants:colleague')!.role = 'responsible'; f.get('projectMembers:colleague')!.role = 'manager';
        await f.open();
        expect(await authorizeReview._handler(f.ctx, f.reviewArgs)).not.toBeNull();
        f.get('cloudEditorGrants:colleague')!.role = 'content'; f.get('projectMembers:colleague')!.role = 'viewer';
        expect(await authorizeReview._handler(f.ctx, f.reviewArgs)).toBeNull();
        f.destination.reviewGatewayVerified = true;
        expect(await authorizeReview._handler(f.ctx, f.reviewArgs)).not.toBeNull();
        f.destination.reviewGatewayVerified = false;
        expect(await _credentialContext._handler(f.ctx, { releaseId: f.candidate.releaseId, session })).toBeNull();
    }));

    it('closes public and private review after role, membership, generation or credential pin revocation', () => withReleaseEnvironment(async () => {
        for (const changed of ['grant', 'membership', 'generation', 'credential-profile', 'copied-credential', 'candidate-pin'] as const) {
            const f = await readyReviewFixture(); await f.open();
            if (changed === 'grant') f.table('cloudEditorGrants').clear();
            else if (changed === 'membership') f.table('projectMembers').clear();
            else if (changed === 'generation') f.destination.generation = 2;
            else if (changed === 'credential-profile') delete f.credential.hostingProfile;
            else if (changed === 'copied-credential') f.credential.destinationId = 'cloudReleaseDestinations:foreign';
            else (f.get(f.candidate.releaseId)!.importedHosting as Record<string, unknown>).deployHash = 'f'.repeat(64);
            const before = f.writes.length;
            expect(await authorizeReview._handler(f.ctx, f.reviewArgs)).toBeNull();
            expect(await _credentialContext._handler(f.ctx, { releaseId: f.candidate.releaseId, session,
                mediaRequest: { path: ['photo.webp'], search: '' } })).toBeNull();
            expect(f.writes).toHaveLength(before);
        }
    }));
});

describe('imported worker retained body transport', () => {
    async function workerFixture(publicVersion = false) {
        const f = await lifecycleFixture(publicVersion), queued = await f.queue();
        f.blobReads.length = 0;
        const results: Array<Parameters<typeof _result._handler>[1]> = [];
        let beginCalls = 0;
        const ctx = { runQuery: async () => _workerInput._handler(f.ctx, queued),
            runMutation: async (ref: Parameters<typeof getFunctionName>[0], args: Parameters<typeof _result._handler>[1]) => {
                if (getFunctionName(ref) === 'cloudReleases:_beginSend') { beginCalls++; return _beginSend._handler(f.ctx, args); }
                if (getFunctionName(ref) === 'cloudReleases:_result') { results.push(args); return _result._handler(f.ctx, args); }
                throw Error('Unexpected worker mutation');
            }, storage: f.actionCtx.storage } as unknown as ActionCtx;
        return { ...f, queued, workerCtx: ctx, results, beginCalls: () => beginCalls };
    }
    async function providers(run: (hooks: { proof: { mockImplementation: (implementation: () => Promise<string>) => unknown } }) => Promise<void>) {
        const proof = spyOn(CloudReleaseVercel.prototype, 'verifyProject').mockResolvedValue('b'.repeat(64));
        const alias = spyOn(CloudReleaseVercel.prototype, 'aliasTarget').mockResolvedValue(null);
        const protectedProbe = spyOn(CloudReleaseVercel.prototype, 'verifyProtected').mockResolvedValue(undefined);
        const served = spyOn(CloudReleaseVercel.prototype, 'verifyServed').mockResolvedValue(undefined);
        const deployment = spyOn(CloudReleaseVercel.prototype, 'deploymentImported').mockResolvedValue({ ready: true, failed: false, url: 'https://protected.vercel.app' });
        const legacy = spyOn(CloudReleaseVercel.prototype, 'create').mockRejectedValue(Error('Legacy create must not run'));
        const assign = spyOn(CloudReleaseVercel.prototype, 'assign').mockRejectedValue(Error('Imported alias must not run'));
        try { await run({ proof }); expect(legacy).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled(); }
        finally { proof.mockRestore(); alias.mockRestore(); protectedProbe.mockRestore(); served.mockRestore(); deployment.mockRestore(); legacy.mockRestore(); assign.mockRestore(); }
    }

    it('builds an eligible version with the real worker and allows customer acknowledgment without mutable source or design access', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await workerFixture(true);
        f.table('cloudEditorImportPreparations').clear(); f.table('cloudEditorFiles').clear();
        f.get('cloudEditorStates:one')!.revision = 100;
        const create = spyOn(CloudReleaseVercel.prototype, 'createImported').mockImplementation(async input => {
            expect(input.candidateHash).toBe(f.candidate.hash); expect(f.queued.op.stage).toBe('sending');
            for await (const file of input.files) expect(file.bytes.byteLength).toBeGreaterThan(0);
            return 'dpl_public_candidate';
        });
        try {
            await providers(async () => { await work._handler(f.workerCtx, f.queued); });
            expect(f.results).toMatchObject([{ outcome: 'confirmed', deploymentId: 'dpl_public_candidate' }]);
            f.get(String(f.queued.op.schedulerId))!.state = { kind: 'success' };
            await _settle._handler(f.ctx, { operationId: f.queued.operationId });
            expect(f.get(f.candidate.releaseId)).toMatchObject({ status: 'ready', deploymentId: 'dpl_public_candidate' });
            f.destination.reviewGatewayVerified = true;
            f.table('workspaceMembers').clear();
            f.put('projectMembers', 'projectMembers:customer', { projectId, userId: actorId, role: 'viewer' });
            f.get('cloudEditorGrants:colleague')!.role = 'content';
            const acknowledgment = { releaseId: f.candidate.releaseId, hash: f.candidate.hash, expectedActorId: actorId, expectedDeploymentId: 'dpl_public_candidate' };
            await review._handler(f.ctx, acknowledgment); await review._handler(f.ctx, acknowledgment);
            expect(f.table('cloudReleaseReviews').size).toBe(1);
            const value = await status._handler(f.ctx, { projectId, branchId });
            expect(value).toMatchObject({ canPublish: false, canReviewPublication: true, canBuildPrivateReview: false, canBackup: false });
            expect(value.releases).toHaveLength(1);
            expect(value.releases[0]).toMatchObject({ visibility: 'publishable', reviewed: true, canAcknowledge: true, canManageVersions: false });
            const issued = await issueReview._handler(f.ctx, { releaseId: f.candidate.releaseId });
            expect(issued.ticket).toBeString();
            const verifier = 'a'.repeat(64), session = 'x'.repeat(64);
            expect(await exchangeReview._handler(f.ctx, { protocol: 2, releaseId: f.candidate.releaseId, ticket: issued.ticket,
                verifier, sessionHash: await reviewDigest(session) })).not.toBeNull();
            delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
            expect(await authorizeReview._handler(f.ctx, { protocol: 2, releaseId: f.candidate.releaseId, verifier, session })).toBeNull();
            await expect(review._handler(f.ctx, acknowledgment)).rejects.toThrow('CLOUD_IMPORTED_PUBLICATION_DISABLED');
            expect(f.destination.liveReleaseId).toBeUndefined(); expect(f.destination.liveDeploymentId).toBeUndefined();
        } finally { create.mockRestore(); }
    })));

    it('rechecks the independent publication grant after provider verification before any upload', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await workerFixture(true);
        const create = spyOn(CloudReleaseVercel.prototype, 'createImported').mockRejectedValue(Error('Must not upload'));
        try {
            await providers(async ({ proof }) => { proof.mockImplementation(async () => {
                f.get('cloudEditorGrants:colleague')!.publish = false; return 'b'.repeat(64);
            }); await work._handler(f.workerCtx, f.queued); });
            expect(create).not.toHaveBeenCalled(); expect(f.blobReads).toEqual([]);
            expect(f.results).toMatchObject([{ outcome: 'failed', error: 'CLOUD_RELEASE_NOT_ALLOWED' }]);
        } finally { create.mockRestore(); }
    })));

    it('reads exact retained bodies only after send authority, one generator pull at a time', () => withReleaseEnvironment(async () => {
        const f = await workerFixture(), consumed: string[] = [];
        let lastReads = 0;
        const create = spyOn(CloudReleaseVercel.prototype, 'createImported').mockImplementation(async input => {
            expect(f.queued.op.stage).toBe('sending'); expect(f.blobReads).toEqual([]);
            expect(input.candidateHash).toBe(f.candidate.hash);
            expect(input.deployHash).toBe(f.queued.op.deployHash); expect(input.buildPolicyHash).toBe(f.queued.op.buildPolicyHash);
            const iterator = input.files[Symbol.asyncIterator]();
            while (true) {
                expect(f.blobReads.length).toBe(lastReads);
                const next = await iterator.next(); if (next.done) break;
                const descriptor = input.manifest.find(file => file.path === next.value.path)!;
                expect(sha256(next.value.bytes)).toBe(descriptor.hash); expect(next.value.bytes.byteLength).toBe(descriptor.bytes);
                consumed.push(next.value.path); lastReads = f.blobReads.length;
                await Promise.resolve(); expect(f.blobReads.length).toBe(lastReads);
            }
            expect(consumed).toEqual(input.manifest.map(file => file.path));
            return 'dpl_protected';
        });
        try {
            await providers(async () => { await work._handler(f.workerCtx, f.queued); });
            expect(create).toHaveBeenCalledTimes(1); expect(f.beginCalls()).toBe(1); expect(f.blobReads).toHaveLength(2);
            expect(f.results).toMatchObject([{ outcome: 'confirmed', deploymentId: 'dpl_protected' }]);
        } finally { create.mockRestore(); }
    }));

    it('does not read or upload bodies after authority is revoked during provider verification', () => withReleaseEnvironment(async () => {
        const f = await workerFixture();
        const create = spyOn(CloudReleaseVercel.prototype, 'createImported').mockRejectedValue(Error('Unexpected create'));
        try {
            await providers(async ({ proof }) => {
                proof.mockImplementation(async () => { f.get('cloudEditorGrants:colleague')!.role = 'content'; return 'b'.repeat(64); });
                await work._handler(f.workerCtx, f.queued);
            });
            expect(create).not.toHaveBeenCalled(); expect(f.blobReads).toEqual([]);
            expect(f.results).toMatchObject([{ outcome: 'failed', error: 'CLOUD_RELEASE_NOT_ALLOWED' }]);
        } finally { create.mockRestore(); }
    }));

    it('keeps a missing body or lost create acknowledgement unknown without retry', () => withReleaseEnvironment(async () => {
        for (const missing of [true, false]) {
            const f = await workerFixture(); if (missing) f.setBlob(null);
            const create = spyOn(CloudReleaseVercel.prototype, 'createImported').mockImplementation(async input => {
                for await (const file of input.files) expect(file.bytes.byteLength).toBeGreaterThanOrEqual(0);
                throw Error('Lost create response');
            });
            try {
                await providers(async () => { await work._handler(f.workerCtx, f.queued); });
                expect(create).toHaveBeenCalledTimes(1); expect(f.results).toHaveLength(1); expect(f.results[0]!.outcome).toBe('unknown');
                expect(f.queued.op.stage).toBe('unknown'); expect(f.destination.lockOperationId).toBe(f.queued.operationId);
                expect(f.destination.remainingBuilds).toBe(0);
            } finally { create.mockRestore(); }
        }
    }));
});


async function withPublication(run: () => Promise<void>) {
    const key = 'WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED', prior = process.env[key];
    process.env[key] = 'true';
    try { await run(); } finally { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; }
}
async function eligibleFixture(allowScheduling = false) {
    const f = await fixture(allowScheduling), publicId = 'cloudReleases:eligible' as Id<'cloudReleases'>;
    const prepared = await prepareImportedReleaseArtifact({ source: f.source, original: f.original, metadata: f.metadata,
        purpose: 'release', publicationIntent: 'eligible-public-version' });
    f.put('cloudReleases', publicId, { ...f.get(artifactId)!, purpose: 'release', artifactProfile: 'imported-next-public-v1',
        publicationIntent: 'eligible-public-version', operationKey: 'eligible-source-0001',
        hash: prepared.hash, artifactJson: prepared.artifactJson });
    for (const [stage, files] of [['source', f.source], ['original', f.original], ['deploy', prepared.files]] as const) {
        for (const file of files) f.put('cloudReleaseFiles', `cloudReleaseFiles:eligible:${stage}:${file.path}`, { ...file, releaseId: publicId, stage });
    }
    f.get('cloudEditorGrants:colleague')!.publish = true;
    const baselineId = 'cloudEditorImports:baseline', preparationId = 'cloudEditorImportPreparations:current';
    f.put('cloudEditorImports', baselineId, { state: 'finalized', projectId, branchId, workspaceId,
        manifestHash: f.metadata.originalManifestHash, files: originalImportFiles(f.original) });
    f.put('cloudEditorImportPreparations', preparationId, { ...f.metadata.preparation, projectId, branchId, workspaceId,
        baselineAttemptId: baselineId, baselineManifestHash: f.metadata.originalManifestHash, generation: 1, profileVersion: 1, preparationVersion: 1 });
    Object.assign(f.get('cloudEditorStates:one')!, { preparationId, designRevision: f.metadata.preparation.preparedRevision });
    for (const file of f.source) f.put('cloudEditorFiles', `cloudEditorFiles:${file.path}`, { ...file, projectId, branchId });
    Object.assign(f.args, { artifactId: publicId, expectedArtifactHash: prepared.hash, visibility: 'publishable' });
    return { ...f, publicId };
}

describe('eligible imported frozen candidate authority', () => {
    it('keeps review gateway issuance closed for a ready-looking publishable row', () => withReleaseEnvironment(async () => {
        const f = await lifecycleFixture();
        const row = f.get(f.candidate.releaseId)!;
        Object.assign(row, { status: 'ready', deploymentId: 'dpl_protected', deploymentUrl: 'https://ready.vercel.app', builtDestinationKey: f.destination.key });
        const publicSource = await prepareImportedReleaseArtifact({ source: f.source, original: f.original, metadata: f.metadata,
            purpose: 'release', publicationIntent: 'eligible-public-version' });
        Object.assign(f.get(artifactId)!, { purpose: 'release', artifactProfile: 'imported-next-public-v1', publicationIntent: 'eligible-public-version',
            hash: publicSource.hash, artifactJson: publicSource.artifactJson });
        const candidate = JSON.parse(String(row.artifactJson)) as ImportedHostingCandidate;
        candidate.importedHosting.visibility = 'publishable'; candidate.importedHosting.artifactHash = publicSource.hash;
        row.artifactJson = serializeImportedHostingCandidate(candidate); row.hash = sha256(String(row.artifactJson)); row.importedHosting = candidate.importedHosting;
        Object.assign(row.importedHostingRequest as object, { visibility: 'publishable', expectedArtifactHash: publicSource.hash });
        await readImportedHostingExecution(f.ctx, row as unknown as Doc<'cloudReleases'>);
        f.destination.reviewGatewayVerified = true;
        const before = f.writes.length;
        await expect(issueReview._handler(f.ctx, { releaseId: f.candidate.releaseId })).rejects.toThrow();
        expect(f.writes).toHaveLength(before); expect(f.table('cloudReleaseReviewTickets').size).toBe(0);
    }));

    it('runs the actual public source preparation action and independently seals exact retained bytes', () => withPublication(async () => {
        const f = await eligibleFixture(), row = f.get(f.publicId)!;
        const expectedHash = String(row.hash), expectedJson = String(row.artifactJson);
        Object.assign(row, { status: 'captured', actorId }); delete row.hash; delete row.artifactJson; delete row.sourceHash;
        for (const [id, file] of f.table('cloudReleaseFiles')) if (file.releaseId === f.publicId && file.stage === 'deploy') f.table('cloudReleaseFiles').delete(id);
        const actionCtx = { storage: f.actionCtx.storage,
            runQuery: async (_ref: unknown, args: { releaseId: Id<'cloudReleases'>; expectedActorId?: Id<'users'> }) => _input._handler(f.ctx, args),
            runMutation: async (_ref: unknown, args: Parameters<typeof _seal._handler>[1]) => _seal._handler(f.ctx, args),
        } as unknown as ActionCtx;
        expect(await prepareSourceArtifact._handler(actionCtx, { releaseId: f.publicId, expectedActorId: actorId })).toEqual({ releaseId: f.publicId, hash: expectedHash });
        expect(f.get(f.publicId)).toMatchObject({ status: 'frozen', artifactJson: expectedJson, hash: expectedHash });
        const before = f.writes.length;
        expect(await prepareSourceArtifact._handler(actionCtx, { releaseId: f.publicId, expectedActorId: actorId })).toEqual({ releaseId: f.publicId, hash: expectedHash });
        expect(f.writes).toHaveLength(before);
        delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
        await expect(prepareSourceArtifact._handler(actionCtx, { releaseId: f.publicId, expectedActorId: actorId })).rejects.toThrow('CLOUD_IMPORTED_PUBLICATION_DISABLED');
        expect(f.writes).toHaveLength(before);
    }));

    it('seals exact public parent and replays without writes while unconfigured builds and public switches stay closed', () => withPublication(async () => {
        const f = await eligibleFixture(), sourceBefore = structuredClone(f.get(f.publicId)), privateBefore = structuredClone(f.get(artifactId));
        const result = await f.prepare(), row = f.get(result.releaseId)!;
        expect(row).toMatchObject({ purpose: 'release', status: 'frozen', importedHosting: { visibility: 'publishable', artifactId: f.publicId } });
        expect(row.artifactProfile).toBeUndefined(); expect(row.imported).toBeUndefined();
        const before = f.writes.length;
        expect(await f.prepare()).toEqual(result); expect(f.writes).toHaveLength(before);
        await readImportedHostingExecution(f.ctx, row as unknown as Doc<'cloudReleases'>);
        // Even an otherwise registered-looking destination is not enough for Stage 1 admission.
        f.put('cloudReleaseDestinations', 'cloudReleaseDestinations:disabled-public', { projectId, branchId, workspaceId,
            hostingProfile: 'imported-next-hosting-v1', registrationVersion: 2, remainingBuilds: 3 });
        for (const kind of ['build', 'publish', 'rollback'] as const) await expect(request._handler(f.ctx, {
            releaseId: result.releaseId, expectedActorId: actorId, operationKey: `public-denied-${kind}-0001`, kind, expectedLiveReleaseId: null,
        })).rejects.toThrow('CLOUD_RELEASE_SETUP_REQUIRED');
        expect(f.writes).toHaveLength(before); expect(f.table('cloudReleaseOperations').size).toBe(0);
        expect(f.get('cloudReleaseDestinations:disabled-public')!.remainingBuilds).toBe(3);
        expect(f.get(f.publicId)).toEqual(sourceBefore); expect(f.get(artifactId)).toEqual(privateBefore);
        await expect(restoreCopy._handler(f.ctx, { backupId: f.publicId, expectedActorId: actorId, name: 'No copy', operationKey: 'public-restore-denied-0001' })).rejects.toThrow('CLOUD_BACKUP_NOT_READY');
    }));

    it('requires gate and current grant before planning, final seal and exact receipt replay', () => withPublication(async () => {
        for (const changed of ['gate', 'publish', 'role', 'actor', 'membership'] as const) {
            const f = await eligibleFixture(), prepared = await f.plan();
            const before = f.writes.length;
            if (changed === 'gate') delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
            else if (changed === 'publish') f.get('cloudEditorGrants:colleague')!.publish = false;
            else if (changed === 'role') f.get('cloudEditorGrants:colleague')!.role = 'content';
            else if (changed === 'actor') f.signIn('creator');
            else f.table('workspaceMembers').clear();
            await expect(f.prepare()).rejects.toThrow();
            await expect(_sealHosting._handler(f.ctx, f.sealArgs(prepared))).rejects.toThrow();
            expect(f.writes).toHaveLength(before); process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED = 'true';
        }
        const f = await eligibleFixture(); await f.prepare(); const before = f.writes.length;
        f.get('cloudEditorGrants:colleague')!.publish = false;
        await expect(f.prepare()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED'); expect(f.writes).toHaveLength(before);
        f.get('cloudEditorGrants:colleague')!.publish = true; delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
        await expect(f.prepare()).rejects.toThrow('CLOUD_IMPORTED_PUBLICATION_DISABLED'); expect(f.writes).toHaveLength(before);
    }));

    it('rechecks actual grant changes across the action blob await without sealing', () => withPublication(async () => {
        const f = await eligibleFixture(); f.onBlob(() => { f.get('cloudEditorGrants:colleague')!.publish = false; });
        const before = f.writes.length;
        await expect(f.prepare()).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED'); expect(f.writes).toHaveLength(before);
        expect(f.blobReads).toEqual(['_storage:media']);
    }));

    it('refuses every cross-pair including a forged rehashed descriptor against private captured rows', () => withPublication(async () => {
        const f = await eligibleFixture(), before = f.writes.length;
        const publishable = { ...f.args };
        f.args.visibility = 'protected-only'; await expect(f.prepare()).rejects.toThrow('ARTIFACT_MISMATCH');
        Object.assign(f.args, { ...publishable, artifactId, expectedArtifactHash: f.privateArtifact.hash });
        await expect(f.prepare()).rejects.toThrow('ARTIFACT_MISMATCH');
        const row = f.get(f.publicId)!; row.purpose = 'backup'; Object.assign(f.args, publishable);
        await expect(f.prepare()).rejects.toThrow('ARTIFACT_MISMATCH');
        expect(f.writes).toHaveLength(before);
    }));
});


describe('eligible build admission and final send boundaries', () => {
    it('replays an admitted build before fresh live CAS without another debit or schedule', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await lifecycleFixture(true), queued = await f.queue(), before = f.writes.length;
        f.destination.liveReleaseId = 'cloudReleases:new-live'; f.destination.liveDeploymentId = 'dpl_new_live';
        expect(await request._handler(f.ctx, f.buildArgs)).toBe(queued.operationId); expect(f.writes).toHaveLength(before);
        expect(f.destination.remainingBuilds).toBe(0);
        expect(await _workerInput._handler(f.ctx, queued)).toBeNull();
        expect(await _beginSend._handler(f.ctx, queued)).toBe(false); expect(queued.op.stage).toBe('queued');
    })));

    it('requires current grant/gate/design and exact actor for initial build and delayed send', () => withReleaseEnvironment(() => withPublication(async () => {
        for (const changed of ['grant', 'gate', 'role', 'live', 'deployment'] as const) {
            const f = await lifecycleFixture(true), queued = await f.queue(), before = f.writes.length;
            if (changed === 'grant') f.get('cloudEditorGrants:colleague')!.publish = false;
            else if (changed === 'gate') delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
            else if (changed === 'role') f.get('cloudEditorGrants:colleague')!.role = 'content';
            else if (changed === 'live') f.destination.liveReleaseId = 'cloudReleases:other';
            else f.destination.liveDeploymentId = 'dpl_other';
            expect(await _workerInput._handler(f.ctx, queued)).toBeNull(); expect(await _beginSend._handler(f.ctx, queued)).toBe(false);
            expect(f.writes).toHaveLength(before); process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED = 'true';
        }
        const f = await lifecycleFixture(true), before = f.writes.length;
        f.get('cloudEditorGrants:colleague')!.publish = false;
        await expect(request._handler(f.ctx, f.buildArgs)).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        expect(f.writes).toHaveLength(before); expect(f.destination.remainingBuilds).toBe(1);
    })));

    it('records a completed authorized build after grant/gate revocation without another send or live-pointer write', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await lifecycleFixture(true), queued = await f.queue(); expect(await _beginSend._handler(f.ctx, queued)).toBe(true);
        f.get('cloudEditorGrants:colleague')!.publish = false; delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
        await _result._handler(f.ctx, { ...queued, outcome: 'confirmed', deploymentId: 'dpl_saved', deploymentUrl: 'https://saved.vercel.app' });
        f.get(String(queued.op.schedulerId))!.state = { kind: 'success' }; await _settle._handler(f.ctx, { operationId: queued.operationId });
        expect(f.get(f.candidate.releaseId)?.status).toBe('ready'); expect(f.destination.lockOperationId).toBeUndefined();
        expect(f.destination.liveReleaseId).toBeUndefined(); expect(f.destination.remainingBuilds).toBe(0);
    })));

    it('requires exact review actor/deployment and both proofs before a public request', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await lifecycleFixture(true), row = f.get(f.candidate.releaseId)!;
        Object.assign(row, { status: 'ready', deploymentId: 'dpl_saved', deploymentUrl: 'https://saved.vercel.app', builtDestinationKey: f.destination.key });
        f.destination.reviewGatewayVerified = true;
        f.table('workspaceMembers').clear(); f.put('projectMembers', 'projectMembers:customer', { projectId, userId: actorId, role: 'viewer' });
        f.get('cloudEditorGrants:colleague')!.role = 'content';
        const args = { releaseId: f.candidate.releaseId, hash: f.candidate.hash, expectedActorId: actorId, expectedDeploymentId: 'dpl_saved' };
        for (const patch of [{ expectedActorId: historicalActorId }, { expectedDeploymentId: 'dpl_other' }, { hash: 'f'.repeat(64) }]) {
            await expect(review._handler(f.ctx, { ...args, ...patch })).rejects.toThrow();
        }
        await expect(review._handler(f.ctx, { releaseId: args.releaseId, hash: args.hash })).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        f.get('cloudEditorGrants:colleague')!.publish = false;
        await expect(review._handler(f.ctx, args)).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
        f.get('cloudEditorGrants:colleague')!.publish = true; await review._handler(f.ctx, args);
        const before = f.writes.length;
        await expect(request._handler(f.ctx, { ...f.buildArgs, kind: 'publish' })).rejects.toThrow('CLOUD_RELEASE_SETUP_REQUIRED');
        expect(f.writes).toHaveLength(before);
        f.destination.publicAliasVerified = true;
        const operationId = await request._handler(f.ctx, { ...f.buildArgs, kind: 'publish', expectedHash: f.candidate.hash, expectedTargetDeploymentId: 'dpl_saved' });
        expect(f.get(operationId)).toMatchObject({ kind: 'publish', stage: 'queued', targetDeploymentId: 'dpl_saved' });
        expect(f.table('cloudReleaseOperations').size).toBe(1); expect(f.destination.remainingBuilds).toBe(1);
    })));
});


/** Synthetic queued operation for focused final-authority and factual-settlement checks. */
async function publicTargetFixture() {
    const f = await lifecycleFixture(true), queued = await f.queue(), release = f.get(f.candidate.releaseId)!;
    Object.assign(release, { status: 'ready', deploymentId: 'dpl_target', builtDestinationKey: f.destination.key });
    Object.assign(queued.op, { kind: 'publish', targetDeploymentId: 'dpl_target' });
    Object.assign(f.destination, { reviewGatewayVerified: true, publicAliasVerified: true });
    f.table('workspaceMembers').clear();
    f.put('projectMembers', 'projectMembers:customer', { projectId, userId: actorId, role: 'viewer' });
    f.get('cloudEditorGrants:colleague')!.role = 'content';
    const acknowledgment = f.put('cloudReleaseReviews', 'cloudReleaseReviews:customer', {
        releaseId: release._id, actorId, hash: release.hash, deploymentId: release.deploymentId, reviewedAt: 1 });
    const guard = () => assertImportedPublicTarget(f.ctx, release as unknown as Doc<'cloudReleases'>,
        f.destination as unknown as Doc<'cloudReleaseDestinations'>, queued.op as unknown as Doc<'cloudReleaseOperations'>);
    return { ...f, ...queued, release, acknowledgment, guard };
}

describe('imported public final-target and settlement guards', () => {
    it('accepts a current content publisher without update rights at worker input and final send', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicTargetFixture(), before = f.writes.length;
        await f.guard();
        expect(await _workerInput._handler(f.ctx, f)).toMatchObject({ importedCandidate: { importedHosting: { visibility: 'publishable' } } });
        expect(await _beginSend._handler(f.ctx, f)).toBe(true);
        expect(f.op.stage).toBe('sending'); expect(f.writes).toHaveLength(before + 1);
    })));

    it('rechecks every public authority, review and live target pin without writes', () => withReleaseEnvironment(() => withPublication(async () => {
        for (const changed of ['grant', 'gate', 'member', 'actor', 'role', 'review-hash', 'review-deployment', 'target', 'baseline', 'live', 'live-deployment', 'destination-key', 'gateway', 'alias-proof'] as const) {
            const f = await publicTargetFixture(), before = f.writes.length;
            if (changed === 'grant') f.get('cloudEditorGrants:colleague')!.publish = false;
            else if (changed === 'gate') delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
            else if (changed === 'member') f.table('projectMembers').clear();
            else if (changed === 'actor') f.get(actorId)!.clerkUserId = undefined;
            else if (changed === 'role') f.table('cloudEditorGrants').clear();
            else if (changed === 'review-hash') f.acknowledgment.hash = 'a'.repeat(64);
            else if (changed === 'review-deployment') f.acknowledgment.deploymentId = 'dpl_other';
            else if (changed === 'target') f.op.targetDeploymentId = 'dpl_other';
            else if (changed === 'baseline') f.release.baselineReleaseId = 'cloudReleases:other';
            else if (changed === 'live') f.destination.liveReleaseId = 'cloudReleases:other';
            else if (changed === 'live-deployment') f.destination.liveDeploymentId = 'dpl_other';
            else if (changed === 'destination-key') f.destination.key = 'other';
            else if (changed === 'gateway') f.destination.reviewGatewayVerified = false;
            else f.destination.publicAliasVerified = false;
            await expect(f.guard()).rejects.toThrow(); expect(f.writes).toHaveLength(before);
            process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED = 'true';
        }
    })));

    it('requires exact same-destination confirmed target history for rollback but ignores its old capture baseline', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicTargetFixture(); f.op.kind = 'rollback'; f.release.baselineReleaseId = 'cloudReleases:old-baseline';
        await expect(f.guard()).rejects.toThrow('CLOUD_RELEASE_ROLLBACK_UNAVAILABLE');
        const historical = f.put('cloudReleaseOperations', 'cloudReleaseOperations:past', { ...f.op, _id: 'cloudReleaseOperations:past',
            stage: 'confirmed', kind: 'publish', resultDeploymentId: 'dpl_target' });
        for (const field of ['destinationId', 'sourceHash', 'targetDeploymentId', 'resultDeploymentId', 'deployHash', 'buildPolicyHash'] as const) {
            const original = historical[field]; historical[field] = 'wrong';
            await expect(f.guard()).rejects.toThrow('CLOUD_RELEASE_ROLLBACK_UNAVAILABLE'); historical[field] = original;
        }
        historical.stage = 'unknown'; await expect(f.guard()).rejects.toThrow('CLOUD_RELEASE_ROLLBACK_UNAVAILABLE');
        historical.stage = 'confirmed'; await f.guard();
    })));

    it('records an exact sent target despite later grant/gate/credential revocation and waits for worker exit', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicTargetFixture(); f.op.stage = 'sending';
        f.get('cloudEditorGrants:colleague')!.publish = false; delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
        f.destination.generation = 2; f.credential.revokedAt = Date.now();
        await _result._handler(f.ctx, { operationId: f.operationId, nonce: f.nonce, outcome: 'confirmed', deploymentId: 'dpl_target' });
        await _settle._handler(f.ctx, { operationId: f.operationId });
        expect(f.destination.liveReleaseId).toBeUndefined(); expect(f.destination.lockOperationId).toBe(f.operationId);
        f.get(String(f.op.schedulerId))!.state = { kind: 'success' };
        await _settle._handler(f.ctx, { operationId: f.operationId });
        expect(f.destination.liveReleaseId).toBe(f.candidate.releaseId); expect(f.destination.liveDeploymentId).toBe('dpl_target');
        expect(f.destination.lockOperationId).toBeUndefined(); expect(f.table('cloudReleaseOperations').size).toBe(1);
    })));

    it('never confirms another reported target or a confirmation before send authority', () => withReleaseEnvironment(() => withPublication(async () => {
        for (const invalid of ['wrong-target', 'missing-target', 'not-sent', 'changed-live', 'changed-ready-target'] as const) {
            const f = await publicTargetFixture(); f.op.stage = invalid === 'not-sent' ? 'queued' : 'sending';
            if (invalid === 'changed-live') f.destination.liveDeploymentId = 'dpl_other';
            if (invalid === 'changed-ready-target') f.release.deploymentId = 'dpl_other';
            await _result._handler(f.ctx, { operationId: f.operationId, nonce: f.nonce, outcome: 'confirmed',
                deploymentId: invalid === 'missing-target' ? undefined : invalid === 'wrong-target' ? 'dpl_wrong' : 'dpl_target' });
            expect(f.op.stage).toBe('unknown'); expect(f.destination.drifted).toBe(true);
            f.get(String(f.op.schedulerId))!.state = { kind: 'success' }; await _settle._handler(f.ctx, { operationId: f.operationId });
            expect(f.destination.liveReleaseId).toBeUndefined(); expect(f.destination.lockOperationId).toBe(f.operationId);
        }
    })));

    it('rechecks the target and live baseline at settlement rather than trusting the saved confirmed marker', () => withReleaseEnvironment(() => withPublication(async () => {
        for (const changed of ['result-target', 'ready-target', 'live-release', 'live-deployment', 'destination-key'] as const) {
            const f = await publicTargetFixture(); f.op.stage = 'sending';
            await _result._handler(f.ctx, { operationId: f.operationId, nonce: f.nonce, outcome: 'confirmed', deploymentId: 'dpl_target' });
            if (changed === 'result-target') f.op.resultDeploymentId = 'dpl_other';
            else if (changed === 'ready-target') f.release.deploymentId = 'dpl_other';
            else if (changed === 'live-release') f.destination.liveReleaseId = 'cloudReleases:newer';
            else if (changed === 'live-deployment') f.destination.liveDeploymentId = 'dpl_newer';
            else f.destination.key = 'changed';
            const beforeLive = [f.destination.liveReleaseId, f.destination.liveDeploymentId];
            f.get(String(f.op.schedulerId))!.state = { kind: 'success' }; await _settle._handler(f.ctx, { operationId: f.operationId });
            expect(f.op.stage).toBe('unknown'); expect(f.destination.drifted).toBe(true);
            expect([f.destination.liveReleaseId, f.destination.liveDeploymentId]).toEqual(beforeLive);
            expect(f.destination.lockOperationId).toBe(f.operationId);
        }
    })));
});

async function publicAliasWorkerFixture() {
    const f = await lifecycleFixture(true), release = f.get(f.candidate.releaseId)!;
    Object.assign(release, { status: 'ready', deploymentId: 'dpl_public', deploymentUrl: 'https://public-raw.vercel.app', builtDestinationKey: f.destination.key });
    Object.assign(f.destination, { reviewGatewayVerified: true, publicAliasVerified: true });
    f.table('workspaceMembers').clear();
    f.put('projectMembers', 'projectMembers:publisher', { projectId, userId: actorId, role: 'viewer' });
    f.get('cloudEditorGrants:colleague')!.role = 'content';
    await review._handler(f.ctx, { releaseId: f.candidate.releaseId, hash: f.candidate.hash, expectedActorId: actorId, expectedDeploymentId: 'dpl_public' });
    const publication = { ...f.buildArgs, kind: 'publish' as const, operationKey: 'public-alias-publish-0001',
        expectedHash: f.candidate.hash, expectedTargetDeploymentId: 'dpl_public' };
    const results: Array<Parameters<typeof _result._handler>[1]> = [];
    const workerCtx = { runQuery: async (_ref: unknown, args: Parameters<typeof _workerInput._handler>[1]) => _workerInput._handler(f.ctx, args),
        runMutation: async (ref: Parameters<typeof getFunctionName>[0], args: Parameters<typeof _result._handler>[1]) => {
            if (getFunctionName(ref) === 'cloudReleases:_beginSend') return _beginSend._handler(f.ctx, args);
            if (getFunctionName(ref) === 'cloudReleases:_result') { results.push(args); return _result._handler(f.ctx, args); }
            throw Error('Unexpected alias worker mutation');
        }, storage: { get: async () => { throw Error('Alias must not read binary bodies'); } } } as unknown as ActionCtx;
    const queueOperation = async (args: Parameters<typeof request._handler>[1] = publication) => {
        const operationId = await request._handler(f.ctx, args), op = f.get(operationId)!;
        f.get(String(op.schedulerId))!.state = { kind: 'inProgress' };
        return { operationId, nonce: String(op.nonce), op };
    };
    const settle = async (operationId: Id<'cloudReleaseOperations'>) => {
        const op = f.get(operationId)!; f.get(String(op.schedulerId))!.state = { kind: 'success' };
        await _settle._handler(f.ctx, { operationId });
    };
    return { ...f, release, publication, results, workerCtx, queueOperation, settle };
}

describe('imported public alias worker integration', () => {
    it('publishes and rolls back an immutable reviewed version without rebuilding or touching newer drafts', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture(), sourceBefore = structuredClone([...f.table('cloudEditorFiles').values()]);
        f.get('cloudEditorStates:one')!.revision = 100;
        const listed = await status._handler(f.ctx, { projectId, branchId });
        expect(listed).toMatchObject({ canPublish: false, canPublishImported: true });
        expect(listed.releases.find(row => row.id === f.candidate.releaseId)).toMatchObject({ canPublish: true, canRollback: false });
        const assign = spyOn(CloudReleaseVercel.prototype, 'assignImported').mockImplementation(async input => {
            expect(input.pins.candidateHash).toBe(f.candidate.hash); expect(input.candidate.importedHosting.visibility).toBe('publishable');
            expect(input.deploymentId).toBe('dpl_public'); await input.beforeSend();
            expect(f.get(String(f.destination.lockOperationId))!.stage).toBe('sending');
        });
        const legacy = spyOn(CloudReleaseVercel.prototype, 'assign').mockRejectedValue(Error('Legacy assign forbidden'));
        const create = spyOn(CloudReleaseVercel.prototype, 'createImported').mockRejectedValue(Error('Rebuild forbidden'));
        try {
            const published = await f.queueOperation(); await work._handler(f.workerCtx, published); await f.settle(published.operationId);
            expect(f.destination).toMatchObject({ liveReleaseId: f.candidate.releaseId, liveDeploymentId: 'dpl_public', remainingBuilds: 1 });
            expect(f.destination.lockOperationId).toBeUndefined();
            f.destination.liveReleaseId = 'cloudReleases:newer'; f.destination.liveDeploymentId = 'dpl_newer';
            const writes = f.writes.length;
            expect(await request._handler(f.ctx, f.publication)).toBe(published.operationId); expect(f.writes).toHaveLength(writes);
            const rollback = await f.queueOperation({ ...f.publication, kind: 'rollback', operationKey: 'public-alias-rollback-0001',
                expectedLiveReleaseId: 'cloudReleases:newer' as Id<'cloudReleases'> });
            await work._handler(f.workerCtx, rollback); await f.settle(rollback.operationId);
            expect(f.destination).toMatchObject({ liveReleaseId: f.candidate.releaseId, liveDeploymentId: 'dpl_public', remainingBuilds: 1 });
            expect(f.results.map(result => result.outcome)).toEqual(['confirmed', 'confirmed']);
            expect([...f.table('cloudEditorFiles').values()]).toEqual(sourceBefore); expect(f.get('cloudEditorStates:one')!.revision).toBe(100);
            expect(assign).toHaveBeenCalledTimes(2); expect(legacy).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
        } finally { assign.mockRestore(); legacy.mockRestore(); create.mockRestore(); }
    })));

    it('rechecks authority inside the adapter callback and never acquires send authority after revocation', () => withReleaseEnvironment(() => withPublication(async () => {
        for (const change of ['grant', 'gate', 'credential', 'review', 'live', 'generation']) {
            const f = await publicAliasWorkerFixture(), queued = await f.queueOperation(); let sent = 0;
            const assign = spyOn(CloudReleaseVercel.prototype, 'assignImported').mockImplementation(async input => {
                if (change === 'grant') f.get('cloudEditorGrants:colleague')!.publish = false;
                if (change === 'gate') delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
                if (change === 'credential') f.credential.revokedAt = 1;
                if (change === 'review') f.table('cloudReleaseReviews').clear();
                if (change === 'live') f.destination.liveDeploymentId = 'outside';
                if (change === 'generation') f.destination.generation = 2;
                await input.beforeSend(); sent++;
            });
            try {
                await work._handler(f.workerCtx, queued);
                expect(sent).toBe(0); expect(f.results).toMatchObject([{ outcome: 'failed' }]); expect(queued.op.stage).toBe('failed');
                expect(f.destination.liveReleaseId).toBeUndefined(); expect(f.destination.remainingBuilds).toBe(1);
            } finally { assign.mockRestore(); process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED = 'true'; }
        }
    })));

    it('keeps a lost post-send reply unknown and records a successful send despite later revocation', () => withReleaseEnvironment(() => withPublication(async () => {
        for (const lost of [true, false]) {
            const f = await publicAliasWorkerFixture(), queued = await f.queueOperation(); let sends = 0;
            const assign = spyOn(CloudReleaseVercel.prototype, 'assignImported').mockImplementation(async input => {
                await input.beforeSend(); sends++; f.get('cloudEditorGrants:colleague')!.publish = false;
                delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED; f.credential.revokedAt = 1;
                if (lost) throw Error('lost reply after POST');
            });
            try {
                await work._handler(f.workerCtx, queued); await f.settle(queued.operationId);
                expect(sends).toBe(1); expect(f.results[0]!.outcome).toBe(lost ? 'unknown' : 'confirmed');
                expect(f.destination.liveReleaseId).toBe(lost ? undefined : f.candidate.releaseId);
                expect(f.destination.lockOperationId).toBe(lost ? queued.operationId : undefined);
                expect(f.destination.remainingBuilds).toBe(1);
            } finally { assign.mockRestore(); process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED = 'true'; }
        }
    })));
});

describe('publication status and exact confirmation receipts', () => {
    it('requires both saved confirmation pins and compares replay against the original operation before fresh target/live checks', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture(), before = f.writes.length;
        for (const patch of [{ expectedHash: undefined }, { expectedTargetDeploymentId: undefined },
            { expectedHash: 'f'.repeat(64) }, { expectedTargetDeploymentId: 'another' }]) {
            await expect(request._handler(f.ctx, { ...f.publication, ...patch })).rejects.toThrow('CLOUD_RELEASE_CHANGED');
        }
        expect(f.writes).toHaveLength(before);
        const queued = await f.queueOperation(), admitted = f.writes.length;
        f.destination.liveReleaseId = 'cloudReleases:newer'; f.destination.liveDeploymentId = 'dpl_newer';
        f.release.deploymentId = 'dpl_reactive';
        expect(await request._handler(f.ctx, f.publication)).toBe(queued.operationId);
        for (const patch of [{ expectedHash: undefined }, { expectedTargetDeploymentId: undefined },
            { expectedHash: 'f'.repeat(64) }, { expectedTargetDeploymentId: 'dpl_reactive' }]) {
            await expect(request._handler(f.ctx, { ...f.publication, ...patch })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        }
        expect(f.writes).toHaveLength(admitted); expect(f.destination.remainingBuilds).toBe(1);
        f.get('cloudEditorGrants:colleague')!.publish = false;
        await expect(request._handler(f.ctx, f.publication)).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
    })));

    it('reports a typed fresh live mismatch only for an unadmitted matching target request', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture(), before = f.writes.length;
        f.destination.liveReleaseId = 'cloudReleases:newer'; f.destination.liveDeploymentId = 'dpl_newer';
        await expect(request._handler(f.ctx, f.publication)).rejects.toThrow('CLOUD_RELEASE_LIVE_CHANGED');
        expect(f.table('cloudReleaseOperations').size).toBe(0); expect(f.writes).toHaveLength(before);
        delete process.env.WEBLAB_CLOUD_IMPORTED_PUBLICATION_ENABLED;
        await expect(request._handler(f.ctx, f.publication)).rejects.toThrow('CLOUD_IMPORTED_PUBLICATION_DISABLED');
        expect(f.writes).toHaveLength(before);
    })));

    it('projects strict public source capabilities separately from private source and creator-only finish', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await lifecycleFixture(true), publicSource = f.get(f.args.artifactId)!;
        let view = await status._handler(f.ctx, { projectId, branchId });
        expect(view).toMatchObject({ canPublish: false, canSavePublicationVersion: true, publicationEnabled: false, publicationReason: 'not-configured' });
        expect(view.releases.find(row => row.id === publicSource._id)).toMatchObject({ publicationSource: true,
            canPreparePublicationReview: true, canPreparePrivateReview: false, canFinishPublicationPreparing: false });
        expect(view.releases.find(row => row.id === artifactId)).toMatchObject({ publicationSource: false, canPreparePublicationReview: false, canPreparePrivateReview: true });
        publicSource.status = 'captured'; delete publicSource.hash;
        view = await status._handler(f.ctx, { projectId, branchId });
        expect(view.releases.find(row => row.id === publicSource._id)).toMatchObject({ publicationSource: true, canFinishPublicationPreparing: false });
        publicSource.actorId = actorId;
        view = await status._handler(f.ctx, { projectId, branchId });
        expect(view.releases.find(row => row.id === publicSource._id)).toMatchObject({ canFinishPublicationPreparing: true });
        publicSource.publicationIntent = undefined;
        view = await status._handler(f.ctx, { projectId, branchId });
        expect(view.releases.find(row => row.id === publicSource._id)).toMatchObject({ publicationSource: false, canFinishPublicationPreparing: false });
        f.get('cloudEditorGrants:colleague')!.publish = false;
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ canSavePublicationVersion: false });
    })));

    it('uses exact indexed receipts beyond100 later rows while keeping recent20 display and failed receipts distinct', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture(), queued = await f.queueOperation();
        Object.assign(queued.op, { stage: 'confirmed', resultDeploymentId: 'dpl_public' });
        f.destination.lockOperationId = undefined; f.destination.liveReleaseId = 'cloudReleases:newer'; f.destination.liveDeploymentId = 'dpl_newer';
        for (let i = 0; i < 121; i++) f.put('cloudReleaseOperations', `cloudReleaseOperations:later_${i}`, { ...queued.op,
            _id: `cloudReleaseOperations:later_${i}`, operationKey: `later-operation-${i}`, kind: 'build', stage: 'failed',
            resultDeploymentId: undefined, targetDeploymentId: undefined });
        f.queries.length = 0; f.operationReads.length = 0;
        const value = await status._handler(f.ctx, { projectId, branchId });
        expect(value.operations).toHaveLength(20);
        expect(value.operations.some(op => op.id === queued.operationId)).toBe(false);
        expect(value.operations[0]).toMatchObject({ stage: 'failed', sourceHash: f.candidate.hash, targetDeploymentId: null, resultDeploymentId: null });
        expect(value.releases.find(row => row.id === f.candidate.releaseId)).toMatchObject({ canPublish: false, canRollback: true });
        expect(value).toMatchObject({ publicationEnabled: true, publicationReason: null, canSavePublicationVersion: false, liveDeploymentId: 'dpl_newer', liveUrl: null });
        expect(f.operationReads.filter(read => read.index === 'by_branchId')).toEqual([{ index: 'by_branchId', limit: 20 }]);
        expect(f.operationReads.every(read => read.index === 'by_branchId' || read.limit === 1)).toBe(true);
        expect(f.queries).not.toContain('cloudReleaseFiles'); expect(f.queries).not.toContain('cloudReleaseAssets');
        f.queries.length = 0; f.operationReads.length = 0;
        const recoveryArgs = { projectId, branchId, recoveryRequest: { operationId: queued.operationId, operationKey: f.publication.operationKey,
            releaseId: f.candidate.releaseId, kind: 'publish' as const, expectedHash: f.candidate.hash,
            expectedTargetDeploymentId: 'dpl_public', expectedLiveReleaseId: null } };
        const recovered = await status._handler(f.ctx, recoveryArgs);
        expect(recovered.operations).toHaveLength(20);
        expect(recovered.recoveryOperation).toMatchObject({ id: queued.operationId, actorId, stage: 'confirmed',
            sourceHash: f.candidate.hash, targetDeploymentId: 'dpl_public', resultDeploymentId: 'dpl_public' });
        expect(f.operationReads.filter(read => read.index === 'by_branchId')).toEqual([{ index: 'by_branchId', limit: 20 }]);
        expect(f.operationReads.every(read => read.index === 'by_branchId' || read.limit === 1)).toBe(true);
        for (const mismatch of [{ operationId: 'cloudReleaseOperations:absent' as Id<'cloudReleaseOperations'> },
            { expectedHash: 'b'.repeat(64) },
            { expectedTargetDeploymentId: 'dpl_other' }, { kind: 'rollback' as const },
            { expectedLiveReleaseId: artifactId }, { releaseId: artifactId }]) {
            await expect(status._handler(f.ctx, { ...recoveryArgs, recoveryRequest: { ...recoveryArgs.recoveryRequest, ...mismatch } })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        }
        expect(await status._handler(f.ctx, { ...recoveryArgs, recoveryRequest: { ...recoveryArgs.recoveryRequest, operationKey: 'missing-recovery-key-0001' } }))
            .toMatchObject({ recoveryOperation: null, recoveryRemoval: null });
        queued.op.actorId = historicalActorId;
        await expect(status._handler(f.ctx, recoveryArgs)).rejects.toThrow('CLOUD_INVALID_OPERATION'); queued.op.actorId = actorId;
        queued.op.projectId = 'projects:other';
        await expect(status._handler(f.ctx, recoveryArgs)).rejects.toThrow('CLOUD_INVALID_OPERATION'); queued.op.projectId = projectId;
        f.destination.liveReleaseId = f.candidate.releaseId; f.destination.liveDeploymentId = 'dpl_public';
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ liveUrl: 'https://site.vercel.app' });
        queued.op.stage = 'unknown';
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ publicationEnabled: false, publicationReason: 'unknown', liveUrl: null });
    })));

    it('recovers an exact receipt before a removed version and retires only unadmitted intents with a valid scoped tombstone', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture(), queued = await f.queueOperation();
        Object.assign(queued.op, { stage: 'failed', error: 'CLOUD_RELEASE_FAILED' });
        f.destination.lockOperationId = undefined;
        const candidate = f.get(f.candidate.releaseId)!;
        const tombstone = { projectId, branchId, workspaceId, actorId, revision: candidate.revision, status: candidate.status,
            purpose: candidate.purpose, hash: candidate.hash, createdAt: 1, operationKey: candidate.operationKey, removedAt: 10,
            removal: { version: 1, actorId, operationKey: 'remove-candidate-0001', revision: candidate.revision,
                expectedStatus: candidate.status, expectedHash: candidate.hash, requestedAt: 2, phase: 'done', completedAt: 10 } };
        f.put('cloudReleases', f.candidate.releaseId, tombstone);
        const saved = { operationKey: f.publication.operationKey, releaseId: f.candidate.releaseId, kind: 'publish' as const,
            expectedHash: f.candidate.hash, expectedTargetDeploymentId: 'dpl_public', expectedLiveReleaseId: null };
        const read = (recoveryRequest: NonNullable<Parameters<typeof status._handler>[1]['recoveryRequest']>) => status._handler(f.ctx, { projectId, branchId, recoveryRequest });
        expect(await read(saved)).toMatchObject({ recoveryOperation: { id: queued.operationId, stage: 'failed' }, recoveryRemoval: null });
        expect(await read({ ...saved, operationId: queued.operationId })).toMatchObject({ recoveryOperation: { id: queued.operationId }, recoveryRemoval: null });
        const unadmitted = { ...saved, operationKey: 'not-admitted-switch-0001' };
        expect(await read(unadmitted)).toMatchObject({ recoveryOperation: null,
            recoveryRemoval: { state: 'removed', releaseId: f.candidate.releaseId, hash: f.candidate.hash, completedAt: 10 } });
        expect(await read({ ...unadmitted, operationId: 'cloudReleaseOperations:missing' as Id<'cloudReleaseOperations'> })).toMatchObject({ recoveryOperation: null, recoveryRemoval: null });
        expect(await read({ ...unadmitted, releaseId: 'cloudReleases:missing' as Id<'cloudReleases'> })).toMatchObject({ recoveryRemoval: null });
        expect(await read({ ...unadmitted, expectedHash: 'b'.repeat(64) })).toMatchObject({ recoveryRemoval: null });
        for (const change of [{ projectId: 'projects:other' }, { branchId: 'branches:other' }, { workspaceId: 'workspaces:other' }]) {
            f.put('cloudReleases', f.candidate.releaseId, { ...tombstone, ...change });
            expect(await read(unadmitted)).toMatchObject({ recoveryRemoval: null });
        }
        f.put('cloudReleases', f.candidate.releaseId, { ...tombstone, removedAt: undefined,
            removal: { ...tombstone.removal, phase: 'files', completedAt: undefined } });
        expect(await read(unadmitted)).toMatchObject({ recoveryRemoval: null });
        f.put('cloudReleases', f.candidate.releaseId, { ...tombstone, removedAt: 11 });
        await expect(read(unadmitted)).rejects.toThrow('CLOUD_RELEASE_REMOVAL_CHANGED');
        f.put('cloudReleases', f.candidate.releaseId, tombstone);
        f.metrics.bytesRead.used = 11_000_000;
        await expect(read(unadmitted)).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
    })));

    it('admits operation101 without deleting history and replays the exact key without scheduling twice', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture(), first = await f.queueOperation();
        first.op.stage = 'failed'; f.destination.lockOperationId = undefined;
        for (let index = 0; index < 100; index++) f.put('cloudReleaseOperations', `cloudReleaseOperations:old_${index}`, {
            ...first.op, operationKey: `old-publication-${index}`, stage: 'failed' });
        const old = structuredClone([...f.table('cloudReleaseOperations').values()]);
        f.operationReads.length = 0;
        const args = { ...f.publication, operationKey: 'publication-after-lifetime-0001' };
        const admitted = await f.queueOperation(args), writes = f.writes.length;
        expect(f.table('cloudReleaseOperations').size).toBe(102);
        expect(await request._handler(f.ctx, args)).toBe(admitted.operationId);
        expect(f.writes).toHaveLength(writes);
        expect([...f.table('cloudReleaseOperations').values()].slice(0, 101)).toEqual(old);
        expect(f.destination.remainingBuilds).toBe(1);
        expect(f.operationReads.every(read => read.limit === 1 && read.index !== 'by_branchId')).toBe(true);
        await expect(request._handler(f.ctx, { ...args, operationKey: 'another-publication-0001' })).rejects.toThrow('CLOUD_RELEASE_BUSY');
        admitted.op.stage = 'failed'; f.destination.lockOperationId = undefined;
        first.op.stage = 'unknown';
        await expect(request._handler(f.ctx, { ...args, operationKey: 'unknown-old-publication-0001' })).rejects.toThrow('CLOUD_RELEASE_BUSY');
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ publicationReason: 'unknown', liveUrl: null });
        first.op.stage = 'confirmed'; first.op.resultDeploymentId = 'dpl_public';
        f.destination.liveReleaseId = 'cloudReleases:newer'; f.destination.liveDeploymentId = 'dpl_newer';
        const rollback = await f.queueOperation({ ...args, kind: 'rollback', operationKey: 'rollback-after-lifetime-0001',
            expectedLiveReleaseId: 'cloudReleases:newer' as Id<'cloudReleases'> });
        expect(await _beginSend._handler(f.ctx, rollback)).toBe(true);
        expect(f.get(rollback.operationId)).toMatchObject({ stage: 'sending', targetDeploymentId: 'dpl_public' });
        expect(f.destination.remainingBuilds).toBe(1);
    })));

    it('bounds twelve candidate lookups and verifies a live version outside the display independently of total history', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture(), first = await f.queueOperation();
        Object.assign(first.op, { stage: 'confirmed', resultDeploymentId: 'dpl_public' });
        f.destination.lockOperationId = undefined; f.destination.liveReleaseId = f.candidate.releaseId; f.destination.liveDeploymentId = 'dpl_public';
        const baseline = structuredClone(f.release);
        for (let index = 0; index < 12; index++) {
            const id = `cloudReleases:shown_${index}`;
            f.put('cloudReleases', id, baseline);
            f.put('cloudReleaseReviews', `cloudReleaseReviews:shown_${index}`, { releaseId: id, actorId, hash: f.candidate.hash, deploymentId: 'dpl_public' });
        }
        for (let index = 0; index < 130; index++) f.put('cloudReleaseOperations', `cloudReleaseOperations:later_bound_${index}`, {
            ...first.op, operationKey: `later-bound-operation-${index}`, kind: 'build', stage: 'failed', targetDeploymentId: undefined, resultDeploymentId: undefined });
        const before = structuredClone([...f.table('cloudReleaseOperations').values()]);
        f.operationReads.length = 0;
        const view = await status._handler(f.ctx, { projectId, branchId });
        expect(view.releases).toHaveLength(12); expect(view.releases.some(row => row.id === f.candidate.releaseId)).toBe(false);
        expect(view.liveUrl).toBe('https://site.vercel.app'); expect(view.operations).toHaveLength(20);
        expect(f.operationReads).toHaveLength(30); // display + four stage checks + 24 candidate tuples + one live tuple
        expect(f.operationReads.filter(read => read.index === 'by_branchId')).toEqual([{ index: 'by_branchId', limit: 20 }]);
        expect([...f.table('cloudReleaseOperations').values()]).toEqual(before);
        first.op.kind = 'build';
        expect((await status._handler(f.ctx, { projectId, branchId })).liveUrl).toBeNull(); first.op.kind = 'publish';
        for (const changed of [{ projectId: 'projects:other' }, { workspaceId: 'workspaces:other' }, { removedAt: 10 },
            { hash: 'a'.repeat(64) }, { deploymentId: 'dpl_other' }, { importedHosting: {} }]) {
            f.put('cloudReleases', f.candidate.releaseId, { ...baseline, ...changed });
            expect((await status._handler(f.ctx, { projectId, branchId })).liveUrl).toBeNull();
        }
        f.put('cloudReleases', f.candidate.releaseId, baseline);
        first.op.stage = 'queued';
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ publicationReason: 'busy', busy: true, liveUrl: null });
        first.op.stage = 'unknown';
        expect(await status._handler(f.ctx, { projectId, branchId })).toMatchObject({ publicationReason: 'unknown', liveUrl: null });
    })));

    it('reserves history budget and refuses oversized operation metadata instead of projecting unbounded payloads', () => withReleaseEnvironment(() => withPublication(async () => {
        const f = await publicAliasWorkerFixture();
        f.metrics.bytesRead.used = 11_000_000;
        await expect(status._handler(f.ctx, { projectId, branchId })).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
        f.metrics.bytesRead.used = 0;
        const queued = await f.queueOperation(); queued.op.error = 'x'.repeat(16_384);
        await expect(status._handler(f.ctx, { projectId, branchId })).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
    })));
});
