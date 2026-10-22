import { describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _configure } from '../cloudReleases';
import { destinationKey } from './cloudReleasePolicy';

type Row = Record<string, unknown> & { _id: string };
type ConfigureArgs = Parameters<typeof _configure._handler>[1];
const grantA = 'approved-grant-0001';
const grantB = 'approved-grant-0002';

// Execute the actual mutation; only persistence is simulated. This is not
// evidence of deployed Convex index availability or transaction concurrency.
function fixture() {
    const tables = new Map<string, Row[]>();
    const writes: Array<{ kind: string; id?: string; table?: string; value: Record<string, unknown> }> = [];
    const reads: Array<{ table: string; index: string; limit: number }> = [];
    let sequence = 0;
    const rows = (table: string) => tables.get(table) ?? [];
    const seed = (table: string, value: Record<string, unknown>) => {
        const row = { ...value, _id: String(value._id ?? `${table}-${++sequence}`) };
        tables.set(table, [...rows(table), row]);
        return row;
    };
    const get = (id: string) => [...tables.values()].flat().find(row => row._id === id);
    const ctx = { db: {
        get: async (id: string) => structuredClone(get(id) ?? null),
        patch: async (id: string, value: Record<string, unknown>) => {
            writes.push({ kind: 'patch', id, value: structuredClone(value) });
            Object.assign(get(id)!, value);
        },
        insert: async (table: string, value: Record<string, unknown>) => {
            writes.push({ kind: 'insert', table, value: structuredClone(value) });
            return seed(table, value)._id;
        },
        query: (table: string) => {
            let indexName = '';
            const constraints: Array<[string, unknown]> = [];
            const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
            const found = () => rows(table).filter(row => constraints.every(([key, value]) => row[key] === value));
            const query = {
                withIndex: (name: string, build: (q: typeof index) => unknown) => { indexName = name; build(index); return query; },
                take: async (limit: number) => { reads.push({ table, index: indexName, limit }); return structuredClone(found().slice(0, limit)); },
                unique: async () => {
                    const matches = found();
                    if (matches.length > 1) throw new Error('Duplicate unique rows');
                    return structuredClone(matches[0] ?? null);
                },
            };
            return query;
        },
    } } as unknown as MutationCtx;
    const args: ConfigureArgs = {
        projectId: 'project' as Id<'projects'>, branchId: 'branch' as Id<'branches'>,
        teamId: 'team_test', providerProjectId: 'prj_test', hostname: 'live.vercel.app',
        builds: 2, approvedUntil: Date.now() + 3_600_000, grantKey: grantA,
        reviewGatewayVerified: false, publicAliasVerified: false,
    };
    seed('branches', { _id: args.branchId, projectId: args.projectId });
    const existing = (overrides: Record<string, unknown> = {}) => seed('cloudReleaseDestinations', {
        _id: 'destination', ...args, grantKey: undefined,
        key: destinationKey(args.teamId, args.providerProjectId, args.hostname),
        generation: 7, remainingBuilds: args.builds, drifted: false,
        liveReleaseId: 'live-release', liveDeploymentId: 'live-deployment',
        reviewGatewayVerified: true, publicAliasVerified: true,
        ...overrides,
    });
    const configure = (overrides: Partial<ConfigureArgs> = {}) => _configure._handler(ctx, { ...args, ...overrides });
    const rejectsWithoutWrites = async (overrides: Partial<ConfigureArgs>, error: string) => {
        writes.length = 0;
        const before = structuredClone(tables);
        await expect(configure(overrides)).rejects.toThrow(error);
        expect(writes).toEqual([]);
        expect(tables).toEqual(before);
    };
    return { args, tables, writes, reads, seed, rows, existing, configure, rejectsWithoutWrites };
}

describe('operator publishing destination and allowance configuration', () => {
    const hostingProfile = 'imported-next-hosting-v1' as const;
    it('stores a fresh imported profile only with a protected destination and an explicit allowance', async () => {
        const f = fixture();
        await f.rejectsWithoutWrites({ hostingProfile, publicAliasVerified: true }, 'CLOUD_RELEASE_INVALID_CONFIGURATION');
        await f.rejectsWithoutWrites({ hostingProfile, grantKey: undefined }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        await f.configure({ hostingProfile });
        expect(f.rows('cloudReleaseDestinations')[0]).toMatchObject({ hostingProfile, publicAliasVerified: false, remainingBuilds: 2 });
        expect(f.rows('cloudReleaseBuildGrants')).toHaveLength(1);
    });
    it('never switches an existing destination between starter and imported profiles', async () => {
        for (const registered of [false, true]) {
            const starter = fixture(); starter.existing({ ...(registered ? { registrationVersion: 1 } : {}) });
            await starter.rejectsWithoutWrites({ hostingProfile }, 'CLOUD_RELEASE_INVALID_CONFIGURATION');
            const imported = fixture(); imported.existing({ hostingProfile, publicAliasVerified: false, ...(registered ? { registrationVersion: 2 } : {}) });
            await imported.rejectsWithoutWrites({}, 'CLOUD_RELEASE_INVALID_CONFIGURATION');
        }
    });
    it('cannot rewrite imported registration proof booleans or refill a replayed allowance', async () => {
        const f = fixture();
        await f.configure({ hostingProfile });
        const destination = f.rows('cloudReleaseDestinations')[0]!;
        Object.assign(destination, { registrationVersion: 2, reviewGatewayVerified: true, remainingBuilds: 0 });
        await f.rejectsWithoutWrites({ hostingProfile }, 'CLOUD_RELEASE_INVALID_CONFIGURATION');
        await f.rejectsWithoutWrites({ hostingProfile, reviewGatewayVerified: true, publicAliasVerified: true }, 'CLOUD_RELEASE_INVALID_CONFIGURATION');
        f.writes.length = 0;
        await f.configure({ hostingProfile, reviewGatewayVerified: true });
        expect(destination.remainingBuilds).toBe(0); expect(f.writes).toEqual([]);
    });
    it('refuses imported alias proof even on a registered private destination', async () => {
        const f = fixture(); f.existing({ hostingProfile, registrationVersion: 2, reviewGatewayVerified: true });
        await f.rejectsWithoutWrites({ hostingProfile, reviewGatewayVerified: true, publicAliasVerified: true }, 'CLOUD_RELEASE_INVALID_CONFIGURATION');
    });
    it('cannot preserve a true imported alias flag without an existing profile2 gateway attestation', async () => {
        for (const patch of [{ registrationVersion: undefined }, { registrationVersion: 1 }, { reviewGatewayVerified: false }]) {
            const f = fixture(); f.existing({ hostingProfile, registrationVersion: 2, ...patch });
            await f.rejectsWithoutWrites({ hostingProfile, reviewGatewayVerified: true, publicAliasVerified: true }, 'CLOUD_RELEASE_INVALID_CONFIGURATION');
        }
    });
    it('requires an explicit bounded grant for a new destination and records its immutable receipt', async () => {
        const f = fixture();
        await f.rejectsWithoutWrites({ grantKey: undefined }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        await f.configure();
        const destination = f.rows('cloudReleaseDestinations')[0]!;
        expect(destination.remainingBuilds).toBe(2);
        expect(f.rows('cloudReleaseBuildGrants')).toMatchObject([{
            destinationId: destination._id, grantKey: grantA, builds: 2, approvedUntil: f.args.approvedUntil,
        }]);
        expect(f.reads).toContainEqual({ table: 'cloudReleaseDestinations', index: 'by_teamId_and_providerProjectId', limit: 2 });
        expect(f.reads).toContainEqual({ table: 'cloudReleaseDestinations', index: 'by_hostname', limit: 2 });
    });

    it('reserves each provider project and hostname across all destinations including stale/live/unknown rows', async () => {
        for (const collision of ['provider', 'hostname']) {
            for (const state of ['stale', 'live', 'unknown']) {
                const f = fixture();
                f.existing({
                    _id: 'other-destination', projectId: 'other-project', branchId: 'other-branch', key: 'old-key',
                    ...(collision === 'provider' ? { hostname: 'old.vercel.app' } : { providerProjectId: 'prj_other' }),
                    approvedUntil: 1, remainingBuilds: 0,
                    ...(state === 'unknown' ? { lockOperationId: 'unknown-operation' } : {}),
                    ...(state === 'stale' ? { liveReleaseId: undefined, liveDeploymentId: undefined } : {}),
                });
                await f.rejectsWithoutWrites({}, 'CLOUD_RELEASE_BUSY');
            }
        }
    });

    it('rejects a duplicate even when the first indexed result is the exact current destination', async () => {
        for (const collision of ['provider', 'hostname']) {
            const f = fixture();
            f.existing();
            f.existing({
                _id: 'second-destination', projectId: 'other-project', branchId: 'other-branch', key: 'other-key',
                ...(collision === 'provider' ? { hostname: 'other.vercel.app' } : { providerProjectId: 'prj_other' }),
            });
            await f.rejectsWithoutWrites({}, 'CLOUD_RELEASE_BUSY');
            expect(f.reads.every(read => read.limit === 2)).toBe(true);
        }
    });

    it('allows proof updates without a key only with unchanged allowance and omits budget fields from the patch', async () => {
        const f = fixture();
        const destination = f.existing();
        await f.configure({ grantKey: undefined });
        expect(destination.generation).toBe(8);
        expect(destination.reviewGatewayVerified).toBe(false);
        expect(destination.liveReleaseId).toBe('live-release');
        expect(destination.remainingBuilds).toBe(2);
        expect(f.writes[0]?.value).not.toHaveProperty('remainingBuilds');
        expect(f.writes[0]?.value).not.toHaveProperty('approvedUntil');
        expect(f.rows('cloudReleaseBuildGrants')).toHaveLength(0);
        await f.rejectsWithoutWrites({ grantKey: undefined, builds: 3 }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        await f.rejectsWithoutWrites({ grantKey: undefined, approvedUntil: f.args.approvedUntil + 1 }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
    });

    it('does not refill consumed builds or overwrite current proofs on an exact grant retry', async () => {
        const f = fixture();
        await f.configure();
        const destination = f.rows('cloudReleaseDestinations')[0]!;
        Object.assign(destination, { remainingBuilds: 0, reviewGatewayVerified: true, publicAliasVerified: true, generation: 9 });
        f.writes.length = 0;
        const before = structuredClone(f.tables);
        await f.configure();
        expect(f.writes).toEqual([]);
        expect(f.tables).toEqual(before);
    });

    it('replaces allowance for a new grant and treats A then B then A as a no-op replay', async () => {
        const f = fixture();
        await f.configure();
        const destination = f.rows('cloudReleaseDestinations')[0]!;
        destination.remainingBuilds = 1;
        await f.configure({ grantKey: grantB, builds: 3, approvedUntil: f.args.approvedUntil + 1 });
        expect(destination.remainingBuilds).toBe(3);
        destination.remainingBuilds = 2;
        f.writes.length = 0;
        const before = structuredClone(f.tables);
        await f.configure();
        expect(f.tables).toEqual(before);
        expect(f.writes).toEqual([]);
        expect(f.rows('cloudReleaseBuildGrants')).toHaveLength(2);
    });

    it('rejects reuse of a grant key with a changed build count or deadline before any write', async () => {
        const f = fixture();
        await f.configure();
        await f.rejectsWithoutWrites({ builds: 3 }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        await f.rejectsWithoutWrites({ approvedUntil: f.args.approvedUntil + 1 }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
    });

    it('accepts an expired exact receipt without extending allowance and validates time only for new grants', async () => {
        const f = fixture();
        const destination = f.existing({ approvedUntil: 1, remainingBuilds: 0 });
        f.seed('cloudReleaseBuildGrants', { destinationId: destination._id, grantKey: grantA, builds: 2, approvedUntil: 1 });
        const before = structuredClone(f.tables);
        await f.configure({ approvedUntil: 1 });
        expect(f.tables).toEqual(before);
        expect(f.writes).toEqual([]);
        await f.rejectsWithoutWrites({ grantKey: grantB, approvedUntil: 1 }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        await f.rejectsWithoutWrites({ grantKey: grantB, approvedUntil: Date.now() + 8 * 86400_000 }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        await f.configure({ grantKey: undefined, builds: 0, approvedUntil: 1 });
        expect(destination.approvedUntil).toBe(1);
        expect(destination.remainingBuilds).toBe(0);
    });

    it('rejects unsafe numbers and malformed grant keys', async () => {
        for (const builds of [NaN, Infinity, -1, 9, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
            await fixture().rejectsWithoutWrites({ builds }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        }
        for (const approvedUntil of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
            await fixture().rejectsWithoutWrites({ approvedUntil }, 'CLOUD_RELEASE_INVALID_ALLOWANCE');
        }
        for (const grantKey of ['', 'short', 'x'.repeat(81), 'invalid grant key']) {
            await fixture().rejectsWithoutWrites({ grantKey }, 'CLOUD_INVALID_OPERATION');
        }
    });

    it('validates locks, project/branch ownership and collisions before accepting any replay', async () => {
        for (const change of ['lock', 'project', 'branch', 'branch-owner', 'branch-destination', 'collision']) {
            const f = fixture();
            const destination = f.existing();
            f.seed('cloudReleaseBuildGrants', { destinationId: destination._id, grantKey: grantA, builds: 2, approvedUntil: f.args.approvedUntil });
            if (change === 'lock') destination.lockOperationId = 'unknown-operation';
            if (change === 'project') destination.projectId = 'other-project';
            if (change === 'branch') destination.branchId = 'other-branch';
            if (change === 'branch-owner') f.rows('branches')[0]!.projectId = 'other-project';
            if (change === 'branch-destination') {
                destination.branchId = 'other-branch';
                f.existing({ _id: 'other-destination', key: 'other-key', providerProjectId: 'prj_other', hostname: 'other.vercel.app' });
            }
            if (change === 'collision') f.existing({ _id: 'collision', branchId: 'other-branch', key: 'other-key', hostname: 'other.vercel.app' });
            await f.rejectsWithoutWrites({}, change === 'branch-owner' ? 'CLOUD_NOT_ENROLLED' : 'CLOUD_RELEASE_BUSY');
        }
    });
});
