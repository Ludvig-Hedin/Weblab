import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _commit, _input, canonicalPreparationManifest, hashPreparationPolicy } from '../cloudEditorImportPreparation';
import { requireCloudAccess } from '../cloudEditorAccess';
import { assets, _approvalInput, _approve, revoke } from '../cloudEditorContent';
import { _input as studioInput, _commit as studioCommit } from '../cloudEditorStudio';
import { capture } from '../cloudReleases';
import { restoreCopy } from '../cloudBackups';

const projectId = 'projects:one' as Id<'projects'>;
const branchId = 'branches:one' as Id<'branches'>;
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
const actorId = 'users:builder' as Id<'users'>;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const textFile = (path: string, text: string) => ({ path, kind: 'file' as const, text, hash: hash(text), bytes: Buffer.byteLength(text) });
const scope = { projectId, branchId, expectedRevision: 1, operationKey: 'preparation_operation_123' };
const previous = { imports: process.env.WEBLAB_CLOUD_IMPORTS_ENABLED, editor: process.env.WEBLAB_CLOUD_EDITOR_ENABLED };
beforeEach(() => { process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'true'; process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true'; });
afterEach(() => {
    for (const [key, value] of [['WEBLAB_CLOUD_IMPORTS_ENABLED', previous.imports], ['WEBLAB_CLOUD_EDITOR_ENABLED', previous.editor]]) {
        if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
});
type Row = { _id: string; _creationTime: number } & Record<string, unknown>;

// Calls registered handlers and real authorization. This fixture tests serial
// interleavings; transaction rollback and OCC belong to the Convex runtime.
async function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    let subject: string | null = 'builder';
    let sequence = 0;
    let scheduled = 0;
    const table = (name: string) => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name)!;
    };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...value });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    for (const name of ['builder', 'designer', 'content', 'viewer']) {
        put('users', `users:${name}`, { clerkUserId: name });
        put('workspaceMembers', `workspaceMembers:${name}`, { workspaceId, userId: `users:${name}`, role: 'member' });
        put('projectMembers', `projectMembers:${name}`, { projectId, userId: `users:${name}`, role: name === 'viewer' ? 'viewer' : 'editor' });
        if (name !== 'builder' && name !== 'viewer') put('cloudEditorGrants', `cloudEditorGrants:${name}`, { projectId, userId: `users:${name}`, role: name });
    }
    put('workspaces', workspaceId, { createdByUserId: 'users:owner' });
    put('projects', projectId, { workspaceId, accessMode: 'restricted' });
    put('branches', branchId, { projectId });
    const original = [textFile('package.json', '{}'), textFile('bun.lock', '{}'), textFile('next.config.ts', 'export default {};'),
        textFile('tsconfig.json', '{}'), textFile('src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'),
        textFile('src/app/page.tsx', 'export default function Page() { return <p>Hello</p>; }'),
        { path: 'public/movie.mp4', kind: 'file' as const, bytes: 22_700_000, hash: hash('media'), storageId: '_storage:original' as Id<'_storage'> }];
    const manifestHash = await canonicalPreparationManifest(original);
    put('cloudEditorStates', 'cloudEditorStates:one', { projectId, branchId, workspaceId, version: 1, profile: 'imported-source-v1',
        createdByUserId: actorId, revision: 1, bytes: original.reduce((sum, file) => sum + file.bytes, 0), fileCount: original.length, generation: 0 });
    put('cloudEditorImports', 'cloudEditorImports:one', { projectId, branchId, workspaceId, actorId, state: 'finalized', manifestHash,
        files: original.map(file => ({ ...file, kind: 'text' in file ? 'text' : 'binary' })) });
    for (const [index, file] of original.entries()) put('cloudEditorFiles', `cloudEditorFiles:${index}`, { projectId, branchId, ...file });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, issuer: 'issuer', tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => structuredClone(get(id)),
            insert: async (name: string, value: Record<string, unknown>) => { const id = `${name}:new${++sequence}`; put(name, id, value); return id; },
            patch: async (id: string, values: Record<string, unknown>) => Object.assign(get(id)!, values),
            query: (name: string) => {
                const filters: Array<(row: Row) => boolean> = [];
                const index = { eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; } };
                const rows = () => [...table(name).values()].filter(row => filters.every(test => test(row))).map(row => structuredClone(row));
                const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => rows(), take: async (count: number) => rows().slice(0, count),
                    unique: async () => { const result = rows(); if (result.length > 1) throw Error('Not unique'); return result[0] ?? null; } };
                return query;
            },
        },
        scheduler: { runAfter: async () => { scheduled++; } },
    } as unknown as MutationCtx;
    const changed = [textFile('src/app/layout.tsx', 'export default function Layout({children}) { return <html data-oid=".abc:12"><body>{children}</body></html>; }'),
        textFile('public/weblab-preload-script.js', 'globalThis.weblab = true;'), textFile('public/weblab-ix-runtime.js', 'globalThis.weblabIx = true;')];
    const changes = changed.map(file => ({ path: file.path, text: file.text, bytes: file.bytes, hash: file.hash, originalHash: original.find(value => value.path === file.path)?.hash ?? null }));
    const instrumentation = changes.map(file => ({ path: file.path, beforeHash: file.originalHash, afterHash: file.hash,
        addedOids: file.path.endsWith('.tsx') ? ['.abc:12'] : [], bootstrapChanges: true }));
    const output = [...original.filter(file => !changed.some(change => change.path === file.path)), ...changed];
    const policyInput = { kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: output.filter(file => file.path !== 'src/app/page.tsx' && file.path !== 'public/movie.mp4').map(({ path, hash, bytes }) => ({ path, hash, bytes })) };
    const args = { ...scope, actorId, inputManifestHash: manifestHash, policy: { ...policyInput, policyHash: await hashPreparationPolicy(policyInput) }, changes, instrumentation };
    return { ctx, get, put, table, args, original, scheduled: () => scheduled, signIn: (value: string | null) => { subject = value; } };
}

describe('import preparation promotion', () => {
    it('promotes atomically scoped source, retaining pristine source/media and scheduling no runtime', async () => {
        const f = await fixture();
        const baseline = structuredClone(f.get('cloudEditorImports:one'));
        const media = structuredClone(f.get('cloudEditorFiles:6'));
        const input = await _input._handler(f.ctx, scope);
        expect(input.actorId).toBe(actorId);
        const result = await _commit._handler(f.ctx, f.args);
        expect(result).toMatchObject({ revision: 2, profile: 'imported-next-v1' });
        expect(JSON.stringify(result)).not.toMatch(/storageId|text|policy|https:/);
        expect(f.get('cloudEditorStates:one')).toMatchObject({ revision: 2, preparationId: result.preparationId, profile: 'imported-next-v1', fileCount: 9 });
        expect(f.get('cloudEditorImports:one')).toEqual(baseline);
        expect(f.get('cloudEditorFiles:6')).toEqual(media);
        expect(f.scheduled()).toBe(0);
    });
    it('returns the same receipt on retry even after a later source revision, without resetting it', async () => {
        const f = await fixture();
        const result = await _commit._handler(f.ctx, f.args);
        f.get('cloudEditorStates:one')!.revision = 8;
        expect(await _commit._handler(f.ctx, f.args)).toEqual(result);
        expect(await _input._handler(f.ctx, scope)).toEqual({ receipt: result });
        expect(f.get('cloudEditorStates:one')!.revision).toBe(8);
        expect(f.table('cloudEditorImportPreparations').size).toBe(1);
        await expect(_commit._handler(f.ctx, { ...f.args, expectedRevision: 2 })).rejects.toThrow('CLOUD_IMPORT_RETRY_CHANGED');
        await expect(_commit._handler(f.ctx, { ...f.args, inputManifestHash: hash('different') })).rejects.toThrow('CLOUD_IMPORT_RETRY_CHANGED');
    });
    it('allows a current designer but denies content, viewers, signed-out and revoked users', async () => {
        const f = await fixture();
        f.signIn('designer');
        expect((await _input._handler(f.ctx, scope)).actorId).toBe('users:designer');
        for (const actor of ['content', 'viewer', null]) {
            f.signIn(actor);
            await expect(_input._handler(f.ctx, scope)).rejects.toThrow();
        }
        f.signIn('builder');
        await _commit._handler(f.ctx, f.args);
        f.table('projectMembers').delete('projectMembers:builder');
        await expect(_input._handler(f.ctx, scope)).rejects.toThrow();
        await expect(_commit._handler(f.ctx, f.args)).rejects.toThrow();
    });
    it('rejects feature-off, stale revisions, mismatched baseline and changed input hashes before writing', async () => {
        const f = await fixture();
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
        await expect(_input._handler(f.ctx, scope)).rejects.toThrow('CLOUD_DISABLED');
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true';
        await expect(_commit._handler(f.ctx, { ...f.args, expectedRevision: 2 })).rejects.toThrow('CLOUD_REVISION_CONFLICT');
        await expect(_commit._handler(f.ctx, { ...f.args, inputManifestHash: hash('changed') })).rejects.toThrow('CLOUD_IMPORT_BASELINE_CHANGED');
        f.get('cloudEditorImports:one')!.workspaceId = 'workspaces:other';
        await expect(_input._handler(f.ctx, scope)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
        expect(f.get('cloudEditorStates:one')!.profile).toBe('imported-source-v1');
        expect(f.table('cloudEditorImportPreparations').size).toBe(0);
    });
    it('rejects a racing different operation after the first promotion', async () => {
        const f = await fixture();
        await _commit._handler(f.ctx, f.args);
        await expect(_commit._handler(f.ctx, { ...f.args, operationKey: 'second_preparation_123' })).rejects.toThrow('CLOUD_IMPORT_SOURCE_ONLY');
        expect(f.table('cloudEditorImportPreparations').size).toBe(1);
    });
    it('rejects binary overwrite, forged hashes, absent source paths and incorrect old hashes', async () => {
        for (const mode of ['binary', 'hash', 'new-path', 'old-hash']) {
            const f = await fixture();
            const entry = f.args.changes[0]!;
            const record = f.args.instrumentation[0]!;
            if (mode === 'binary') { entry.path = record.path = 'public/movie.mp4'; entry.originalHash = record.beforeHash = hash('media'); }
            if (mode === 'hash') entry.text = 'forged bytes';
            if (mode === 'new-path') { entry.path = record.path = 'src/new.tsx'; entry.originalHash = record.beforeHash = null; }
            if (mode === 'old-hash') entry.originalHash = record.beforeHash = hash('wrong');
            await expect(_commit._handler(f.ctx, f.args)).rejects.toThrow();
            expect(f.table('cloudEditorImportPreparations').size).toBe(0);
            expect(f.get('cloudEditorStates:one')!.revision).toBe(1);
        }
    });
    it('rejects policy drift, omitted runtime pins, pin limits and excess OID inventory', async () => {
        for (const mode of ['hash', 'missing', 'limit', 'oids']) {
            const f = await fixture();
            if (mode === 'hash') f.args.policy.pinnedFiles[0]!.hash = hash('drift');
            if (mode === 'missing') f.args.policy.pinnedFiles = f.args.policy.pinnedFiles.filter(pin => pin.path !== 'bun.lock');
            if (mode === 'limit') f.args.policy.pinnedFiles = Array.from({ length: 33 }, (_, i) => ({ path: `config${i}.ts`, hash: hash('x'), bytes: 1 }));
            if (mode === 'oids') f.args.instrumentation[0]!.addedOids = Array.from({ length: 20_001 }, (_, i) => `oid${i}`);
            if (mode !== 'hash') f.args.policy.policyHash = await hashPreparationPolicy(f.args.policy);
            await expect(_commit._handler(f.ctx, f.args)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
            expect(f.get('cloudEditorStates:one')!.profile).toBe('imported-source-v1');
        }
    });
});


describe('prepared imports refuse legacy starter transports', () => {
    async function prepared() {
        const f = await fixture();
        await _commit._handler(f.ctx, f.args);
        const access = await requireCloudAccess(f.ctx, scope, 'designer');
        // Refusals below must come from transport policy, not invalid provenance
        // or a designer who lacks current project update authority.
        expect(access.canDesign).toBe(true);
        expect(access.state.profile).toBe('imported-next-v1');
        return f;
    }
    function writes(f: Awaited<ReturnType<typeof fixture>>) {
        return JSON.stringify(['cloudEditorStates', 'cloudEditorFiles', 'cloudEditorContentContracts',
            'cloudEditorStudioContracts', 'cloudEditorJournalItems', 'cloudEditorOperations',
            'cloudReleases', 'cloudReleaseFiles', 'cloudReleaseAssets', 'cloudBackupRestores',
            'projects', 'branches'].map(name => [name, [...f.table(name).values()]]));
    }
    it('refuses direct design admission and preview when the preparation epoch is absent or invalid', async () => {
        for (const revision of [undefined, 0, 1, 3, NaN]) {
            const f = await prepared();
            const state = f.get('cloudEditorStates:one')!;
            state.designRevision = revision;
            const before = writes(f);
            const access = await requireCloudAccess(f.ctx, scope);
            expect(access.canDesign).toBe(false);
            expect(access.canPreview).toBe(false);
            await expect(requireCloudAccess(f.ctx, scope, 'designer')).rejects.toThrow('CLOUD_ROLE_REQUIRED');
            expect(writes(f)).toBe(before);
            expect(f.scheduled()).toBe(0);
        }
    });
    it('refuses legacy content assets, approval input/commit and revoke before writing', async () => {
        const f = await prepared();
        const before = writes(f);
        const target = { projectId, branchId, path: 'src/app/page.tsx', expectedRevision: 2, expectedGeneration: 0 };
        await expect(assets._handler(f.ctx, { projectId, branchId })).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        await expect(_approvalInput._handler(f.ctx, target)).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        await expect(_approve._handler(f.ctx, { ...target, actorId, bindings: [{ oid: 'home', fields: ['text'] }],
            fingerprint: hash('approval') })).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        await expect(revoke._handler(f.ctx, { projectId, branchId, path: target.path, expectedGeneration: 1 }))
            .rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        expect(writes(f)).toBe(before);
        expect(f.scheduled()).toBe(0);
    });
    it('refuses legacy Studio install input and commit before files or contracts change', async () => {
        const f = await prepared();
        const before = writes(f);
        const envelope = { projectId, branchId, actorId, expectedRevision: 2, expectedGeneration: 0,
            operationId: 'legacy_studio_install_123', fingerprint: hash('install'), operation: { kind: 'install' as const } };
        await expect(studioInput._handler(f.ctx, envelope)).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        await expect(studioCommit._handler(f.ctx, { ...envelope,
            settings: { profile: 'cloud-studio-v1', generation: 1, active: true, allowPages: true,
                allowedBlocks: ['text-v1'], slots: [] }, changes: [], contracts: [] }))
            .rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        expect(writes(f)).toBe(before);
        expect(f.scheduled()).toBe(0);
    });
    it('refuses legacy backup capture and retained same-enrollment restore before creating a starter copy', async () => {
        const f = await prepared();
        const beforeCapture = writes(f);
        await expect(capture._handler(f.ctx, { projectId, branchId, expectedRevision: 2,
            operationKey: 'legacy_import_backup_123', purpose: 'backup' })).rejects.toThrow('CLOUD_RELEASE_PROFILE_UNSUPPORTED');
        expect(writes(f)).toBe(beforeCapture);
        // Simulate a retained frozen backup from an earlier deployment while
        // the original imported enrollment still exists. Its legacy row has no
        // imported policy, so restoring it must never create profile-less state.
        const backupId = 'cloudReleases:retained' as Id<'cloudReleases'>;
        f.put('cloudReleases', backupId, { projectId, branchId, workspaceId, actorId, purpose: 'backup',
            status: 'frozen', hash: hash('backup'), sourceHash: hash('source'), studioInputJson: 'null' });
        const beforeRestore = writes(f);
        await expect(restoreCopy._handler(f.ctx, { backupId, operationKey: 'legacy_import_restore_123', name: 'Recovered copy' }))
            .rejects.toThrow('CLOUD_RELEASE_PROFILE_UNSUPPORTED');
        expect(writes(f)).toBe(beforeRestore);
        expect(f.scheduled()).toBe(0);
    });
});
