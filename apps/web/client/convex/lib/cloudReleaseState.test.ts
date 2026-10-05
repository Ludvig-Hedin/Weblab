import { describe, expect, it } from 'bun:test';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { _result, _settle, _workerInput, _beginSend, request, status } from '../cloudReleases';

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
};
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
    const put = (table: string, values: Record<string, unknown>) => rows.set(table, { _id: table, ...values });
    put('users', { clerkUserId: 'actor' });
    put('workspaces', { createdByUserId: 'users' });
    put('workspaceMembers', { workspaceId: 'workspaces', userId: 'users', role: 'owner' });
    put('projects', { workspaceId: 'workspaces', accessMode: 'restricted' });
    put('branches', { projectId: 'projects' });
    put('cloudEditorStates', { projectId: 'projects', branchId: 'branches', workspaceId: 'workspaces', version: 1, revision: 1, createdByUserId: 'users' });
    put('cloudReleaseDestinations', { branchId: 'branches', teamId: 'team_test', providerProjectId: 'prj_test', hostname: 'live.vercel.app',
        approvedUntil: Date.now() + 60_000, reviewGatewayVerified: true, publicAliasVerified: false, generation: 1, remainingBuilds: 1 });
    put('cloudReleases', { projectId: 'projects', branchId: 'branches', purpose: 'release', status: 'frozen', hash: 'hash' });
    const ctx = {
        auth: { getUserIdentity: async () => ({ subject: 'actor' }) },
        db: {
            get: async (key: string) => rows.get(key) ?? null,
            patch: async (key: string, value: Record<string, unknown>) => { effects.push('patch'); Object.assign(rows.get(key)!, value); },
            insert: async (table: string, value: Record<string, unknown>) => { effects.push('insert'); put(table, value); return table; },
            system: { get: async () => ({ state: { kind: 'inProgress' } }) },
            query: (table: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const found = () => { const row = rows.get(table); return row && constraints.every(([key, value]) => row[key] === value) ? [row] : []; };
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    order: () => query, take: async () => found(), collect: async () => found(), unique: async () => found()[0] ?? null,
                };
                return query;
            },
        }, scheduler: { runAfter: async () => { effects.push('schedule'); return 'job'; } },
    } as unknown as MutationCtx;
    return { rows, ctx, effects, scope: { projectId: 'projects' as Id<'projects'>, branchId: 'branches' as Id<'branches'> },
        args: { releaseId: 'cloudReleases' as Id<'cloudReleases'>, operationKey: 'build-operation-0001', expectedLiveReleaseId: null } };
}

describe('release request retry confirmation', () => {
    it('stores explicit confirmation and returns only exact retries after live advances', () => withReleaseEnvironment(async () => {
        for (const kind of ['build', 'publish'] as const) {
            for (const expectedLiveReleaseId of [null, 'old-release' as Id<'cloudReleases'>]) {
                const f = eligibilityFixture();
                const destination = f.rows.get('cloudReleaseDestinations')!;
                destination.liveReleaseId = expectedLiveReleaseId ?? undefined;
                destination.publicAliasVerified = true;
                if (kind === 'publish') {
                    Object.assign(f.rows.get('cloudReleases')!, { status: 'ready', deploymentId: 'deployment', baselineReleaseId: expectedLiveReleaseId ?? undefined });
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

describe('staged build eligibility', () => {
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
                    generation: 1, sourceHash: 'hash', schedulerId: 'job' });
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
        Object.assign(destination, { reviewGatewayVerified: false, key: 'destination' });
        Object.assign(f.rows.get('cloudReleases')!, { status: 'ready', builtDestinationKey: 'destination' });
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.reviewUrl).not.toBeNull();
        f.rows.set('cloudEditorGrants', { projectId: f.scope.projectId, userId: 'users', role: 'content', publish: true });
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.reviewUrl).toBeNull();
        destination.reviewGatewayVerified = true;
        expect((await status._handler(f.ctx, f.scope)).releases[0]?.reviewUrl).not.toBeNull();
    }));
});
