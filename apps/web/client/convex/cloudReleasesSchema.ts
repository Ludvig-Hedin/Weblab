import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const releaseFile = v.object({
    path: v.string(), kind: v.union(v.literal('file'), v.literal('directory')),
    text: v.optional(v.string()), storageId: v.optional(v.id('_storage')),
    hash: v.string(), bytes: v.number(),
});

/** These records deliberately survive ordinary project/branch deletion. */
export const cloudReleaseTables = {
    cloudReleaseReviewTickets: defineTable({
        releaseId: v.id('cloudReleases'), actorId: v.id('users'),
        destinationId: v.id('cloudReleaseDestinations'), generation: v.number(),
        deploymentId: v.string(), hash: v.string(),
        ticketHash: v.string(), exchangeExpiresAt: v.number(),
        sessionHash: v.optional(v.string()), expiresAt: v.number(),
    }).index('by_releaseId_and_actorId', ['releaseId', 'actorId'])
        .index('by_ticketHash', ['ticketHash']).index('by_sessionHash', ['sessionHash']),
    cloudReleases: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), workspaceId: v.id('workspaces'),
        actorId: v.id('users'), operationKey: v.string(), revision: v.number(),
        projectName: v.optional(v.string()),
        purpose: v.union(v.literal('release'), v.literal('backup')),
        status: v.union(v.literal('captured'), v.literal('frozen'), v.literal('building'), v.literal('ready'), v.literal('error')),
        studioInputJson: v.string(), previousArtifactJson: v.string(), artifactJson: v.optional(v.string()),
        baselineReleaseId: v.optional(v.id('cloudReleases')),
        sourceHash: v.optional(v.string()), hash: v.optional(v.string()),
        deploymentId: v.optional(v.string()), deploymentUrl: v.optional(v.string()),
        builtDestinationKey: v.optional(v.string()), error: v.optional(v.string()),
        createdAt: v.number(),
    }).index('by_workspaceId', ['workspaceId'])
        .index('by_branchId', ['branchId']).index('by_branchId_and_operationKey', ['branchId', 'operationKey']),
    cloudReleaseFiles: defineTable({
        releaseId: v.id('cloudReleases'), stage: v.union(v.literal('source'), v.literal('deploy'), v.literal('baseline')),
        ...releaseFile.fields,
    }).index('by_releaseId_and_stage', ['releaseId', 'stage']),
    cloudReleaseAssets: defineTable({
        releaseId: v.id('cloudReleases'), storageId: v.id('_storage'),
    }).index('by_storageId', ['storageId']).index('by_releaseId', ['releaseId']),
    cloudReleaseReviews: defineTable({
        releaseId: v.id('cloudReleases'), actorId: v.id('users'),
        hash: v.string(), deploymentId: v.string(), reviewedAt: v.number(),
    }).index('by_releaseId_and_actorId', ['releaseId', 'actorId']),
    cloudReleaseDestinations: defineTable({
        key: v.string(), projectId: v.id('projects'), branchId: v.id('branches'),
        teamId: v.string(), providerProjectId: v.string(), hostname: v.string(),
        generation: v.number(), approvedUntil: v.number(), remainingBuilds: v.number(),
        reviewGatewayVerified: v.boolean(), publicAliasVerified: v.boolean(),
        liveReleaseId: v.optional(v.id('cloudReleases')), liveDeploymentId: v.optional(v.string()),
        lockOperationId: v.optional(v.id('cloudReleaseOperations')),
        drifted: v.boolean(),
    }).index('by_key', ['key']).index('by_branchId', ['branchId']),
    cloudReleaseOperations: defineTable({
        destinationId: v.id('cloudReleaseDestinations'), releaseId: v.id('cloudReleases'),
        projectId: v.id('projects'), branchId: v.id('branches'), actorId: v.id('users'),
        operationKey: v.string(), kind: v.union(v.literal('build'), v.literal('publish'), v.literal('rollback')),
        stage: v.union(v.literal('queued'), v.literal('sending'), v.literal('observing'), v.literal('confirmed'), v.literal('failed'), v.literal('unknown')),
        nonce: v.string(), generation: v.number(), expectedDeploymentId: v.optional(v.string()),
        expectedLiveReleaseId: v.optional(v.union(v.id('cloudReleases'), v.null())),
        targetDeploymentId: v.optional(v.string()), sourceHash: v.string(),
        schedulerId: v.optional(v.id('_scheduled_functions')),
        resultDeploymentId: v.optional(v.string()), resultUrl: v.optional(v.string()),
        error: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
    }).index('by_destinationId_and_operationKey', ['destinationId', 'operationKey']).index('by_branchId', ['branchId']),
    cloudBackupRestores: defineTable({
        backupId: v.id('cloudReleases'), actorId: v.id('users'), operationKey: v.string(),
        projectId: v.id('projects'), branchId: v.id('branches'),
    }).index('by_backupId_and_actorId_and_operationKey', ['backupId', 'actorId', 'operationKey']),
};
