import { describe, expect, it } from 'bun:test';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _metadata, _recordProof, _register, _registrationInput, _revoke, activeReleaseCredential } from '../cloudReleaseCredentials';
import { destinationKey } from './cloudReleasePolicy';
import { planNextProjectPreparation } from '@weblab/parser/src/project-preparation';
import { WEBLAB_DEV_IX_RUNTIME_PATH, WEBLAB_DEV_PRELOAD_SCRIPT_PATH } from '@weblab/constants';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import { prepareImportedNextConfig, prepareImportedNextDeclarations } from './cloudImportedNextConfig';
import { validateImportedNextProfile } from './cloudImportedNextProfile';
import { importedInventoryHash, type ImportedSnapshotFile } from './cloudImportedRelease';
import { prepareImportedReleaseArtifact } from './cloudImportedReleaseArtifact';
import { prepareImportedHostingCandidate } from './cloudImportedHosting';
import { sha256 } from './cloudReleaseArtifact';

type Row = Record<string, unknown> & { _id: string };
type RegisterArgs = Parameters<typeof _register._handler>[1];
const ciphertextHash = 'a'.repeat(64);
const providerProof = 'b'.repeat(64);

async function withAccounts(work: () => Promise<void>) {
    const previous = process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
    process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = 'team_test,team_second';
    try { await work(); } finally {
        if (previous === undefined) delete process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
        else process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = previous;
    }
}

// Real handlers with simulated persistence. Does not prove deployed transaction
// concurrency or provider verification, encryption, or credential acceptance.
function fixture() {
    const tables = new Map<string, Row[]>();
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = [];
    const reads: Array<{ index: string; limit: number }> = [];
    let sequence = 0;
    const rows = (table: string) => tables.get(table) ?? [];
    const seed = (table: string, values: Record<string, unknown>) => {
        const row = { ...values, _id: String(values._id ?? `${table}-${++sequence}`) };
        tables.set(table, [...rows(table), row]);
        return row;
    };
    const get = (id: string) => [...tables.values()].flat().find(row => row._id === id);
    const metric = () => ({ used: 0, remaining: 16_777_216 });
    const ctx = { meta: { getTransactionMetrics: async () => ({ bytesRead: metric(), bytesWritten: metric(),
        documentsRead: metric(), documentsWritten: metric(), databaseQueries: metric() }) }, db: {
        get: async (id: string) => structuredClone(get(id) ?? null),
        system: { get: async (id: string) => structuredClone(get(id) ?? null) },
        patch: async (id: string, value: Record<string, unknown>) => {
            writes.push({ kind: 'patch', value: structuredClone(value) }); Object.assign(get(id)!, value);
        },
        insert: async (table: string, value: Record<string, unknown>) => {
            writes.push({ kind: 'insert', value: structuredClone(value) }); return seed(table, value)._id;
        },
        query: (table: string) => {
            let indexName = '';
            const constraints: Array<[string, unknown]> = [];
            const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
            const query = {
                withIndex: (name: string, build: (q: typeof index) => unknown) => { indexName = name; build(index); return query; },
                take: async (limit: number) => {
                    reads.push({ index: indexName, limit });
                    return structuredClone(rows(table).filter(row => constraints.every(([key, value]) => row[key] === value)).slice(0, limit));
                },
            };
            return query;
        },
    } } as unknown as MutationCtx;
    seed('workspaces', { _id: 'workspace' });
    seed('projects', { _id: 'project', workspaceId: 'workspace' });
    seed('branches', { _id: 'branch', projectId: 'project' });
    const destination = seed('cloudReleaseDestinations', {
        _id: 'destination', projectId: 'project', branchId: 'branch', teamId: 'team_test',
        providerProjectId: 'prj_test', hostname: 'site.vercel.app',
        key: destinationKey('team_test', 'prj_test', 'site.vercel.app'),
        generation: 1, approvedUntil: Date.now() + 60_000, remainingBuilds: 2,
        reviewGatewayVerified: true, publicAliasVerified: true, drifted: false,
        liveReleaseId: 'live-release', liveDeploymentId: 'live-deployment',
    });
    const args: RegisterArgs = {
        destinationId: 'destination' as Id<'cloudReleaseDestinations'>, expectedGeneration: 1,
        expectedLiveDeploymentId: 'live-deployment', expectedWorkspaceId: 'workspace' as Id<'workspaces'>, ciphertext: 'encrypted-envelope', ciphertextHash, providerProof,
        expiresAt: Date.now() + 3_600_000,
    };
    const register = (overrides: Partial<RegisterArgs> = {}) => _register._handler(ctx, { ...args, ...overrides });
    const input = (expectedGeneration = Number(destination.generation)) => _registrationInput._handler(ctx, {
        destinationId: args.destinationId, expectedGeneration,
    });
    const active = () => activeReleaseCredential(ctx, destination as Doc<'cloudReleaseDestinations'>);
    const proof = (overrides: Partial<Parameters<typeof _recordProof._handler>[1]> = {}) => _recordProof._handler(ctx, {
        destinationId: args.destinationId, expectedGeneration: Number(destination.generation), providerProof,
        reviewGatewayVerified: true, publicAliasVerified: true, ...overrides,
    });
    const rejectsUnchanged = async (work: () => Promise<unknown>, code: string) => {
        writes.length = 0;
        const before = structuredClone(tables);
        await expect(work()).rejects.toThrow(code);
        expect(writes).toEqual([]);
        expect(tables).toEqual(before);
    };
    return { ctx, tables, writes, reads, rows, seed, destination, args, register, input, active, proof, rejectsUnchanged };
}

describe('destination credential registration', () => {
    const hostingProfile = 'imported-next-hosting-v1' as const;
    it('registers imported profile2 with matching credential pins and reports its actual profile', () => withAccounts(async () => {
        const f = fixture(); f.destination.hostingProfile = hostingProfile;
        const result = await f.register({ expectedHostingProfile: hostingProfile });
        expect(f.destination).toMatchObject({ hostingProfile, registrationVersion: 2, generation: 2,
            remainingBuilds: 2, reviewGatewayVerified: false, publicAliasVerified: false });
        expect(await f.active()).toMatchObject({ _id: result.credentialId, hostingProfile, version: 1 });
        expect(await _metadata._handler(f.ctx, { destinationId: f.args.destinationId })).toMatchObject({ profile: hostingProfile, registrationVersion: 2 });
        await f.rejectsUnchanged(() => f.proof(), 'CLOUD_RELEASE_INVALID_REGISTRATION');
        await f.proof({ publicAliasVerified: false });
        expect(f.destination).toMatchObject({ reviewGatewayVerified: true, publicAliasVerified: false });
    }));
    it('compares the exact imported profile again after registration reads and before writes', () => withAccounts(async () => {
        for (const changedToImported of [true, false]) {
            const f = fixture();
            if (!changedToImported) f.destination.hostingProfile = hostingProfile;
            await f.input();
            f.destination.hostingProfile = changedToImported ? hostingProfile : undefined;
            await f.rejectsUnchanged(() => f.register({ ...(changedToImported ? {} : { expectedHostingProfile: hostingProfile }) }), 'CLOUD_RELEASE_STALE_REGISTRATION');
        }
    }));
    it('refuses mixed profile and registration versions or copied credential profiles', () => withAccounts(async () => {
        for (const patch of [
            { destination: { registrationVersion: 1 } }, { destination: { hostingProfile: undefined } },
            { credential: { hostingProfile: undefined } }, { destination: { hostingProfile: 'unknown-profile' } },
        ]) {
            const f = fixture(); f.destination.hostingProfile = hostingProfile;
            await f.register({ expectedHostingProfile: hostingProfile });
            Object.assign(f.destination, patch.destination); Object.assign(f.rows('cloudReleaseCredentials')[0]!, patch.credential);
            expect(await f.active()).toBeNull();
            await f.rejectsUnchanged(() => f.input(), 'CLOUD_RELEASE_INVALID_REGISTRATION');
        }
        const legacy = fixture(); await legacy.register();
        legacy.rows('cloudReleaseCredentials')[0]!.hostingProfile = hostingProfile;
        expect(await legacy.active()).toBeNull();
    }));
    it('rotates imported credentials without refilling allowance and keeps revocation available', () => withAccounts(async () => {
        const f = fixture(); f.destination.hostingProfile = hostingProfile;
        const first = await f.register({ expectedHostingProfile: hostingProfile });
        f.destination.remainingBuilds = 0;
        const second = await f.register({ expectedHostingProfile: hostingProfile, expectedGeneration: 2, ciphertextHash: 'c'.repeat(64) });
        expect(f.rows('cloudReleaseCredentials').find(row => row._id === first.credentialId)?.revokedAt).toBeNumber();
        expect(await f.active()).toMatchObject({ _id: second.credentialId, hostingProfile, version: 2 });
        Object.assign(f.destination, { lockOperationId: 'unknown', drifted: true }); delete process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
        await _revoke._handler(f.ctx, { destinationId: f.args.destinationId, expectedGeneration: 3 });
        expect(f.destination).toMatchObject({ registrationVersion: 2, generation: 4, remainingBuilds: 0, lockOperationId: 'unknown',
            liveDeploymentId: 'live-deployment', reviewGatewayVerified: false, publicAliasVerified: false });
        expect(f.rows('cloudReleaseCredentials').find(row => row._id === second.credentialId)?.revokedAt).toBeNumber();
    }));
    it('refuses an unregistered project moved to another workspace after the verification read', () => withAccounts(async () => {
        const f = fixture();
        expect((await f.input()).workspaceId).toBe('workspace');
        f.seed('workspaces', { _id: 'workspace-two' });
        f.rows('projects')[0]!.workspaceId = 'workspace-two';
        await f.rejectsUnchanged(() => f.register(), 'CLOUD_RELEASE_STALE_REGISTRATION');
    }));

    it('pins the exact project/workspace/account and preserves live state and allowance', () => withAccounts(async () => {
        const f = fixture();
        const before = { ...f.destination };
        expect(await f.input()).toMatchObject({ destination: { generation: 1 }, workspaceId: 'workspace' });
        const result = await f.register();
        expect(result).toMatchObject({ generation: 2, credentialVersion: 1 });
        expect(f.destination).toMatchObject({ registrationVersion: 1, workspaceId: 'workspace', credentialId: result.credentialId,
            credentialVersion: 1, credentialHash: ciphertextHash, providerProof,
            reviewGatewayVerified: false, publicAliasVerified: false });
        for (const key of ['remainingBuilds', 'approvedUntil', 'liveDeploymentId', 'liveReleaseId', 'drifted']) expect(f.destination[key]).toEqual(before[key]);
        expect(await f.active()).toMatchObject({ destinationId: 'destination', workspaceId: 'workspace', projectId: 'project', branchId: 'branch', version: 1 });
        expect(f.reads).toContainEqual({ index: 'by_teamId_and_providerProjectId', limit: 2 });
        expect(f.reads).toContainEqual({ index: 'by_hostname', limit: 2 });
    }));

    it('rejects a stale finalize after another registration, generation change or live-target change', () => withAccounts(async () => {
        const f = fixture();
        await f.input();
        await f.register();
        await f.rejectsUnchanged(() => f.register(), 'CLOUD_RELEASE_STALE_REGISTRATION');
        f.destination.generation = 3;
        await f.rejectsUnchanged(() => f.register({ expectedGeneration: 2 }), 'CLOUD_RELEASE_STALE_REGISTRATION');
        await f.rejectsUnchanged(() => f.register({ expectedGeneration: 3, expectedLiveDeploymentId: 'different-live' }), 'CLOUD_RELEASE_STALE_REGISTRATION');
    }));

    it('fails closed on malformed or missing account allowlists without global account fallback', () => withAccounts(async () => {
        for (const accounts of [undefined, '', 'team_other', 'team_test,invalid', 'team_test,', Array(9).fill('team_test').join(',')]) {
            if (accounts === undefined) delete process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
            else process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = accounts;
            const f = fixture();
            await f.rejectsUnchanged(() => f.register(), 'CLOUD_RELEASE_INVALID_REGISTRATION');
            expect(await f.active()).toBeNull();
        }
    }));

    it('requires real project, branch and workspace identity and refuses workspace rebinding', () => withAccounts(async () => {
        for (const change of ['project-missing', 'branch-missing', 'workspace-missing', 'branch-owner', 'workspace-rebind']) {
            const f = fixture();
            if (change === 'project-missing') f.tables.delete('projects');
            if (change === 'branch-missing') f.tables.delete('branches');
            if (change === 'workspace-missing') f.tables.delete('workspaces');
            if (change === 'branch-owner') f.rows('branches')[0]!.projectId = 'other-project';
            if (change === 'workspace-rebind') f.destination.workspaceId = 'other-workspace';
            await f.rejectsUnchanged(() => f.register(), 'CLOUD_RELEASE_INVALID_REGISTRATION');
        }
    }));

    it('refuses both reservation collisions including a matching first indexed row and stale locked second row', () => withAccounts(async () => {
        for (const collision of ['provider', 'hostname']) {
            const f = fixture();
            f.seed('cloudReleaseDestinations', { ...f.destination, _id: 'other-destination', branchId: 'other-branch',
                approvedUntil: 1, lockOperationId: 'unknown-operation',
                ...(collision === 'provider' ? { hostname: 'other.vercel.app' } : { providerProjectId: 'prj_other' }),
            });
            await f.rejectsUnchanged(() => f.register(), 'CLOUD_RELEASE_INVALID_REGISTRATION');
        }
    }));

    it('does not finalize when a lock or drift appears after the read-only registration input', () => withAccounts(async () => {
        for (const patch of [{ lockOperationId: 'unknown-operation' }, { drifted: true }]) {
            const f = fixture();
            await f.input();
            Object.assign(f.destination, patch);
            await f.rejectsUnchanged(() => f.register(), 'CLOUD_RELEASE_BUSY');
        }
    }));

    it('rejects invalid generations, hashes, ciphertext and credential lifetimes before writes', () => withAccounts(async () => {
        for (const expectedGeneration of [NaN, Infinity, 0, -1, 1.5]) {
            const f = fixture();
            await f.rejectsUnchanged(() => f.register({ expectedGeneration }), 'CLOUD_RELEASE_STALE_REGISTRATION');
        }
        for (const patch of [
            { ciphertextHash: 'bad' }, { providerProof: 'B'.repeat(64) }, { ciphertext: '' }, { ciphertext: 'x'.repeat(32_769) },
            { expiresAt: NaN }, { expiresAt: Infinity }, { expiresAt: 1.5 }, { expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 91 * 86400_000 },
        ]) {
            const f = fixture();
            await f.rejectsUnchanged(() => f.register(patch), 'CLOUD_RELEASE_INVALID_CREDENTIAL');
        }
    }));

    it('rotates immutable credential versions, revokes the old row and resets proof without refilling allowance', () => withAccounts(async () => {
        const f = fixture();
        const first = await f.register();
        await f.proof();
        f.destination.remainingBuilds = 0;
        const deadline = f.destination.approvedUntil;
        const second = await f.register({ expectedGeneration: 2, ciphertext: 'rotated-envelope', ciphertextHash: 'c'.repeat(64), providerProof: 'd'.repeat(64) });
        expect(second).toMatchObject({ generation: 3, credentialVersion: 2 });
        const oldRow = f.rows('cloudReleaseCredentials').find(row => row._id === first.credentialId)!;
        expect(oldRow.revokedAt).toBeNumber();
        expect(oldRow.ciphertext).toBe('encrypted-envelope');
        expect(oldRow.ciphertextHash).toBe(ciphertextHash);
        expect(f.destination).toMatchObject({ remainingBuilds: 0, approvedUntil: deadline, liveDeploymentId: 'live-deployment',
            reviewGatewayVerified: false, publicAliasVerified: false });
        expect((await f.active())?._id).toBe(second.credentialId);
    }));

    it('denies copied credentials, incomplete or mismatched pins, expired rows and revoked rows', () => withAccounts(async () => {
        const patches: Array<{ destination?: Record<string, unknown>; credential?: Record<string, unknown> }> = [
            { destination: { registrationVersion: undefined } }, { destination: { credentialId: undefined } },
            { destination: { credentialVersion: 2 } }, { destination: { credentialHash: 'c'.repeat(64) } },
            { destination: { providerProof: 'c'.repeat(64) } }, { destination: { workspaceId: 'other-workspace' } },
            { credential: { destinationId: 'copied-destination' } }, { credential: { workspaceId: 'other-workspace' } },
            { credential: { projectId: 'other-project' } }, { credential: { branchId: 'other-branch' } },
            { credential: { teamId: 'team_second' } }, { credential: { providerProjectId: 'prj_other' } },
            { credential: { hostname: 'other.vercel.app' } }, { credential: { version: 2 } },
            { credential: { ciphertextHash: 'c'.repeat(64) } }, { credential: { providerProof: 'c'.repeat(64) } },
            { credential: { expiresAt: 1 } }, { credential: { expiresAt: NaN } }, { credential: { revokedAt: 0 } },
        ];
        for (const patch of patches) {
            const f = fixture();
            await f.register();
            Object.assign(f.destination, patch.destination);
            Object.assign(f.rows('cloudReleaseCredentials')[0]!, patch.credential);
            expect(await f.active()).toBeNull();
        }
    }));

    it('permits replacing expired or revoked credentials only while their identity pins still match', () => withAccounts(async () => {
        for (const inactive of [{ expiresAt: 1 }, { revokedAt: 1 }]) {
            const f = fixture();
            await f.register();
            Object.assign(f.rows('cloudReleaseCredentials')[0]!, inactive);
            expect(await f.active()).toBeNull();
            expect(await f.register({ expectedGeneration: 2 })).toMatchObject({ generation: 3, credentialVersion: 2 });
            expect(await f.active()).not.toBeNull();
        }
        const f = fixture();
        await f.register();
        f.rows('cloudReleaseCredentials')[0]!.destinationId = 'copied-destination';
        await f.rejectsUnchanged(() => f.register({ expectedGeneration: 2 }), 'CLOUD_RELEASE_INVALID_REGISTRATION');
    }));

    it('rechecks current allowlist and both destination reservations when reading active credentials', () => withAccounts(async () => {
        const f = fixture();
        await f.register();
        process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = 'team_other';
        expect(await f.active()).toBeNull();
        process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = 'team_test';
        f.seed('cloudReleaseDestinations', { ...f.destination, _id: 'collision', hostname: 'other.vercel.app' });
        expect(await f.active()).toBeNull();
    }));

    it('allows revocation with an unknown locked operation and removed allowlist while preserving live and budget', () => withAccounts(async () => {
        const f = fixture();
        await f.register();
        await f.proof();
        Object.assign(f.destination, { lockOperationId: 'unknown-operation', drifted: true, remainingBuilds: 0 });
        const before = { ...f.destination };
        delete process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
        await _revoke._handler(f.ctx, { destinationId: f.args.destinationId, expectedGeneration: 2 });
        expect(f.destination).toMatchObject({ generation: 3, lockOperationId: 'unknown-operation', drifted: true,
            remainingBuilds: 0, approvedUntil: before.approvedUntil, liveDeploymentId: 'live-deployment', liveReleaseId: 'live-release',
            reviewGatewayVerified: false, publicAliasVerified: false });
        expect(f.rows('cloudReleaseCredentials')[0]?.revokedAt).toBeNumber();
        await f.rejectsUnchanged(() => _revoke._handler(f.ctx, { destinationId: f.args.destinationId, expectedGeneration: 2 }), 'CLOUD_RELEASE_STALE_REGISTRATION');
    }));

    it('records explicit proof only for the active exact generation and matching provider proof', () => withAccounts(async () => {
        const f = fixture();
        await f.register();
        await f.rejectsUnchanged(() => f.proof({ expectedGeneration: 1 }), 'CLOUD_RELEASE_STALE_REGISTRATION');
        await f.rejectsUnchanged(() => f.proof({ providerProof: 'c'.repeat(64) }), 'CLOUD_RELEASE_INVALID_REGISTRATION');
        const budget = { remainingBuilds: f.destination.remainingBuilds, approvedUntil: f.destination.approvedUntil };
        await f.proof();
        expect(f.destination).toMatchObject({ ...budget, generation: 2, reviewGatewayVerified: true, publicAliasVerified: true });
        for (const patch of [{ lockOperationId: 'unknown-operation' }, { lockOperationId: undefined, drifted: true }]) {
            Object.assign(f.destination, patch);
            await f.rejectsUnchanged(() => f.proof(), 'CLOUD_RELEASE_BUSY');
        }
        Object.assign(f.destination, { lockOperationId: undefined, drifted: false });
        f.rows('cloudReleaseCredentials')[0]!.expiresAt = 1;
        await f.rejectsUnchanged(() => f.proof(), 'CLOUD_RELEASE_INVALID_REGISTRATION');
    }));

    it('returns non-secret metadata for lost acknowledgements and never ciphertext', () => withAccounts(async () => {
        const f = fixture();
        const result = await f.register();
        const metadata = await _metadata._handler(f.ctx, { destinationId: f.args.destinationId });
        expect(metadata).toMatchObject({ profile: 'cloud-studio-v1', generation: result.generation,
            credentialId: result.credentialId, credentialVersion: result.credentialVersion, credentialHash: ciphertextHash, providerProof });
        expect(metadata).not.toHaveProperty('ciphertext');
        expect(JSON.stringify(metadata)).not.toContain('encrypted-envelope');
        expect(f.writes).toHaveLength(2);
    }));
});

const text = (path: string, value: string): ImportedSnapshotFile => ({ path, kind: 'file', text: value, bytes: Buffer.byteLength(value), hash: sha256(value) });
async function proofRetainedFixture() {
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

async function publicProofFixture(visibility: 'publishable' | 'protected-only' = 'publishable') {
    const f = fixture(), retained = await proofRetainedFixture();
    f.destination.hostingProfile = 'imported-next-hosting-v1';
    await f.register({ expectedHostingProfile: 'imported-next-hosting-v1' });
    const publicTarget = visibility === 'publishable';
    const artifact = publicTarget ? await prepareImportedReleaseArtifact({ ...retained, purpose: 'release', publicationIntent: 'eligible-public-version' }) : retained.privateArtifact;
    const parent = f.seed('cloudReleases', { _id: 'artifact', projectId: 'project', branchId: 'branch', workspaceId: 'workspace', actorId: 'creator',
        purpose: publicTarget ? 'release' : 'private-artifact', artifactProfile: publicTarget ? 'imported-next-public-v1' : 'imported-next-private-v1',
        ...(publicTarget ? { publicationIntent: 'eligible-public-version' } : {}), status: 'frozen',
        revision: 2, imported: retained.metadata, hash: artifact.hash, sourceHash: artifact.sourceHash, artifactJson: artifact.artifactJson });
    const prepared = await prepareImportedHostingCandidate({ ...retained, actorId: 'colleague', visibility,
        artifact: { id: 'artifact', projectId: 'project', branchId: 'branch', workspaceId: 'workspace', revision: 2,
            purpose: publicTarget ? 'release' : 'private-artifact', hash: artifact.hash, artifactJson: artifact.artifactJson } });
    const target = f.seed('cloudReleases', { _id: 'candidate', projectId: 'project', branchId: 'branch', workspaceId: 'workspace', actorId: 'colleague',
        purpose: 'release', status: 'ready', revision: 2, sourceHash: prepared.sourceHash, hash: prepared.hash, artifactJson: prepared.artifactJson,
        importedHosting: prepared.importedHosting, importedHostingBuildPolicyJson: prepared.buildPolicyJson, operationKey: 'public-candidate-0001',
        importedHostingRequest: { version: 1, artifactId: 'artifact', expectedArtifactHash: artifact.hash, visibility, expectedLiveReleaseId: null },
        studioInputJson: '', previousArtifactJson: '', deploymentId: 'dpl_target', builtDestinationKey: f.destination.key });
    for (const releaseId of ['artifact', 'candidate']) for (const file of prepared.files) f.seed('cloudReleaseFiles', { ...file, releaseId, stage: 'deploy' });
    f.seed('_storage', { _id: '_storage:media', size: Buffer.byteLength(retained.media), sha256: sha256(retained.media) });
    const proof = { releaseId: target._id as Id<'cloudReleases'>, hash: prepared.hash, deploymentId: 'dpl_target',
        deployHash: prepared.importedHosting.deployHash, buildPolicyHash: prepared.importedHosting.buildPolicyHash,
        expectedLiveReleaseId: 'live-release' as Id<'cloudReleases'>, expectedLiveDeploymentId: 'live-deployment' };
    return { ...f, target, parent, proofTuple: proof, record: () => f.proof({ importedAliasProof: proof }) };
}

describe('candidate-bound imported alias operator proof', () => {
    it('refuses a completely valid protected candidate and private parent pair', () => withAccounts(async () => {
        const f = await publicProofFixture('protected-only');
        await f.rejectsUnchanged(() => f.record(), 'CLOUD_RELEASE_INVALID_REGISTRATION');
    }));
    it('accepts a genuine ready public candidate without changing live state or allowance', () => withAccounts(async () => {
        const f = await publicProofFixture(), before = { ...f.destination };
        await f.record();
        expect(f.destination).toMatchObject({ reviewGatewayVerified: true, publicAliasVerified: true });
        for (const key of ['liveReleaseId', 'liveDeploymentId', 'remainingBuilds', 'generation']) expect(f.destination[key]).toEqual(before[key]);
        expect(f.reads.filter(read => read.index === 'by_releaseId_and_stage')).toHaveLength(2);
    }));
    it('rejects a tuple on starter and private-only proof calls', () => withAccounts(async () => {
        const f = await publicProofFixture();
        await f.rejectsUnchanged(() => f.proof({ publicAliasVerified: false, importedAliasProof: f.proofTuple }), 'CLOUD_RELEASE_INVALID_REGISTRATION');
        await f.rejectsUnchanged(() => f.proof({ reviewGatewayVerified: false, importedAliasProof: f.proofTuple }), 'CLOUD_RELEASE_INVALID_REGISTRATION');
        const starter = fixture(); await starter.register();
        await starter.rejectsUnchanged(() => starter.proof({ importedAliasProof: f.proofTuple }), 'CLOUD_RELEASE_INVALID_REGISTRATION');
    }));
    for (const change of ['generation', 'providerProof', 'credential', 'live-release', 'live-deployment', 'deployment', 'hash', 'deploy-hash', 'policy-hash',
        'scope', 'workspace', 'built-destination', 'not-ready', 'partial', 'private-parent', 'parent-scope', 'removing', 'parent-removing', 'missing-blob']) {
        it(`refuses changed ${change} before patching proof flags`, () => withAccounts(async () => {
            const f = await publicProofFixture();
            if (change === 'generation') f.destination.generation = 0;
            if (change === 'providerProof') f.destination.providerProof = 'c'.repeat(64);
            if (change === 'credential') f.rows('cloudReleaseCredentials')[0]!.revokedAt = 1;
            if (change === 'live-release') f.destination.liveReleaseId = 'changed';
            if (change === 'live-deployment') f.destination.liveDeploymentId = 'changed';
            if (change === 'deployment') f.target.deploymentId = 'changed';
            if (change === 'hash') f.proofTuple.hash = 'c'.repeat(64);
            if (change === 'deploy-hash') f.proofTuple.deployHash = 'c'.repeat(64);
            if (change === 'policy-hash') f.proofTuple.buildPolicyHash = 'c'.repeat(64);
            if (change === 'scope') f.target.branchId = 'changed';
            if (change === 'workspace') f.target.workspaceId = 'changed';
            if (change === 'built-destination') f.target.builtDestinationKey = 'changed';
            if (change === 'not-ready') f.target.status = 'building';
            if (change === 'partial') delete f.target.importedHostingBuildPolicyJson;
            if (change === 'private-parent') Object.assign(f.parent, { purpose: 'private-artifact', artifactProfile: 'imported-next-private-v1', publicationIntent: undefined });
            if (change === 'parent-scope') f.parent.projectId = 'changed';
            if (change === 'removing') f.target.removedAt = 1;
            if (change === 'parent-removing') f.parent.removedAt = 1;
            if (change === 'missing-blob') f.tables.delete('_storage');
            f.writes.length = 0; const before = structuredClone(f.tables);
            await expect(f.record()).rejects.toThrow();
            expect(f.writes).toEqual([]); expect(f.tables).toEqual(before);
        }));
    }
    it('credential rotation clears the attested flags', () => withAccounts(async () => {
        const f = await publicProofFixture(); await f.record();
        await f.register({ expectedHostingProfile: 'imported-next-hosting-v1', expectedGeneration: 2 });
        expect(f.destination).toMatchObject({ publicAliasVerified: false, reviewGatewayVerified: false, generation: 3 });
    }));
});
