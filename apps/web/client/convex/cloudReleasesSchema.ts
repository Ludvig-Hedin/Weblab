import { defineTable } from 'convex/server';
import { v, type Infer } from 'convex/values';
import { importedMediaProvenance } from './cloudEditorContentImageSchema';
import { importPreparationInstrumentation, importPreparationPolicy } from './cloudEditorImportPreparationSchema';

const importedMetadataFields = {
    capturedRevision: v.number(), originalManifestHash: v.string(),
    studioConfig: v.optional(v.object({ path: v.literal('src/weblab/studio.json'), hash: v.string(), bytes: v.number() })),
    preparation: v.object({
        inputRevision: v.number(), preparedRevision: v.number(),
        inputManifestHash: v.string(), preparedManifestHash: v.string(),
        policy: importPreparationPolicy, instrumentation: v.array(importPreparationInstrumentation),
    }),
};
export const importedReleaseMetadata = v.union(
    v.object({ version: v.literal(1), ...importedMetadataFields }),
    v.object({ version: v.literal(2), ...importedMetadataFields, mediaManifestHash: v.string() }),
);
export type ImportedReleaseMetadata = Infer<typeof importedReleaseMetadata>;

export const releaseFile = v.object({
    path: v.string(), kind: v.union(v.literal('file'), v.literal('directory')),
    text: v.optional(v.string()), storageId: v.optional(v.id('_storage')),
    hash: v.string(), bytes: v.number(),
});

export const frozenReleaseFile = v.object({ ...releaseFile.fields, media: v.optional(importedMediaProvenance) });

export const importedHostingBinding = v.object({
    version: v.literal(1), profile: v.literal('imported-next-hosting-v1'),
    artifactId: v.id('cloudReleases'), artifactHash: v.string(), deployHash: v.string(), buildPolicyHash: v.string(),
    visibility: v.union(v.literal('protected-only'), v.literal('publishable')),
});
export const importedHostingRequest = v.object({
    version: v.literal(1), artifactId: v.id('cloudReleases'), expectedArtifactHash: v.string(),
    visibility: v.union(v.literal('protected-only'), v.literal('publishable')), expectedLiveReleaseId: v.union(v.id('cloudReleases'), v.null()),
});
export const importedHostingPrepareArgs = {
    projectId: v.id('projects'), branchId: v.id('branches'), expectedActorId: v.id('users'),
    artifactId: v.id('cloudReleases'), expectedArtifactHash: v.string(), operationKey: v.string(),
    visibility: v.union(v.literal('protected-only'), v.literal('publishable')), expectedLiveReleaseId: v.union(v.id('cloudReleases'), v.null()),
};
export const importedHostingSealArgs = {
    ...importedHostingPrepareArgs, sourceHash: v.string(), hash: v.string(), artifactJson: v.string(),
    buildPolicyJson: v.string(), files: v.array(releaseFile),
};

export const cloudVersionStatus = v.union(v.literal('captured'), v.literal('frozen'), v.literal('building'), v.literal('ready'), v.literal('error'));
export const cloudRemovalConfirmation = {
    releaseId: v.id('cloudReleases'), expectedHash: v.union(v.string(), v.null()),
    expectedStatus: cloudVersionStatus, expectedRevision: v.number(),
};
const cloudReleaseRemovalReceipt = v.object({
    version: v.literal(1), actorId: v.id('users'), operationKey: v.string(),
    expectedHash: v.union(v.string(), v.null()), expectedStatus: cloudVersionStatus, revision: v.number(), requestedAt: v.number(),
    phase: v.union(v.literal('files'), v.literal('reviews'), v.literal('tickets'), v.literal('assets'), v.literal('done')),
    completedAt: v.optional(v.number()),
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
        purpose: v.union(v.literal('release'), v.literal('backup'), v.literal('private-artifact')),
        artifactProfile: v.optional(v.union(v.literal('imported-next-private-v1'), v.literal('imported-next-private-v2'), v.literal('imported-next-public-v1'))),
        imported: v.optional(importedReleaseMetadata),
        publicationIntent: v.optional(v.literal('eligible-public-version')),
        importedHosting: v.optional(importedHostingBinding),
        importedHostingRequest: v.optional(importedHostingRequest),
        importedHostingBuildPolicyJson: v.optional(v.string()),
        removal: v.optional(cloudReleaseRemovalReceipt), removedAt: v.optional(v.number()),
        status: v.union(v.literal('captured'), v.literal('frozen'), v.literal('building'), v.literal('ready'), v.literal('error')),
        studioInputJson: v.string(), previousArtifactJson: v.string(), artifactJson: v.optional(v.string()),
        baselineReleaseId: v.optional(v.id('cloudReleases')),
        sourceHash: v.optional(v.string()), hash: v.optional(v.string()),
        deploymentId: v.optional(v.string()), deploymentUrl: v.optional(v.string()),
        builtDestinationKey: v.optional(v.string()), error: v.optional(v.string()),
        createdAt: v.number(),
    }).index('by_workspaceId', ['workspaceId'])
        .index('by_branchId', ['branchId']).index('by_branchId_and_operationKey', ['branchId', 'operationKey'])
        .index('by_workspaceId_and_removedAt', ['workspaceId', 'removedAt'])
        .index('by_branchId_and_removedAt', ['branchId', 'removedAt'])
        .index('by_hostingArtifactId_and_removedAt', ['importedHosting.artifactId', 'removedAt'])
        .index('by_hostingRequestArtifactId_and_removedAt', ['importedHostingRequest.artifactId', 'removedAt']),
    cloudReleaseFiles: defineTable({
        releaseId: v.id('cloudReleases'), stage: v.union(v.literal('source'), v.literal('deploy'), v.literal('baseline'), v.literal('original')),
        ...frozenReleaseFile.fields,
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
        registrationVersion: v.optional(v.union(v.literal(1), v.literal(2))), workspaceId: v.optional(v.id('workspaces')),
        hostingProfile: v.optional(v.literal('imported-next-hosting-v1')),
        credentialId: v.optional(v.id('cloudReleaseCredentials')), credentialVersion: v.optional(v.number()),
        credentialHash: v.optional(v.string()), providerProof: v.optional(v.string()),
    }).index('by_key', ['key']).index('by_branchId', ['branchId'])
        .index('by_liveReleaseId', ['liveReleaseId'])
        .index('by_teamId_and_providerProjectId', ['teamId', 'providerProjectId'])
        .index('by_hostname', ['hostname']),
    cloudReleaseBuildGrants: defineTable({
        destinationId: v.id('cloudReleaseDestinations'), grantKey: v.string(),
        builds: v.number(), approvedUntil: v.number(),
    }).index('by_destinationId_and_grantKey', ['destinationId', 'grantKey']),
    cloudReleaseCredentials: defineTable({
        hostingProfile: v.optional(v.literal('imported-next-hosting-v1')),
        destinationId: v.id('cloudReleaseDestinations'), workspaceId: v.id('workspaces'),
        projectId: v.id('projects'), branchId: v.id('branches'),
        teamId: v.string(), providerProjectId: v.string(), hostname: v.string(),
        version: v.number(), ciphertext: v.string(), ciphertextHash: v.string(),
        providerProof: v.string(), expiresAt: v.number(), revokedAt: v.optional(v.number()),
    }).index('by_destinationId', ['destinationId']),
    cloudReleaseOperations: defineTable({
        destinationId: v.id('cloudReleaseDestinations'), releaseId: v.id('cloudReleases'),
        credentialId: v.optional(v.id('cloudReleaseCredentials')), credentialVersion: v.optional(v.number()),
        credentialHash: v.optional(v.string()),
        projectId: v.id('projects'), branchId: v.id('branches'), actorId: v.id('users'),
        operationKey: v.string(), kind: v.union(v.literal('build'), v.literal('publish'), v.literal('rollback')),
        stage: v.union(v.literal('queued'), v.literal('sending'), v.literal('observing'), v.literal('confirmed'), v.literal('failed'), v.literal('unknown')),
        nonce: v.string(), generation: v.number(), expectedDeploymentId: v.optional(v.string()),
        expectedLiveReleaseId: v.optional(v.union(v.id('cloudReleases'), v.null())),
        targetDeploymentId: v.optional(v.string()), sourceHash: v.string(),
        deployHash: v.optional(v.string()), buildPolicyHash: v.optional(v.string()),
        schedulerId: v.optional(v.id('_scheduled_functions')),
        resultDeploymentId: v.optional(v.string()), resultUrl: v.optional(v.string()),
        error: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
    }).index('by_destinationId_and_operationKey', ['destinationId', 'operationKey']).index('by_branchId', ['branchId'])
        .index('by_branchId_and_stage', ['branchId', 'stage'])
        .index('by_publication_tuple', ['releaseId', 'destinationId', 'sourceHash', 'targetDeploymentId', 'kind', 'stage'])
        .index('by_releaseId_and_stage', ['releaseId', 'stage'])
        .index('by_expectedLiveReleaseId_and_stage', ['expectedLiveReleaseId', 'stage']),
    cloudBackupRestores: defineTable({
        backupId: v.id('cloudReleases'), actorId: v.id('users'), operationKey: v.string(),
        projectId: v.id('projects'), branchId: v.id('branches'),
    }).index('by_backupId_and_actorId_and_operationKey', ['backupId', 'actorId', 'operationKey']),
};
