import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { authorize, exchange, issue, reviewDigest } from '../cloudReleaseReviewAccess';
import { destinationKey } from './cloudReleasePolicy';
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const releaseId = 'cloudReleases:one' as Id<'cloudReleases'>;
const destinationId = 'cloudReleaseDestinations:one';
const credentialId = 'cloudReleaseCredentials:one';
const providerPins = { teamId: 'team_test', providerProjectId: 'prj_test', hostname: 'site.vercel.app' };
const key = destinationKey(providerPins.teamId, providerPins.providerProjectId, providerPins.hostname);
const verifier = 'ab'.repeat(32), session = 'cd'.repeat(32);
type Row = Record<string, unknown> & { _id: string };

// Real registered handlers and permission code, with only auth/database IO replaced.
// This fixture does not simulate Convex rollback or argument validation.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => {
        let rows = tables.get(name);
        if (!rows) { rows = new Map(); tables.set(name, rows); }
        return rows;
    };
    const put = (name: string, id: string, values: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...values });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject: string | null = 'creator';
    let sequence = 0;
    const reads: string[] = [];
    put('workspaces', 'workspaces:one', { createdByUserId: 'users:owner' });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    put('cloudEditorStates', 'cloudEditorStates:one', {
        ...scope, workspaceId: 'workspaces:one', version: 1, createdByUserId: 'users:creator',
        status: 'ready', sandboxId: 'runtime-one', expiresAt: Date.now() + 900_000,
        previewToken: 'ab'.repeat(32), previewGatewayVersion: 2,
    });
    for (const name of ['creator', 'content', 'outsider']) {
        put('users', `users:${name}`, { clerkUserId: name, email: `${name}@example.com` });
        put('projectMembers', `projectMembers:${name}`, { projectId: scope.projectId, userId: `users:${name}`, role: name === 'creator' ? 'manager' : 'viewer' });
    }
    put('cloudEditorGrants', 'cloudEditorGrants:content', { projectId: scope.projectId, userId: 'users:content', role: 'content', publish: false });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => { reads.push(id); return get(id); },
            insert: async (name: string, values: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, values); return id; },
            replace: async (id: string, values: Record<string, unknown>) => put(id.split(':')[0]!, id, values),
            patch: async (id: string, values: Record<string, unknown>) => put(id.split(':')[0]!, id, { ...get(id), ...values }),
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); },
            query: (name: string) => {
                reads.push(name);
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => constraints.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => rows(), take: async (n: number) => rows().slice(0, n),
                    unique: async () => { const found = rows(); if (found.length > 1) throw new Error('Nonunique row'); return found[0] ?? null; },
                };
                return query;
            },
        },
    } as unknown as MutationCtx;
    put('cloudReleases', releaseId, { purpose: 'release', ...scope, workspaceId: 'workspaces:one', status: 'ready', hash: 'hash-one', deploymentId: 'dpl-one', deploymentUrl: 'https://one.vercel.app', builtDestinationKey: key });
    put('cloudReleaseDestinations', destinationId, { ...scope, key, generation: 1, ...providerPins,
        registrationVersion: 1, workspaceId: 'workspaces:one', credentialId, credentialVersion: 1, credentialHash: 'a'.repeat(64), providerProof: 'b'.repeat(64),
        reviewGatewayVerified: true, drifted: false, approvedUntil: Date.now() + 3600000 });
    put('cloudReleaseCredentials', credentialId, { ...scope, destinationId, workspaceId: 'workspaces:one', ...providerPins,
        version: 1, ciphertext: 'synthetic-encrypted-credential', ciphertextHash: 'a'.repeat(64), providerProof: 'b'.repeat(64), expiresAt: Date.now() + 3600000 });
    return { ctx, table, get, put, reads, signIn: (name: string | null) => { subject = name; } };
}

const settings = {
    WEBLAB_CLOUD_EDITOR_ENABLED: 'true', WEBLAB_CLOUD_RELEASES_ENABLED: 'true',
    WEBLAB_CLOUD_RELEASE_REVIEW_SECRET: verifier, WEBLAB_CLOUD_RELEASE_APP_ORIGIN: 'https://app.example.com',
    WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX: 'reviews.example.net', CLERK_JWT_ISSUER_DOMAIN: 'https://auth.example.com',
    WEBLAB_CLOUD_RELEASE_TEAM_ID: 'team_test', WEBLAB_CLOUD_RELEASE_PROJECT_ID: 'prj_test', WEBLAB_CLOUD_RELEASE_HOSTNAME: 'site.vercel.app',
    WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS: 'team_test',
};
const previous = new Map<string, string | undefined>();
beforeEach(() => { for (const [key, value] of Object.entries(settings)) { previous.set(key, process.env[key]); process.env[key] = value; } });
afterEach(() => { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } previous.clear(); });
async function open(f: ReturnType<typeof fixture>) {
    const issued = await issue._handler(f.ctx, { releaseId });
    const result = await exchange._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, ticket: issued.ticket, sessionHash: await reviewDigest(session) });
    return { issued, result };
}
describe('release-only review capabilities', () => {
    it('refuses any partial hosting marker at issue and on an existing private review session', async () => {
        for (const marker of ['importedHosting', 'importedHostingRequest', 'importedHostingBuildPolicyJson']) {
            const f = fixture();
            await open(f);
            f.get(releaseId)![marker] = marker.endsWith('Json') ? '{}' : {};
            const before = structuredClone([...f.table('cloudReleaseReviewTickets').values()]);
            await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
            expect(await authorize._handler(f.ctx, { protocol: 2, releaseId, verifier, session })).toBeNull();
            expect([...f.table('cloudReleaseReviewTickets').values()]).toEqual(before);
        }
    });

    it('revokes existing review sessions as soon as removal starts, including partial tombstones', async () => {
        for (const marker of [{ removal: {} }, { removedAt: 123 }]) {
            const f = fixture(); await open(f); Object.assign(f.get(releaseId)!, marker);
            await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
            expect(await authorize._handler(f.ctx, { protocol: 2, releaseId, verifier, session })).toBeNull();
        }
    });
    it('refuses ready imported artifacts and backups before any destination or credential lookup', async () => {
        for (const changes of [
            { artifactProfile: 'imported-next-private-v1', purpose: 'private-artifact' },
            { artifactProfile: 'imported-next-private-v1', purpose: 'release' },
            { purpose: 'backup' },
        ]) {
            const f = fixture(); Object.assign(f.get(releaseId)!, changes);
            await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
            expect(f.reads).toEqual([releaseId]);
            expect(f.table('cloudReleaseReviewTickets').size).toBe(0);
            const active = fixture(); await open(active);
            Object.assign(active.get(releaseId)!, changes); active.reads.length = 0;
            expect(await authorize._handler(active.ctx, { protocol: 2, releaseId, verifier, session })).toBeNull();
            expect(active.reads).toEqual(['cloudReleaseReviewTickets', releaseId]);
        }
    });

    it('allows a current responsible manager to prove the gateway against a real ready build', async () => {
        const f = fixture(); f.get(destinationId)!.reviewGatewayVerified = false;
        const { result } = await open(f);
        expect(result?.deploymentId).toBe('dpl-one');
        f.signIn(null);
        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toEqual(result);
    });
    it('refuses bootstrap tickets to content, designers and responsible users without invite authority', async () => {
        for (const role of ['content', 'designer', 'responsible']) {
            const f = fixture(); f.get(destinationId)!.reviewGatewayVerified = false;
            f.get('cloudEditorGrants:content')!.role = role;
            f.signIn('content');
            await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow('CLOUD_RELEASE_NOT_ALLOWED');
            expect(f.table('cloudReleaseReviewTickets').size).toBe(0);
        }
    });
    it('rechecks both manager role and invite authority at bootstrap exchange and every authorized request', async () => {
        for (const change of [
            (f: ReturnType<typeof fixture>) => f.put('cloudEditorGrants', 'cloudEditorGrants:creator', { projectId: scope.projectId, userId: 'users:creator', role: 'designer', publish: true }),
            (f: ReturnType<typeof fixture>) => { f.get('projectMembers:creator')!.role = 'viewer'; },
        ]) {
            const pending = fixture(); pending.get(destinationId)!.reviewGatewayVerified = false;
            const issued = await issue._handler(pending.ctx, { releaseId });
            change(pending);
            expect(await exchange._handler(pending.ctx, { protocol: 2 as const, releaseId, verifier, ticket: issued.ticket, sessionHash: await reviewDigest(session) })).toBeNull();
            const active = fixture(); active.get(destinationId)!.reviewGatewayVerified = false;
            await open(active); change(active);
            expect(await authorize._handler(active.ctx, { protocol: 2 as const, releaseId, verifier, session })).toBeNull();
        }
    });
    it('exchanges once, stores hashes only and authorizes without Clerk on the gateway', async () => {
        const f = fixture(), { issued, result } = await open(f);
        expect(result?.deploymentId).toBe('dpl-one');
        expect(result).toMatchObject({ destinationId, generation: 1, credentialId, credentialVersion: 1,
            credentialHash: 'a'.repeat(64), providerProof: 'b'.repeat(64), ...providerPins });
        expect(result).not.toHaveProperty('ciphertext');
        expect(issued.url).not.toContain(issued.ticket);
        const stored = JSON.stringify([...f.table('cloudReleaseReviewTickets').values()]);
        expect(stored).not.toContain(issued.ticket); expect(stored).not.toContain(session);
        f.signIn(null);
        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toEqual(result);
        expect(await exchange._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, ticket: issued.ticket, sessionHash: await reviewDigest(session) })).toBeNull();
    });
    it('rejects the wrong verifier, wrong release, and expired or unknown session', async () => {
        const f = fixture(); await open(f);
        for (const args of [
            { protocol: 2 as const, releaseId, verifier: 'ef'.repeat(32), session },
            { protocol: 2 as const, releaseId: 'cloudReleases:other' as Id<'cloudReleases'>, verifier, session },
            { protocol: 2 as const, releaseId, verifier, session: 'ef'.repeat(32) },
        ]) expect(await authorize._handler(f.ctx, args)).toBeNull();
        const row = [...f.table('cloudReleaseReviewTickets').values()][0]!; row.expiresAt = Date.now() - 1;
        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toBeNull();
    });
    it('refuses replay after reissue and expires the pending exchange', async () => {
        const f = fixture(), first = await open(f);
        const second = await issue._handler(f.ctx, { releaseId });
        expect(second.ticket).not.toBe(first.issued.ticket);
        expect(f.table('cloudReleaseReviewTickets').size).toBe(1);
        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toBeNull();
        const row = [...f.table('cloudReleaseReviewTickets').values()][0]!; row.exchangeExpiresAt = Date.now() - 1;
        expect(await exchange._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, ticket: second.ticket, sessionHash: await reviewDigest(session) })).toBeNull();
    });
    it('checks current ordinary membership and cloud grant on every request', async () => {
        const f = fixture(); f.signIn('content'); await open(f);
        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).not.toBeNull();
        f.table('projectMembers').delete('projectMembers:content');
        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toBeNull();
        f.put('projectMembers', 'projectMembers:content', { projectId: scope.projectId, userId: 'users:content', role: 'viewer' });
        f.table('cloudEditorGrants').delete('cloudEditorGrants:content');
        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toBeNull();
    });
    it('revokes on deletion, deployment replacement, destination drift or generation change', async () => {
        for (const change of [
            (f: ReturnType<typeof fixture>) => f.table('projects').delete(scope.projectId),
            (f: ReturnType<typeof fixture>) => { f.get(releaseId)!.deploymentId = 'different'; },
            (f: ReturnType<typeof fixture>) => { f.get(destinationId)!.drifted = true; },
            (f: ReturnType<typeof fixture>) => { f.get(destinationId)!.generation = 2; },
            (f: ReturnType<typeof fixture>) => { f.get(destinationId)!.reviewGatewayVerified = false; },
        ]) {
            const f = fixture(); f.signIn('content'); await open(f); change(f);
            expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toBeNull();
        }
    });
    it('refuses issue without current app identity or isolated verified configuration', async () => {
        const f = fixture(); f.signIn(null);
        await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow();
        f.signIn('creator'); process.env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX = 'reviews.example.com';
        await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow();
    });
    it('refuses legacy registration despite matching old environment pins', async () => {
        const f = fixture();
        for (const field of ['registrationVersion', 'workspaceId', 'credentialId', 'credentialVersion', 'credentialHash', 'providerProof']) delete f.get(destinationId)![field];
        await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
        expect(f.table('cloudReleaseReviewTickets').size).toBe(0);
    });
    it('rechecks account approval and credential validity at issue, exchange and every request', async () => {
        const changes: Array<(f: ReturnType<typeof fixture>) => void> = [
            () => { process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = ''; },
            () => { process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = 'team_other'; },
            f => { f.get(credentialId)!.revokedAt = Date.now(); },
            f => { f.get(credentialId)!.expiresAt = 1; },
            f => { f.table('cloudReleaseCredentials').delete(credentialId); },
            f => { f.get(credentialId)!.destinationId = 'cloudReleaseDestinations:other'; },
            f => { f.get(credentialId)!.workspaceId = 'workspaces:other'; },
            f => { f.get(credentialId)!.providerProjectId = 'prj_other'; },
            f => { f.get(credentialId)!.hostname = 'other.vercel.app'; },
            f => { f.get(credentialId)!.version = 2; },
            f => { f.get(credentialId)!.ciphertextHash = 'c'.repeat(64); },
            f => { f.get(credentialId)!.providerProof = 'd'.repeat(64); },
        ];
        for (const change of changes) {
            for (const phase of ['issue', 'exchange', 'authorize']) {
                process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = settings.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
                const f = fixture();
                try {
                    if (phase === 'issue') {
                        change(f);
                        await expect(issue._handler(f.ctx, { releaseId })).rejects.toThrow('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
                        expect(f.table('cloudReleaseReviewTickets').size).toBe(0);
                    } else if (phase === 'exchange') {
                        const issued = await issue._handler(f.ctx, { releaseId });
                        change(f);
                        const before = structuredClone([...f.table('cloudReleaseReviewTickets').values()]);
                        expect(await exchange._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, ticket: issued.ticket, sessionHash: await reviewDigest(session) })).toBeNull();
                        expect([...f.table('cloudReleaseReviewTickets').values()]).toEqual(before);
                    } else {
                        await open(f); change(f);
                        expect(await authorize._handler(f.ctx, { protocol: 2 as const, releaseId, verifier, session })).toBeNull();
                    }
                } finally {
                    process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS = settings.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
                }
            }
        }
    });
});


describe('private review protocol migration', () => {
    it('refuses legacy gateway requests even with otherwise valid authority', async () => {
        const f = fixture();
        const { result } = await open(f);
        expect(result).not.toBeNull();
        const legacyAuthorize = { releaseId, verifier, session } as Parameters<typeof authorize._handler>[1];
        expect(await authorize._handler(f.ctx, legacyAuthorize)).toBeNull();
        expect(await authorize._handler(f.ctx, { protocol: 2, releaseId, verifier, session })).toEqual(result);
        const pending = fixture();
        const issued = await issue._handler(pending.ctx, { releaseId });
        const before = structuredClone(pending.table('cloudReleaseReviewTickets'));
        const legacyExchange = { releaseId, verifier, ticket: issued.ticket, sessionHash: await reviewDigest(session) } as Parameters<typeof exchange._handler>[1];
        expect(await exchange._handler(pending.ctx, legacyExchange)).toBeNull();
        expect(pending.table('cloudReleaseReviewTickets')).toEqual(before);
        expect(await exchange._handler(pending.ctx, { ...legacyExchange, protocol: 2 })).not.toBeNull();
    });
});
