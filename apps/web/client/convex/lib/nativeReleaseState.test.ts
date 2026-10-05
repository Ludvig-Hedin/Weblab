import { describe, expect, it } from 'bun:test';
import { getFunctionName } from 'convex/server';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { _reserve, _cancel, _preflight, _beginSend, _settle } from '../nativeReleases';
import { work } from '../nativeReleaseActions';
import { MAX_SETTLE_ATTEMPTS, nativeDestinationKey, type NativeReleasePins } from './nativeReleaseContract';

// Registered handler fixtures with explicitly synthetic persistence/scheduler records.
// They do not prove real Convex transactional concurrency, scheduler atomicity or provider behavior.
type Row = Record<string, unknown>;
type JobState = { kind: 'pending' | 'inProgress' | 'success' | 'canceled' } | { kind: 'failed'; error: string };
function fixture() {
    const rows = new Map<string, Row>();
    const jobs = new Map<string, { state: JobState }>();
    const scheduled: Array<{ id: string; name: string; args: Row }> = [];
    let actor: string | null = 'actor';
    let sequence = 0;
    const put = (table: string, id: string, value: Row) => rows.set(id, { _id: id, _creationTime: 1, table, ...value });
    for (const [suffix, clerk] of [['', 'actor'], ['2', 'other']] as const) {
        put('users', `user${suffix}`, { clerkUserId: clerk });
        put('workspaces', `workspace${suffix}`, { createdByUserId: `user${suffix}` });
        put('workspaceMembers', `membership${suffix}`, { workspaceId: `workspace${suffix}`, userId: `user${suffix}`, role: 'owner' });
        put('projects', `project${suffix}`, { workspaceId: `workspace${suffix}`, accessMode: 'restricted' });
        put('branches', `branch${suffix}`, { projectId: `project${suffix}`, runtimeType: 'local' });
        put('nativeReleaseConnections', `connection${suffix}`, {
            destinationId: 'destination', actorId: `user${suffix}`, projectId: `project${suffix}`, branchId: `branch${suffix}`,
            callerKey: `caller${suffix}`, generation: 1, credentialVersion: 1, verifiedAt: 1, expiresAt: Date.now() + 60_000,
        });
    }
    put('nativeReleaseDestinations', 'destination', { provider: 'vercel', providerAccountId: 'account', providerProjectId: 'providerProject',
        key: nativeDestinationKey('account', 'providerProject'), generation: 1, verifiedAt: 1, liveDeploymentId: 'old' });
    const ctx = {
        auth: { getUserIdentity: async () => actor === null ? null : ({ subject: actor, issuer: 'https://auth.example.org', tokenIdentifier: `https://auth.example.org|${actor}` }) },
        db: {
            get: async (id: string) => structuredClone(rows.get(id) ?? null),
            insert: async (table: string, value: Row) => { const id = `op${++sequence}`; put(table, id, value); return id; },
            patch: async (id: string, patch: Row) => {
                const next = { ...rows.get(id), ...patch };
                for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
                rows.set(id, next);
            },
            query: (table: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const found = () => [...rows.values()].filter(row => row.table === table && constraints.every(([key, value]) => row[key] === value));
                const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => found(), unique: async () => {
                        const matches = found(); if (matches.length > 1) throw new Error('DUPLICATE'); return structuredClone(matches[0] ?? null);
                    } };
                return query;
            },
            system: { get: async (id: string) => structuredClone(jobs.get(id) ?? null) },
        },
        scheduler: { runAfter: async (_delay: number, reference: Parameters<typeof getFunctionName>[0], args: Row) => {
            const id = `job${scheduled.length + 1}`;
            scheduled.push({ id, name: getFunctionName(reference), args }); jobs.set(id, { state: { kind: 'pending' } }); return id;
        } },
    } as unknown as MutationCtx;
    const pins: NativeReleasePins = {
        projectId: 'project' as Id<'projects'>, branchId: 'branch' as Id<'branches'>,
        connectionId: 'connection' as Id<'nativeReleaseConnections'>, connectionGeneration: 1,
        destinationId: 'destination' as Id<'nativeReleaseDestinations'>, destinationGeneration: 1,
        callerKey: 'caller', kind: 'publish', releaseId: 'release', deploymentId: 'new',
        sourceHash: 'a'.repeat(64), contentHash: 'b'.repeat(64), assetsHash: 'c'.repeat(64),
        runtimeProfile: 'sanity-blog-v1', runtimeVersion: '1', expectedLiveDeploymentId: 'old',
        domainsHash: 'd'.repeat(64), settingsHash: 'e'.repeat(64), environmentHash: 'f'.repeat(64), credentialVersion: 1,
    };
    const reserve = (requested = pins, operationKey = 'operation-0001') => _reserve._handler(ctx, { operationKey, pins: requested });
    const workerArgs = (id: Id<'nativeReleaseOperations'>) => ({ operationId: id, nonce: String(rows.get(id)!.nonce) });
    const originalJob = (id: string) => String(rows.get(id)!.schedulerId);
    const runOriginalWorker = async (id: Id<'nativeReleaseOperations'>) => {
        const job = originalJob(id); jobs.set(job, { state: { kind: 'inProgress' } });
        const actionCtx = { runMutation: async (reference: Parameters<typeof getFunctionName>[0], args: ReturnType<typeof workerArgs>) => {
            expect(getFunctionName(reference)).toBe('nativeReleases:_preflight'); return _preflight._handler(ctx, args);
        } } as unknown as ActionCtx;
        await work._handler(actionCtx, workerArgs(id));
        jobs.set(job, { state: { kind: 'success' } });
    };
    const settle = (id: Id<'nativeReleaseOperations'>, attempt = 0) => _settle._handler(ctx, { operationId: id, attempt });
    return { rows, jobs, scheduled, ctx, pins, reserve, workerArgs, originalJob, runOriginalWorker, settle, switchActor: (value: string | null) => { actor = value; } };
}

describe('native global destination reservations', () => {
    it('connects reservation, original scheduled worker refusal and terminal unsent settlement', async () => {
        const f = fixture(); const id = await f.reserve();
        expect(f.rows.get('destination')!.lockOperationId).toBe(id);
        expect(f.scheduled.map(job => job.name)).toEqual(['nativeReleaseActions:work', 'nativeReleases:_settle']);
        await f.runOriginalWorker(id);
        expect(f.rows.get(id)).toMatchObject({ stage: 'refused', refusal: 'NATIVE_VERIFIER_UNAVAILABLE', sendAuthorityGranted: false });
        expect(f.rows.get('destination')!.lockOperationId).toBe(id);
        await f.settle(id);
        expect(f.rows.get(id)).toMatchObject({ stage: 'settled', sendAuthorityGranted: false });
        expect(f.rows.get('destination')!.lockOperationId).toBeUndefined();
        expect(f.rows.get('destination')!.liveDeploymentId).toBe('old');
    });
    it('returns exact retries without scheduling or rereading mutable registration', async () => {
        const f = fixture(); const id = await f.reserve();
        f.rows.delete('connection'); f.rows.get('destination')!.generation = 2;
        expect(await f.reserve()).toBe(id); expect(f.scheduled.length).toBe(2);
    });
    it('refuses every changed immutable pin even after destination mutation', async () => {
        const changes: { [K in keyof NativeReleasePins]: NativeReleasePins[K] } = {
            projectId: 'project2' as Id<'projects'>, branchId: 'branch2' as Id<'branches'>,
            connectionId: 'connection2' as Id<'nativeReleaseConnections'>, connectionGeneration: 2,
            destinationId: 'destination2' as Id<'nativeReleaseDestinations'>, destinationGeneration: 2,
            callerKey: 'changed', kind: 'rollback', releaseId: 'changed', deploymentId: 'changed',
            sourceHash: '1'.repeat(64), contentHash: '2'.repeat(64), assetsHash: '3'.repeat(64),
            runtimeProfile: 'changed', runtimeVersion: '2', expectedLiveDeploymentId: null,
            domainsHash: '4'.repeat(64), settingsHash: '5'.repeat(64), environmentHash: '6'.repeat(64), credentialVersion: 2,
        };
        for (const key of Object.keys(changes) as Array<keyof NativeReleasePins>) {
            const f = fixture(); await f.reserve(); f.rows.get('destination')!.generation = 3;
            // Give the original actor rights to the changed project so equality, not permission failure, refuses it.
            f.rows.get('membership2')!.userId = 'user';
            await expect(f.reserve({ ...f.pins, [key]: changes[key] })).rejects.toThrow('NATIVE_RETRY_CHANGED');
            expect(f.scheduled.length).toBe(2);
        }
    });
    it('rejects actor replacement rather than adopting a previous caller key', async () => {
        const f = fixture(); await f.reserve(); f.switchActor('other'); f.rows.get('membership')!.userId = 'user2';
        await expect(f.reserve()).rejects.toThrow('NATIVE_RETRY_CHANGED');
    });
    it('blocks a second actor/project connection to the same canonical provider destination', async () => {
        const f = fixture(); const id = await f.reserve(); f.switchActor('other');
        const other = { ...f.pins, projectId: 'project2' as Id<'projects'>, branchId: 'branch2' as Id<'branches'>,
            connectionId: 'connection2' as Id<'nativeReleaseConnections'>, callerKey: 'caller2' };
        await expect(f.reserve(other, 'operation-0002')).rejects.toThrow('NATIVE_DESTINATION_BUSY');
        expect(f.rows.get('destination')!.lockOperationId).toBe(id); expect(f.scheduled.length).toBe(2);
    });
    it('connection deletion and reconnection cannot replace or unlock the global destination', async () => {
        const f = fixture(); const id = await f.reserve(); const connection = f.rows.get('connection')!;
        f.rows.delete('connection'); f.rows.set('connection-new', { ...connection, _id: 'connection-new', generation: 2 });
        await expect(f.reserve({ ...f.pins, connectionId: 'connection-new' as Id<'nativeReleaseConnections'>, connectionGeneration: 2 }, 'operation-0002'))
            .rejects.toThrow('NATIVE_DESTINATION_BUSY');
        expect(f.rows.get('destination')!.lockOperationId).toBe(id);
    });
    it('cannot claim unregistered or noncanonical provider identity', async () => {
        for (const field of ['verifiedAt', 'key', 'providerAccountId'] as const) {
            const f = fixture(); f.rows.get('destination')![field] = field === 'verifiedAt' ? 0 : 'unverified';
            await expect(f.reserve()).rejects.toThrow('NATIVE_REGISTRATION_REQUIRED'); expect(f.scheduled.length).toBe(0);
        }
    });
    it('refuses unauthenticated internal reservation and stale scope', async () => {
        const f = fixture(); f.switchActor(null); await expect(f.reserve()).rejects.toThrow('UNAUTHORIZED');
        f.switchActor('missing'); await expect(f.reserve()).rejects.toThrow('UNAUTHORIZED');
        f.switchActor('actor'); f.rows.get('branch')!.projectId = 'project2'; await expect(f.reserve()).rejects.toThrow('NATIVE_SCOPE_CHANGED');
    });
    it('bounds caller keys, hashes and generations', async () => {
        const f = fixture();
        await expect(f.reserve(f.pins, 'x'.repeat(129))).rejects.toThrow('NATIVE_INVALID_IDENTIFIER');
        await expect(f.reserve({ ...f.pins, sourceHash: 'hash' })).rejects.toThrow('NATIVE_INVALID_HASH');
        await expect(f.reserve({ ...f.pins, connectionGeneration: Infinity })).rejects.toThrow('NATIVE_INVALID_GENERATION');
    });
});

describe('native fail-closed send and retained history', () => {
    it('direct begin-send refuses valid pins independently of worker preflight', async () => {
        const f = fixture(); const id = await f.reserve(); f.jobs.set(f.originalJob(id), { state: { kind: 'inProgress' } });
        expect(await _beginSend._handler(f.ctx, f.workerArgs(id))).toBe(false);
        expect(f.rows.get(id)!.sendAuthorityGranted).toBe(false); expect(f.rows.get(id)!.stage).toBe('refused');
    });
    it('cancel before begin-send keeps its reservation until original terminal proof', async () => {
        const f = fixture(); const id = await f.reserve(); await _cancel._handler(f.ctx, { operationId: id });
        expect(await _beginSend._handler(f.ctx, f.workerArgs(id))).toBe(false);
        await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBe(id);
        await f.runOriginalWorker(id); await f.settle(id);
        expect(f.rows.get('destination')!.lockOperationId).toBeUndefined(); expect(f.rows.get(id)!.canceledAt).toBeNumber();
    });
    it('send refusal before cancel cannot grant authority or unlock early', async () => {
        const f = fixture(); const id = await f.reserve(); f.jobs.set(f.originalJob(id), { state: { kind: 'inProgress' } });
        await _beginSend._handler(f.ctx, f.workerArgs(id)); await _cancel._handler(f.ctx, { operationId: id });
        await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBe(id);
        expect(f.rows.get(id)!.sendAuthorityGranted).toBe(false);
    });
    it('worker rechecks revoked and deleted scope, but settles provably unsent history safely', async () => {
        for (const change of ['membership', 'user', 'project', 'branch', 'connection', 'expiry', 'revoked', 'generation'] as const) {
            const f = fixture(); const id = await f.reserve();
            if (change === 'expiry') f.rows.get('connection')!.expiresAt = 1;
            else if (change === 'revoked') f.rows.get('connection')!.revokedAt = Date.now();
            else if (change === 'generation') f.rows.get('connection')!.generation = 2;
            else f.rows.delete(change);
            await f.runOriginalWorker(id);
            expect(f.rows.get(id)!.stage).toBe('refused'); expect(f.rows.get(id)!.sendAuthorityGranted).toBe(false);
            await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBeUndefined();
        }
    });
    it('retains historical sending, unknown and missing never-send proof across deletion and terminal worker', async () => {
        for (const history of [{ stage: 'sending', sendAuthorityGranted: true }, { stage: 'unknown', sendAuthorityGranted: true },
            { stage: 'refused', sendAuthorityGranted: true }, { stage: 'refused', sendAuthorityGranted: undefined },
            { stage: 'unknown', sendAuthorityGranted: false }]) {
            const f = fixture(); const id = await f.reserve(); Object.assign(f.rows.get(id)!, history);
            await _cancel._handler(f.ctx, { operationId: id });
            expect(f.rows.get(id)!.stage).toBe(history.stage);
            f.rows.delete('user'); f.rows.delete('project'); f.rows.delete('connection');
            f.jobs.set(f.originalJob(id), { state: { kind: 'failed', error: 'synthetic failure' } });
            expect(await _preflight._handler(f.ctx, f.workerArgs(id))).toBe(false);
            expect(await _beginSend._handler(f.ctx, f.workerArgs(id))).toBe(false);
            await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBe(id);
            expect(f.rows.get(id)!.stage).toBe(history.stage);
        }
    });
});

describe('native original-worker terminal settlement', () => {
    it('accepts only original success, failed or canceled with exact reservation and never-send proof', async () => {
        const states: JobState[] = [{ kind: 'success' }, { kind: 'failed', error: 'synthetic failure' }, { kind: 'canceled' }];
        for (const state of states) {
            const f = fixture(); const id = await f.reserve(); f.jobs.set(f.originalJob(id), { state });
            await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBeUndefined();
            expect(f.rows.get(id)!.settledAt).toBeNumber(); expect(f.rows.get('destination')!.liveDeploymentId).toBe('old');
        }
    });
    it('missing scheduler ID or record is never terminal proof', async () => {
        for (const missing of ['id', 'record'] as const) {
            const f = fixture(); const id = await f.reserve();
            if (missing === 'id') delete f.rows.get(id)!.schedulerId; else f.jobs.delete(f.originalJob(id));
            await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBe(id);
        }
    });
    it('pending and inProgress original workers reschedule only a bounded number of safe polls', async () => {
        for (const kind of ['pending', 'inProgress'] as const) {
            const f = fixture(); const id = await f.reserve(); f.jobs.set(f.originalJob(id), { state: { kind } });
            await f.settle(id); expect(f.scheduled.length).toBe(3);
            await f.settle(id, MAX_SETTLE_ATTEMPTS); expect(f.scheduled.length).toBe(3);
            expect(f.rows.get('destination')!.lockOperationId).toBe(id);
        }
    });
    it('does not accept another job terminal record or clear a replacement reservation', async () => {
        const f = fixture(); const id = await f.reserve(); f.jobs.set('unrelated-job', { state: { kind: 'success' } });
        await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBe(id);
        f.jobs.set(f.originalJob(id), { state: { kind: 'success' } }); f.rows.get('destination')!.lockOperationId = 'replacement';
        await f.settle(id); expect(f.rows.get('destination')!.lockOperationId).toBe('replacement');
    });
    it('retains reservation if global generation changed or global record disappeared', async () => {
        for (const change of ['generation', 'deleted'] as const) {
            const f = fixture(); const id = await f.reserve(); f.jobs.set(f.originalJob(id), { state: { kind: 'success' } });
            if (change === 'generation') f.rows.get('destination')!.generation = 2; else f.rows.delete('destination');
            await f.settle(id); expect(f.rows.get(id)!.stage).toBe('queued');
        }
    });
});
