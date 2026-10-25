import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ActionCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { register, reviewContext } from '../cloudReleaseCredentialActions';
import { openReleaseCredential, sealReleaseCredential } from './cloudReleaseCredentialEnvelope';
import { CloudReleaseVercel } from './cloudReleaseVercel';
import type { ReleaseReviewTarget } from './cloudReleaseReviewTarget';
import type { RetainedReviewMedia } from './cloudReleaseReviewMedia';

const verifier = 'a'.repeat(64);
const session = 'b'.repeat(64);
const args = { releaseId: 'release-one' as Id<'cloudReleases'>, session, verifier };
const binding = { destinationId: 'destination-one', workspaceId: 'workspace-one', projectId: 'project-one', branchId: 'branch-one',
    teamId: 'team_one', providerProjectId: 'prj_one', hostname: 'site-one.vercel.app', version: 1 };
const environment = ['PROVIDER_TOKEN_ENCRYPTION_KEY', 'WEBLAB_CLOUD_RELEASE_REVIEW_SECRET'] as const;
let previous: Array<string | undefined>;
beforeEach(() => {
    previous = environment.map(key => process.env[key]);
    process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    process.env.WEBLAB_CLOUD_RELEASE_REVIEW_SECRET = verifier;
});
afterEach(() => environment.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
}));

function fixture(imported = false, media?: RetainedReviewMedia) {
    const scoped = { ...binding, ...(imported ? { hostingProfile: 'imported-next-hosting-v1' as const } : {}) };
    const sealed = sealReleaseCredential(scoped, { token: 'provider-token', bypass: 'site-bypass' });
    const target: ReleaseReviewTarget & { expiresAt: number } = { ...scoped, deploymentUrl: 'https://immutable-one.vercel.app', deploymentId: 'dpl_one', hash: 'c'.repeat(64),
        ...(imported ? { deployHash: 'e'.repeat(64), buildPolicyHash: 'f'.repeat(64) } : {}),
        generation: 2, credentialId: 'credential-one', credentialVersion: 1, credentialHash: sealed.ciphertextHash,
        providerProof: 'd'.repeat(64), expiresAt: Date.now() + 60_000 };
    const credential = { ...scoped, ...sealed, _id: 'credential-one', _creationTime: 1, expiresAt: target.expiresAt, providerProof: target.providerProof };
    let reads = 0;
    let second: { target: typeof target; credential: typeof credential; media?: RetainedReviewMedia } | null | undefined;
    const ctx = { runQuery: async () => { reads++; return reads > 1 && second !== undefined ? second : { target, credential, ...(media ? { media } : {}) }; } } as unknown as ActionCtx;
    return { ctx, target, credential, reads: () => reads, next: (value: typeof second) => { second = value; } };
}

describe('server-only release credential action', () => {
    const media: RetainedReviewMedia = { kind: 'imported-retained-media-v1', releaseHash: 'c'.repeat(64), path: 'public/hero.mp4',
        hash: 'a'.repeat(64), bytes: 22_695_161, contentType: 'video/mp4' };
    const mediaRequest = { path: ['hero.mp4'], search: '' };
    it('returns retained media only when both current authorizations bind the same immutable tuple', async () => {
        const f = fixture(true, media);
        expect(await reviewContext._handler(f.ctx, { ...args, mediaRequest })).toEqual({ target: f.target, token: 'provider-token', bypass: 'site-bypass', media });
    });
    it('refuses explicitly supplied falsy media instead of returning ordinary proxy credentials', async () => {
        for (const invalid of [null, false, 0, '']) {
            const f = fixture(true);
            const ctx = { runQuery: async () => ({ target: f.target, credential: f.credential, media: invalid }) } as unknown as ActionCtx;
            expect(await reviewContext._handler(ctx, { ...args, mediaRequest })).toBeNull();
        }
    });
    it('refuses media or imported identity drift before returning provider credentials', async () => {
        for (const changed of ['missing', 'hash', 'size', 'path', 'type', 'policy', 'profile', 'query'] as const) {
            const f = fixture(true, media), nextMedia = { ...media }, nextTarget = { ...f.target };
            if (changed === 'hash') nextMedia.hash = 'e'.repeat(64);
            if (changed === 'size') nextMedia.bytes++;
            if (changed === 'path') nextMedia.path = 'public/other.mp4';
            if (changed === 'type') nextMedia.contentType = 'text/html';
            if (changed === 'policy') nextTarget.buildPolicyHash = 'b'.repeat(64);
            if (changed === 'profile') delete nextTarget.hostingProfile;
            f.next({ target: nextTarget, credential: f.credential, ...(changed === 'missing' ? {} : { media: nextMedia }) });
            expect(await reviewContext._handler(f.ctx, { ...args, mediaRequest: { ...mediaRequest, search: changed === 'query' ? '?x=1' : '' } })).toBeNull();
        }
    });
    it('refuses missing, malformed and wrong verifier before reading credential storage', async () => {
        for (const invalid of ['', 'a', 'f'.repeat(64)]) {
            const f = fixture();
            expect(await reviewContext._handler(f.ctx, { ...args, verifier: invalid })).toBeNull();
            expect(f.reads()).toBe(0);
        }
        const f = fixture();
        expect(await reviewContext._handler(f.ctx, { ...args, session: 'invalid' })).toBeNull();
        expect(f.reads()).toBe(0);
    });
    it('unwraps the exact registered row only after current session authorization', async () => {
        const f = fixture();
        expect(await reviewContext._handler(f.ctx, args)).toEqual({ target: f.target, token: 'provider-token', bypass: 'site-bypass' });
        expect(f.reads()).toBe(2);
    });
    it('refuses changed generation and membership between authorization and credential return', async () => {
        for (const revoked of [false, true]) {
            const f = fixture();
            f.next(revoked ? null : { target: { ...f.target, generation: 3 }, credential: f.credential });
            expect(await reviewContext._handler(f.ctx, args)).toBeNull();
        }
    });
    it('refuses ciphertext transplanted to another site without returning secret-bearing errors', async () => {
        const f = fixture();
        f.credential.hostname = 'other-site.vercel.app';
        expect(await reviewContext._handler(f.ctx, args)).toBeNull();
    });
});

describe('operator registration action', () => {
    it('derives imported provider profile and envelope from the pinned destination and includes it in final CAS', async () => {
        const hostingProfile = 'imported-next-hosting-v1' as const;
        let observedProfile: unknown;
        const proof = spyOn(CloudReleaseVercel.prototype, 'verifyProject').mockImplementation(async function (this: CloudReleaseVercel) {
            observedProfile = (this as unknown as { input: { hostingProfile?: string } }).input.hostingProfile;
            return 'd'.repeat(64);
        });
        const alias = spyOn(CloudReleaseVercel.prototype, 'aliasTarget').mockResolvedValue(null);
        const writes: Record<string, unknown>[] = [];
        const destination = { ...binding, hostingProfile, _id: binding.destinationId, generation: 1, credentialVersion: undefined };
        const ctx = { runQuery: async () => ({ destination, workspaceId: binding.workspaceId }),
            runMutation: async (_ref: unknown, value: Record<string, unknown>) => { writes.push(value); return { generation: 2, credentialId: 'credential-imported', credentialVersion: 1 }; } } as unknown as ActionCtx;
        try {
            await register._handler(ctx, { destinationId: binding.destinationId as Id<'cloudReleaseDestinations'>, expectedGeneration: 1,
                token: 'provider-token', bypass: 'site-bypass', expiresAt: Date.now() + 60_000 });
            expect(observedProfile).toBe(hostingProfile); expect(writes).toHaveLength(1);
            expect(writes[0]).toMatchObject({ expectedHostingProfile: hostingProfile, expectedGeneration: 1, expectedWorkspaceId: binding.workspaceId });
            const sealed = { ciphertext: String(writes[0]!.ciphertext), ciphertextHash: String(writes[0]!.ciphertextHash) };
            expect(openReleaseCredential({ ...binding, hostingProfile }, sealed)).toEqual({ token: 'provider-token', bypass: 'site-bypass' });
            expect(() => openReleaseCredential(binding, sealed)).toThrow('CLOUD_RELEASE_CREDENTIAL_INVALID');
            expect(JSON.stringify(writes)).not.toContain('provider-token'); expect(JSON.stringify(writes)).not.toContain('site-bypass');
        } finally { proof.mockRestore(); alias.mockRestore(); }
    });
    it('does not finalize registration when imported provider proof refuses settings', async () => {
        const proof = spyOn(CloudReleaseVercel.prototype, 'verifyProject').mockRejectedValue(new Error('CLOUD_RELEASE_PROVIDER_SETUP'));
        const alias = spyOn(CloudReleaseVercel.prototype, 'aliasTarget').mockResolvedValue(null);
        let writes = 0;
        const destination = { ...binding, hostingProfile: 'imported-next-hosting-v1', _id: binding.destinationId, credentialVersion: undefined };
        const ctx = { runQuery: async () => ({ destination, workspaceId: binding.workspaceId }), runMutation: async () => { writes++; } } as unknown as ActionCtx;
        try {
            await expect(register._handler(ctx, { destinationId: binding.destinationId as Id<'cloudReleaseDestinations'>, expectedGeneration: 1,
                token: 'provider-token', bypass: 'site-bypass', expiresAt: Date.now() + 60_000 })).rejects.toThrow('CLOUD_RELEASE_PROVIDER_SETUP');
            expect(writes).toBe(0); expect(alias).not.toHaveBeenCalled();
        } finally { proof.mockRestore(); alias.mockRestore(); }
    });
    it('does provider reads and submits one compare-and-swap with encrypted credentials', async () => {
        const proof = spyOn(CloudReleaseVercel.prototype, 'verifyProject').mockResolvedValue('d'.repeat(64));
        const alias = spyOn(CloudReleaseVercel.prototype, 'aliasTarget').mockResolvedValue(null);
        const writes: Record<string, unknown>[] = [];
        const destination = { ...binding, _id: binding.destinationId, generation: 1, credentialVersion: undefined };
        const ctx = { runQuery: async () => ({ destination, workspaceId: binding.workspaceId }),
            runMutation: async (_ref: unknown, value: Record<string, unknown>) => { writes.push(value); return { generation: 2, credentialId: 'credential-one', credentialVersion: 1 }; } } as unknown as ActionCtx;
        try {
            await register._handler(ctx, { destinationId: binding.destinationId as Id<'cloudReleaseDestinations'>, expectedGeneration: 1,
                token: 'provider-token', bypass: 'site-bypass', expiresAt: Date.now() + 60_000 });
            expect(writes).toHaveLength(1);
            expect(writes[0]?.expectedGeneration).toBe(1);
            expect(writes[0]?.expectedLiveDeploymentId).toBeNull();
            expect(writes[0]?.providerProof).toBe('d'.repeat(64));
            expect(writes[0]).not.toHaveProperty('expectedHostingProfile');
            expect(JSON.stringify(writes)).not.toContain('provider-token');
            expect(JSON.stringify(writes)).not.toContain('site-bypass');
            alias.mockResolvedValue('dpl_someone_else');
            await expect(register._handler(ctx, { destinationId: binding.destinationId as Id<'cloudReleaseDestinations'>, expectedGeneration: 1,
                token: 'provider-token', bypass: 'site-bypass', expiresAt: Date.now() + 60_000 })).rejects.toThrow('CLOUD_RELEASE_ALIAS_CHANGED');
            expect(writes).toHaveLength(1);
        } finally { proof.mockRestore(); alias.mockRestore(); }
    });
});
