import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { nativeReleasePins } from './lib/nativeReleaseContract';

/** Retained global identities, reservations and receipts must survive scope/connection deletion.
 * This slice has no registrar. A later trusted provider verifier must populate these records;
 * no public input may establish provider identity or reset an existing destination generation.
 */
export const nativeReleaseTables = {
    nativeReleaseDestinations: defineTable({
        key: v.string(), provider: v.literal('vercel'), providerAccountId: v.string(), providerProjectId: v.string(),
        generation: v.number(), verifiedAt: v.number(), revokedAt: v.optional(v.number()),
        liveDeploymentId: v.union(v.string(), v.null()),
        lockOperationId: v.optional(v.id('nativeReleaseOperations')),
    }).index('by_key', ['key']),
    nativeReleaseConnections: defineTable({
        destinationId: v.id('nativeReleaseDestinations'), actorId: v.id('users'),
        projectId: v.id('projects'), branchId: v.id('branches'), callerKey: v.string(),
        generation: v.number(), credentialVersion: v.number(), verifiedAt: v.number(),
        expiresAt: v.number(), revokedAt: v.optional(v.number()),
    }),
    nativeReleaseOperations: defineTable({
        operationKey: v.string(), actorId: v.id('users'),
        identity: v.object({ subject: v.string(), issuer: v.string(), tokenIdentifier: v.string() }),
        pins: nativeReleasePins, nonce: v.string(),
        stage: v.union(v.literal('queued'), v.literal('refused'), v.literal('canceled'), v.literal('settled'),
            v.literal('sending'), v.literal('unknown')),
        // Optional only to conservatively retain imported history with no positive never-send proof.
        sendAuthorityGranted: v.optional(v.boolean()),
        schedulerId: v.optional(v.id('_scheduled_functions')),
        refusal: v.optional(v.string()), canceledAt: v.optional(v.number()), settledAt: v.optional(v.number()),
        createdAt: v.number(), updatedAt: v.number(),
    }).index('by_operationKey', ['operationKey']),
};
