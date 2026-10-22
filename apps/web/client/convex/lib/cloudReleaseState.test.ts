import { describe, expect, it } from 'bun:test';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { _result, _settle, _workerInput, _beginSend, request, status } from '../cloudReleases';
import { destinationKey } from './cloudReleasePolicy';

// Real state handlers, simulated persistence only. Does not claim Convex transaction concurrency proof.
function fixture(stage = 'sending', worker = 'inProgress') {
    const rows = new Map<string, Record<string, unknown>>([
        ['op', { _id: 'op', nonce: 'nonce', stage, kind: 'publish', destinationId: 'destination', releaseId: 'release', schedulerId: 'job', resultDeploymentId: 'new' }],
        ['destination', { _id: 'destination', lockOperationId: 'op', liveDeploymentId: 'old', liveReleaseId: 'oldRelease' }],
        ['release', { _id: 'release', status: 'ready' }],
    ]);
    const scheduled: unknown[] = [];
    const ctx = { db: {
        get: async (id: string) => structuredClone(rows.get(id) ?? null),
        patch: async (id: string, value: Record<string, unknown>) => { rows.set(id, { ...rows.get(id), ...value }); },
        system: { get: async () => ({ state: { kind: worker } }) },
    }, scheduler: { runAfter: async (...args: unknown[]) => { scheduled.push(args); } } } as unknown as MutationCtx;
    return { ctx, rows, scheduled, operationId: 'op' as Id<'cloudReleaseOperations'> };
}
describe('release destination lock lifecycle', () => {
    it('does not settle, unlock or resurrect a release after any removal marker appears', async () => {
        for (const marker of [{ removal: {} }, { removedAt: 123 }]) {
            const f = fixture('confirmed', 'success'); Object.assign(f.rows.get('release')!, marker);
            const before = structuredClone([...f.rows]);
            await _result._handler(f.ctx, { operationId: f.operationId, nonce: 'nonce', outcome: 'confirmed', deploymentId: 'late' });
            await _settle._handler(f.ctx, { operationId: f.operationId });
            expect([...f.rows]).toEqual(before); expect(f.scheduled).toEqual([]);
        }
    });

    it('retains both prior live and lock until confirmed worker is terminal', async () => {
        const f = fixture('confirmed');
        await _settle._handler(f.ctx, { operationId: f.operationId });
        expect(f.rows.get('destination')?.liveDeploymentId).toBe('old');
        expect(f.rows.get('destination')?.lockOperationId).toBe('op');
        expect(f.scheduled.length).toBe(1);
    });
    it('commits live target only after terminal original worker', async () => {
        const f = fixture('confirmed', 'success');
        await _settle._handler(f.ctx, { operationId: f.operationId });
        expect(f.rows.get('destination')?.liveDeploymentId).toBe('new');
        expect(f.rows.get('destination')?.lockOperationId).toBeUndefined();
    });
    it('does not unlock uncertain sends even after scheduler failure', async () => {
        const f = fixture('unknown', 'failed');
        await _settle._handler(f.ctx, { operationId: f.operationId });
        expect(f.rows.get('destination')?.lockOperationId).toBe('op');
        expect(f.rows.get('destination')?.liveDeploymentId).toBe('old');
    });
    it('converts after-send errors to unknown rather than claiming old site is unchanged', async () => {
        const f = fixture();
        await _result._handler(f.ctx, { operationId: f.operationId, nonce: 'nonce', outcome: 'failed' });
        expect(f.rows.get('op')?.stage).toBe('unknown');
        expect(f.rows.get('destination')?.lockOperationId).toBe('op');
    });
    it('retains a lock when release data disappeared instead of accepting deletion as cancellation', async () => {
        const f = fixture('confirmed', 'success'); f.rows.delete('release');
        await _settle._handler(f.ctx, { operationId: f.operationId });
        expect(f.rows.get('destination')?.lockOperationId).toBe('op');
    });
    it('allows a positively terminal failed build to release without changing prior live', async () => {
        const f = fixture('sending', 'success'); f.rows.get('op')!.kind = 'build';
        await _result._handler(f.ctx, { operationId: f.operationId, nonce: 'nonce', outcome: 'failed', terminalBuildFailure: true });
        await _settle._handler(f.ctx, { operationId: f.operationId });
        expect(f.rows.get('op')?.stage).toBe('failed');
        expect(f.rows.get('release')?.status).toBe('error');
        expect(f.rows.get('destination')?.liveDeploymentId).toBe('old');
        expect(f.rows.get('destination')?.lockOperationId).toBeUndefined();
    });
});

const releaseEnvironment = {
    WEBLAB_CLOUD_RELEASES_ENABLED: 'true', WEBLAB_CLOUD_EDITOR_ENABLED: 'true',
    WEBLAB_CLOUD_RELEASE_REVIEW_SECRET: 'a'.repeat(64), WEBLAB_CLOUD_RELEASE_APP_ORIGIN: 'https://app.example.com',
    WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX: 'review.example.net', CLERK_JWT_ISSUER_DOMAIN: 'https://auth.example.org',
    WEBLAB_CLOUD_RELEASE_TEAM_ID: 'team_test', WEBLAB_CLOUD_RELEASE_PROJECT_ID: 'prj_test', WEBLAB_CLOUD_RELEASE_HOSTNAME: 'live.vercel.app',
    WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS: 'team_test',
};
const credentialPins = { credentialId: 'cloudReleaseCredentials', credentialVersion: 1, credentialHash: 'a'.repeat(64) };
const providerPins = { teamId: 'team_test', providerProjectId: 'prj_test', hostname: 'live.vercel.app' };
const releaseDestinationKey = destinationKey(providerPins.teamId, providerPins.providerProjectId, providerPins.hostname);
async function withReleaseEnvironment(work: () => Promise<void>) {
    const previous = Object.fromEntries(Object.keys(releaseEnvironment).map(key => [key, process.env[key]]));
    Object.assign(process.env, releaseEnvironment);
    try { await work(); } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
}
function eligibilityFixture() {
    const rows = new Map<string, Record<string, unknown>>();
    const effects: string[] = [];
    let canonicalUsers: Record<string, unknown>[] | undefined;
    let operationHistory: Record<string, unknown>[] | undefined;
    const put = (table: string, values: Record<string, unknown>) => rows.set(table, { _id: table, ...values });
    put('users', { clerkUserId: 'actor' });
    put('workspaces', { createdByUserId: 'users' });
    put('workspaceMembers', { workspaceId: 'workspaces', userId: 'users', role: 'owner' });
    put('projects', { workspaceId: 'workspaces', accessMode: 'restricted' });
    put('branches', { projectId: 'projects' });
    put('cloudEditorStates', { projectId: 'projects', branchId: 'branches', workspaceId: 'workspaces', version: 1, revision: 1, createdByUserId: 'users' });
    put('cloudReleaseDestinations', { projectId: 'projects', branchId: 'branches', workspaceId: 'workspaces', ...providerPins,
        key: releaseDestinationKey, registrationVersion: 1, ...credentialPins, providerProof: 'b'.repeat(64),
        approvedUntil: Date.now() + 60_000, reviewGatewayVerified: true, publicAliasVerified: false, generation: 1, remainingBuilds: 1 });
    put('cloudReleaseCredentials', { destinationId: 'cloudReleaseDestinations', projectId: 'projects', branchId: 'branches', workspaceId: 'workspaces',
        ...providerPins, version: credentialPins.credentialVersion, ciphertextHash: credentialPins.credentialHash, providerProof: 'b'.repeat(64),
        ciphertext: 'synthetic-encrypted-credential', expiresAt: Date.now() + 3_600_000 });
    put('cloudReleases', { projectId: 'projects', branchId: 'branches', purpose: 'release', status: 'frozen', hash: 'hash' });
    const metric = () => ({ used: 0, remaining: 16_777_216 });
    const ctx = {
        meta: { getTransactionMetrics: async () => ({ bytesRead: metric(), bytesWritten: metric(), documentsRead: metric(), documentsWritten: metric(), databaseQueries: metric() }) },
        auth: { getUserIdentity: async () => ({ subject: 'actor' }) },
        db: {
            get: async (key: string) => rows.get(key) ?? null,
            patch: async (key: string, value: Record<string, unknown>) => { effects.push('patch'); Object.assign(rows.get(key)!, value); },
            insert: async (table: string, value: Record<string, unknown>) => { effects.push('insert'); put(table, value); return table; },
            system: { get: async () => ({ state: { kind: 'inProgress' } }) },
            query: (table: string) => {
                let descending = false;
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const found = () => { const row = rows.get(table); const candidates = table === 'users' && canonicalUsers ? canonicalUsers : table === 'cloudReleaseOperations' && operationHistory ? operationHistory : row ? [row] : []; const selected = candidates.filter(value => constraints.every(([key, expected]) => value[key] === expected)); return descending ? selected.reverse() : selected; };
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    order: (direction: string) => { descending = direction === 'desc'; return query; }, first: async () => found()[0] ?? null, take: async (count: number) => found().slice(0, count), collect: async () => found(), unique: async () => found()[0] ?? null,
                };
                return query;
            },
        }, scheduler: { runAfter: async () => { effects.push('schedule'); return 'job'; } },
    } as unknown as MutationCtx;
    return { rows, ctx, effects, setOperationHistory: (history: Record<string, unknown>[]) => { operationHistory = history; }, setCanonicalUsers: (users: Record<string, unknown>[]) => { canonicalUsers = users; }, scope: { projectId: 'projects' as Id<'projects'>, branchId: 'branches' as Id<'branches'> },
        args: { releaseId: 'cloudReleases' as Id<'cloudReleases'>, operationKey: 'build-operation-0001', expectedLiveReleaseId: null } };
}

describe('release request retry confirmation', () => {
    it('projects starter rollback eligibility from the exact receipt beyond the recent20 display', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture(), release = f.rows.get('cloudReleases')!, destination = f.rows.get('cloudReleaseDestinations')!;
        Object.assign(release, { status: 'ready', deploymentId: 'deployment', builtDestinationKey: releaseDestinationKey });
        destination.publicAliasVerified = true; destination.liveReleaseId = 'other-live'; destination.liveDeploymentId = 'other-deployment';
        f.rows.set('cloudReleaseReviews', { releaseId: f.args.releaseId, actorId: 'users', hash: 'hash', deploymentId: 'deployment' });
        const old = { _id: 'old-confirmed', releaseId: f.args.releaseId, destinationId: 'cloudReleaseDestinations', projectId: 'projects', branchId: 'branches',
            actorId: 'users', operationKey: 'old-confirmed-operation-0001', sourceHash: 'hash', targetDeploymentId: 'deployment', resultDeploymentId: 'deployment', kind: 'publish', stage: 'confirmed' };
        f.setOperationHistory([old, ...Array.from({ length: 121 }, (_, index) => ({ ...old, _id: `later-${index}`,
            operationKey: `later-operation-${index}`, kind: 'build', stage: 'failed', targetDeploymentId: undefined, resultDeploymentId: undefined }))]);
        const value = await status._handler(f.ctx, f.scope);
        expect(value.operations).toHaveLength(20); expect(value.operations.some(op => op.id === old._id)).toBe(false);
        expect(value.releases[0]).toMatchObject({ canRollback: true, reviewed: true });
        old.resultDeploymentId = 'wrong';
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.canRollback).toBe(false);
        old.resultDeploymentId = 'deployment'; old.kind = 'build';
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.canRollback).toBe(false);
        expect(f.effects).toEqual([]);
    }));

    it('requires exact confirmed starter target history and never accepts build or mismatched receipts for rollback', () => withReleaseEnvironment(async () => {
        for (const change of [null, 'destinationId', 'sourceHash', 'targetDeploymentId', 'resultDeploymentId', 'kind'] as const) {
            const f = eligibilityFixture(), destination = f.rows.get('cloudReleaseDestinations')!, release = f.rows.get('cloudReleases')!;
            destination.publicAliasVerified = true;
            Object.assign(release, { status: 'ready', deploymentId: 'deployment', builtDestinationKey: releaseDestinationKey });
            f.rows.set('cloudReleaseReviews', { releaseId: f.args.releaseId, actorId: 'users', hash: 'hash', deploymentId: 'deployment' });
            const prior: Record<string, unknown> = { _id: 'past-operation', releaseId: f.args.releaseId, destinationId: 'cloudReleaseDestinations',
                projectId: 'projects', branchId: 'branches', actorId: 'users', operationKey: 'historical-operation-0001',
                sourceHash: 'hash', targetDeploymentId: 'deployment', resultDeploymentId: 'deployment', kind: 'publish', stage: 'confirmed' };
            if (change) prior[change] = change === 'kind' ? 'build' : 'wrong';
            f.rows.set('cloudReleaseOperations', prior);
            const args = { ...f.args, kind: 'rollback' as const };
            if (change) {
                await expect(request._handler(f.ctx, args)).rejects.toThrow('CLOUD_RELEASE_ROLLBACK_UNAVAILABLE');
                expect(f.effects).toEqual([]);
            } else {
                await request._handler(f.ctx, args);
                expect(f.rows.get('cloudReleaseOperations')).toMatchObject({ kind: 'rollback', targetDeploymentId: 'deployment' });
            }
        }
    }));

    it('stores explicit confirmation and returns only exact retries after live advances', () => withReleaseEnvironment(async () => {
        for (const kind of ['build', 'publish'] as const) {
            for (const expectedLiveReleaseId of [null, 'old-release' as Id<'cloudReleases'>]) {
                const f = eligibilityFixture();
                const destination = f.rows.get('cloudReleaseDestinations')!;
                destination.liveReleaseId = expectedLiveReleaseId ?? undefined;
                destination.publicAliasVerified = true;
                if (kind === 'publish') {
                    Object.assign(f.rows.get('cloudReleases')!, { status: 'ready', deploymentId: 'deployment', builtDestinationKey: releaseDestinationKey, baselineReleaseId: expectedLiveReleaseId ?? undefined });
                    f.rows.set('cloudReleaseReviews', { releaseId: f.args.releaseId, actorId: 'users', hash: 'hash', deploymentId: 'deployment' });
                }
                const args = { ...f.args, kind, expectedLiveReleaseId };
                const operationId = await request._handler(f.ctx, args);
                expect(f.rows.get('cloudReleaseOperations')?.expectedLiveReleaseId).toBe(expectedLiveReleaseId);
                destination.liveReleaseId = 'newer-release';
                f.effects.length = 0;
                const before = structuredClone(f.rows);
                for (const changed of [null, 'newer-release' as Id<'cloudReleases'>]) {
                    if (changed === expectedLiveReleaseId) continue;
                    await expect(request._handler(f.ctx, { ...args, expectedLiveReleaseId: changed })).rejects.toThrow('CLOUD_INVALID_OPERATION');
                    expect(f.effects).toEqual([]);
                    expect(f.rows).toEqual(before);
                }
                expect(await request._handler(f.ctx, args)).toBe(operationId);
                expect(f.effects).toEqual([]);
                expect(f.rows).toEqual(before);
            }
        }
    }));
    it('refuses legacy receipts without a recorded live confirmation', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture();
        const args = { ...f.args, kind: 'build' as const };
        await request._handler(f.ctx, args);
        delete f.rows.get('cloudReleaseOperations')!.expectedLiveReleaseId;
        f.effects.length = 0;
        const before = structuredClone(f.rows);
        await expect(request._handler(f.ctx, args)).rejects.toThrow('CLOUD_INVALID_OPERATION');
        expect(f.effects).toEqual([]);
        expect(f.rows).toEqual(before);
    }));
});

describe('stored release actor identity', () => {
    it('refuses every partial hosting marker before starter request, worker send or settlement', () => withReleaseEnvironment(async () => {
        for (const marker of ['importedHosting', 'importedHostingRequest', 'importedHostingBuildPolicyJson']) {
            const f = eligibilityFixture();
            await request._handler(f.ctx, { ...f.args, kind: 'build' });
            const op = f.rows.get('cloudReleaseOperations')!;
            f.rows.get('cloudReleases')![marker] = marker.endsWith('Json') ? '{}' : {};
            const args = { operationId: 'cloudReleaseOperations' as Id<'cloudReleaseOperations'>, nonce: String(op.nonce) };
            f.effects.length = 0;
            for (const kind of ['build', 'publish', 'rollback'] as const) {
                await expect(request._handler(f.ctx, { ...f.args, kind })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
            }
            expect(await _workerInput._handler(f.ctx, args)).toBeNull();
            expect(await _beginSend._handler(f.ctx, args)).toBe(false);
            await _result._handler(f.ctx, { ...args, outcome: 'confirmed', deploymentId: 'never-activate' });
            await _settle._handler(f.ctx, { operationId: args.operationId });
            expect(f.effects).toEqual([]);
            expect((await status._handler(f.ctx, f.scope)).releases).toHaveLength(0);
        }
    }));
    it('refuses a saved duplicate actor after canonical Clerk identity changes', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture();
        await request._handler(f.ctx, { ...f.args, kind: 'build' });
        const op = f.rows.get('cloudReleaseOperations')!;
        const args = { operationId: 'cloudReleaseOperations' as Id<'cloudReleaseOperations'>, nonce: String(op.nonce) };
        expect(await _workerInput._handler(f.ctx, args)).not.toBeNull();
        f.setCanonicalUsers([{ _id: 'canonical-user', _creationTime: 1, clerkUserId: 'actor' },
            { _id: 'users', _creationTime: 2, clerkUserId: 'actor' }]);
        f.effects.length = 0;
        expect(await _workerInput._handler(f.ctx, args)).toBeNull();
        expect(await _beginSend._handler(f.ctx, args)).toBe(false);
        expect(f.effects).toEqual([]);
    }));
    it('refuses a forged private imported artifact even under a starter enrollment', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture();
        await request._handler(f.ctx, { ...f.args, kind: 'build' });
        const op = f.rows.get('cloudReleaseOperations')!;
        Object.assign(f.rows.get('cloudReleases')!, { artifactProfile: 'imported-next-private-v1', purpose: 'private-artifact' });
        const args = { operationId: 'cloudReleaseOperations' as Id<'cloudReleaseOperations'>, nonce: String(op.nonce) };
        f.effects.length = 0;
        expect(await _workerInput._handler(f.ctx, args)).toBeNull();
        expect(await _beginSend._handler(f.ctx, args)).toBe(false);
        expect(f.effects).toEqual([]);
    }));
});

describe('staged build eligibility', () => {
    it('only exposes starter backup download and restore to current designers', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture();
        Object.assign(f.rows.get('cloudReleases')!, { purpose: 'backup', status: 'frozen' });
        const designer = await status._handler(f.ctx, f.scope);
        expect(designer).toMatchObject({ canBackup: true, canRestoreBackup: true, canDownloadBackup: true });
        expect(designer.releases[0]?.canDownload).toBe(true);
        f.rows.set('cloudEditorGrants', { projectId: f.scope.projectId, userId: 'users', role: 'content', publish: true });
        const content = await status._handler(f.ctx, f.scope);
        expect(content).toMatchObject({ canBackup: false, canRestoreBackup: false, canDownloadBackup: false });
        expect(content.releases[0]?.canDownload).toBe(false);
    }));
    it('allows the first build while keeping publication and rollback closed', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture();
        Object.assign(f.rows.get('cloudReleaseDestinations')!, { reviewGatewayVerified: false, remainingBuilds: 2 });
        const state = await status._handler(f.ctx, f.scope);
        expect(state.buildEnabled).toBe(true); expect(state.enabled).toBe(false);
        for (const kind of ['publish', 'rollback'] as const) {
            await expect(request._handler(f.ctx, { ...f.args, kind })).rejects.toThrow('CLOUD_RELEASE_SETUP_REQUIRED');
        }
        await request._handler(f.ctx, { ...f.args, kind: 'build' });
        expect(f.rows.get('cloudReleaseDestinations')?.remainingBuilds).toBe(1);
        expect(f.rows.get('cloudReleases')?.status).toBe('building');
        const op = f.rows.get('cloudReleaseOperations')!;
        expect(op).toMatchObject(credentialPins);
        const args = { operationId: 'cloudReleaseOperations' as Id<'cloudReleaseOperations'>, nonce: String(op.nonce) };
        expect(await _workerInput._handler(f.ctx, args)).not.toBeNull();
        expect(await _beginSend._handler(f.ctx, args)).toBe(true);
    }));
    it('requires both proofs at request, worker read and immediately before sending', () => withReleaseEnvironment(async () => {
        for (const kind of ['publish', 'rollback'] as const) {
            for (const proof of ['reviewGatewayVerified', 'publicAliasVerified'] as const) {
                const f = eligibilityFixture();
                const destination = f.rows.get('cloudReleaseDestinations')!;
                destination.publicAliasVerified = true; destination.lockOperationId = 'cloudReleaseOperations';
                f.rows.set('cloudReleaseOperations', { _id: 'cloudReleaseOperations', nonce: 'nonce', stage: 'queued', kind,
                    destinationId: 'cloudReleaseDestinations', releaseId: 'cloudReleases', actorId: 'users', ...f.scope,
                    generation: 1, ...credentialPins, sourceHash: 'hash', schedulerId: 'job' });
                const args = { operationId: 'cloudReleaseOperations' as Id<'cloudReleaseOperations'>, nonce: 'nonce' };
                expect(await _workerInput._handler(f.ctx, args)).not.toBeNull();
                destination[proof] = false;
                await expect(request._handler(f.ctx, { ...f.args, kind })).rejects.toThrow('CLOUD_RELEASE_SETUP_REQUIRED');
                expect(await _workerInput._handler(f.ctx, args)).toBeNull();
                expect(await _beginSend._handler(f.ctx, args)).toBe(false);
                expect(destination.lockOperationId).toBe('cloudReleaseOperations');
            }
        }
    }));
    it('shows unverified review only to a responsible manager until gateway proof is recorded', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture();
        const destination = f.rows.get('cloudReleaseDestinations')!;
        Object.assign(destination, { reviewGatewayVerified: false });
        Object.assign(f.rows.get('cloudReleases')!, { status: 'ready', builtDestinationKey: releaseDestinationKey });
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.reviewUrl).not.toBeNull();
        f.rows.set('cloudEditorGrants', { projectId: f.scope.projectId, userId: 'users', role: 'content', publish: true });
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.reviewUrl).toBeNull();
        destination.reviewGatewayVerified = true;
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.reviewUrl).not.toBeNull();
    }));
    it('keeps legacy destinations disabled even when the old environment pins still match', () => withReleaseEnvironment(async () => {
        const f = eligibilityFixture();
        const destination = f.rows.get('cloudReleaseDestinations')!;
        for (const key of ['registrationVersion', 'workspaceId', 'credentialId', 'credentialVersion', 'credentialHash', 'providerProof']) delete destination[key];
        destination.publicAliasVerified = true;
        const state = await status._handler(f.ctx, f.scope);
        expect(state.buildEnabled).toBe(false); expect(state.enabled).toBe(false);
        await expect(request._handler(f.ctx, { ...f.args, kind: 'build' })).rejects.toThrow('CLOUD_RELEASE_SETUP_REQUIRED');
        expect(f.effects).toEqual([]);
    }));
    it('rejects credentials belonging to another destination, site, workspace or version', () => withReleaseEnvironment(async () => {
        for (const change of [
            { destinationId: 'other-destination' }, { workspaceId: 'other-workspace' }, { projectId: 'other-project' },
            { branchId: 'other-branch' }, { teamId: 'team_other' }, { providerProjectId: 'prj_other' },
            { hostname: 'other.vercel.app' }, { version: 2 }, { ciphertextHash: 'c'.repeat(64) }, { providerProof: 'd'.repeat(64) },
            { expiresAt: 1 }, { revokedAt: 1 },
        ]) {
            const f = eligibilityFixture();
            Object.assign(f.rows.get('cloudReleaseCredentials')!, change);
            expect((await status._handler(f.ctx, f.scope)).buildEnabled).toBe(false);
            await expect(request._handler(f.ctx, { ...f.args, kind: 'build' })).rejects.toThrow('CLOUD_RELEASE_SETUP_REQUIRED');
            expect(f.effects).toEqual([]);
        }
    }));
    it('refuses worker reads and sends when any captured credential pin or generation changes', () => withReleaseEnvironment(async () => {
        for (const change of [
            { credentialId: 'other-credential' }, { credentialVersion: 2 }, { credentialHash: 'c'.repeat(64) },
            { credentialId: undefined }, { credentialVersion: undefined }, { credentialHash: undefined }, { generation: 2 },
        ]) {
            const f = eligibilityFixture();
            await request._handler(f.ctx, { ...f.args, kind: 'build' });
            const op = f.rows.get('cloudReleaseOperations')!;
            const args = { operationId: 'cloudReleaseOperations' as Id<'cloudReleaseOperations'>, nonce: String(op.nonce) };
            expect(await _workerInput._handler(f.ctx, args)).not.toBeNull();
            Object.assign(op, change);
            f.effects.length = 0;
            expect(await _workerInput._handler(f.ctx, args)).toBeNull();
            expect(await _beginSend._handler(f.ctx, args)).toBe(false);
            expect(f.effects).toEqual([]);
            expect(op.stage).toBe('queued');
            expect(f.rows.get('cloudReleaseDestinations')?.lockOperationId).toBe('cloudReleaseOperations');
        }
    }));
});
