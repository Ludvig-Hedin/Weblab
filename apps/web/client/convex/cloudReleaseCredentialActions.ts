'use node';

import { timingSafeEqual } from 'node:crypto';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { action, internalAction } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { openRegisteredReleaseCredential, sealReleaseCredential } from './lib/cloudReleaseCredentialEnvelope';
import type { ReleaseReviewTarget } from './lib/cloudReleaseReviewTarget';
import { sameReleaseReviewTarget } from './lib/cloudReleaseReviewTarget';
import { assertRetainedReviewMedia, type RetainedReviewMedia } from './lib/cloudReleaseReviewMedia';
import { CloudReleaseVercel } from './lib/cloudReleaseVercel';
import type { IMPORTED_HOSTING_PROFILE } from './lib/cloudImportedHostingState';

type RegistrationScope = { destinationId: Id<'cloudReleaseDestinations'>; expectedGeneration: number };
type RegistrationInput = { destination: Doc<'cloudReleaseDestinations'>; workspaceId: Id<'workspaces'> };
const inputRef = makeFunctionReference<'query', RegistrationScope, RegistrationInput>('cloudReleaseCredentials:_registrationInput');
const registerRef = makeFunctionReference<'mutation', RegistrationScope & {
    expectedLiveDeploymentId: string | null; expectedWorkspaceId: Id<'workspaces'>; ciphertext: string; ciphertextHash: string; providerProof: string; expiresAt: number;
    expectedHostingProfile?: typeof IMPORTED_HOSTING_PROFILE;
}, { generation: number; credentialId: Id<'cloudReleaseCredentials'>; credentialVersion: number }>('cloudReleaseCredentials:_register');
type ReviewContext = { target: ReleaseReviewTarget & { expiresAt: number }; credential: Doc<'cloudReleaseCredentials'>; media?: RetainedReviewMedia };
const contextRef = makeFunctionReference<'query', { releaseId: Id<'cloudReleases'>; session: string; mediaRequest?: { path: string[]; search: string } }, ReviewContext | null>('cloudReleaseReviewAccess:_credentialContext');

/** Operator-only registration. Provider reads only; grants and publishing remain separate. */
export const register = internalAction({
    args: { destinationId: v.id('cloudReleaseDestinations'), expectedGeneration: v.number(), token: v.string(), bypass: v.string(), expiresAt: v.number() },
    handler: async (ctx, args): Promise<{ generation: number; credentialId: Id<'cloudReleaseCredentials'>; credentialVersion: number }> => {
        const scope = { destinationId: args.destinationId, expectedGeneration: args.expectedGeneration };
        const { destination, workspaceId } = await ctx.runQuery(inputRef, scope);
        const binding = { destinationId: destination._id, workspaceId, projectId: destination.projectId, branchId: destination.branchId,
            teamId: destination.teamId, providerProjectId: destination.providerProjectId, hostname: destination.hostname,
            version: (destination.credentialVersion ?? 0) + 1,
            ...(destination.hostingProfile === undefined ? {} : { hostingProfile: destination.hostingProfile }) };
        // Validate and encrypt before any credential-bearing request. Nothing is persisted yet.
        const sealed = sealReleaseCredential(binding, { token: args.token, bypass: args.bypass });
        const provider = new CloudReleaseVercel({ token: args.token, bypass: args.bypass, teamId: destination.teamId,
            projectId: destination.providerProjectId, hostname: destination.hostname,
            ...(destination.hostingProfile === undefined ? {} : { hostingProfile: destination.hostingProfile }) }, AbortSignal.timeout(30_000));
        const providerProof = await provider.verifyProject();
        if (await provider.aliasTarget() !== (destination.liveDeploymentId ?? null)) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
        return ctx.runMutation(registerRef, { ...scope, ...sealed, providerProof, expiresAt: args.expiresAt,
            expectedLiveDeploymentId: destination.liveDeploymentId ?? null, expectedWorkspaceId: workspaceId,
            ...(destination.hostingProfile === undefined ? {} : { expectedHostingProfile: destination.hostingProfile }) });
    },
});

export function releaseVerifierAllowed(value: string): boolean {
    const expected = process.env.WEBLAB_CLOUD_RELEASE_REVIEW_SECRET ?? '';
    return /^[a-f0-9]{64}$/.test(value) && /^[a-f0-9]{64}$/.test(expected) &&
        timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(expected, 'hex'));
}

/** Server-authenticated endpoint. Never expose its reference or response in a browser bundle. */
export const reviewContext = action({
    args: { releaseId: v.id('cloudReleases'), session: v.string(), verifier: v.string(), mediaRequest: v.optional(v.object({ path: v.array(v.string()), search: v.string() })) },
    handler: async (ctx, args) => {
        if (!releaseVerifierAllowed(args.verifier) || !/^[a-f0-9]{64}$/.test(args.session)) return null;
        const scope = { releaseId: args.releaseId, session: args.session, ...(args.mediaRequest === undefined ? {} : { mediaRequest: args.mediaRequest }) };
        const current = await ctx.runQuery(contextRef, scope);
        if (!current) return null;
        try {
            const credentials = openRegisteredReleaseCredential(current.credential);
            const fresh = await ctx.runQuery(contextRef, scope);
            if (!fresh || !sameReleaseReviewTarget(current.target, fresh.target)) return null;
            if (current.media !== undefined || fresh.media !== undefined) {
                if (current.media === undefined || fresh.media === undefined || !args.mediaRequest || fresh.target.hostingProfile !== 'imported-next-hosting-v1') return null;
                assertRetainedReviewMedia(current.media, current.target.hash, args.mediaRequest.path, args.mediaRequest.search);
                assertRetainedReviewMedia(fresh.media, fresh.target.hash, args.mediaRequest.path, args.mediaRequest.search);
                if (current.media.path !== fresh.media.path || current.media.hash !== fresh.media.hash || current.media.bytes !== fresh.media.bytes ||
                    current.media.contentType !== fresh.media.contentType) return null;
            }
            return { target: fresh.target, ...credentials, ...(fresh.media !== undefined ? { media: fresh.media } : {}) };
        } catch { return null; }
    },
});
