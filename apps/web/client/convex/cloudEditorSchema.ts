import { defineTable } from 'convex/server';
import { v } from 'convex/values';

import { cloudEditorAccessTables } from './cloudEditorAccessSchema';
import { cloudEditorContentTables } from './cloudEditorContentSchema';
import { cloudPreviewAccessTables } from './cloudPreviewAccessSchema';
import { cloudEditorUploadTables } from './cloudEditorUploadSchema';
import { cloudEditorInvitationTables } from './cloudEditorInvitationsSchema';
import { cloudEditorStudioTables } from './cloudEditorStudioSchema';
import { cloudReleaseTables } from './cloudReleasesSchema';
import { cloudEditorContentImageTables } from './cloudEditorContentImageSchema';

/** Server-created enrollment, never inferred from editable project tags/metadata. */
export const cloudEditorTables = {
    ...cloudEditorInvitationTables,
    ...cloudEditorStudioTables,
    ...cloudReleaseTables,
    ...cloudEditorContentImageTables,
    ...cloudEditorUploadTables,
    ...cloudEditorAccessTables,
    ...cloudEditorContentTables,
    ...cloudPreviewAccessTables,
    cloudEditorSlots: defineTable({
        slot: v.number(),
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        token: v.string(),
        expiresAt: v.number(),
        sandboxId: v.optional(v.string()),
    })
        .index('by_slot', ['slot'])
        .index('by_token', ['token']),
    cloudEditorStates: defineTable({
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        version: v.literal(1),
        workspaceId: v.id('workspaces'),
        createdByUserId: v.id('users'),
        creationId: v.string(),
        sourcePilotId: v.optional(v.id('projects')),
        revision: v.number(),
        bytes: v.number(),
        fileCount: v.number(),
        generation: v.number(),
        runtimeStarts: v.optional(v.array(v.number())),
        contentPreviewAllowance: v.optional(
            v.object({
                remainingStarts: v.number(),
                expiresAt: v.number(),
                generation: v.optional(v.number()),
            }),
        ),
        previewRequestGeneration: v.optional(v.number()),
        previewStartRequest: v.optional(
            v.object({
                generation: v.number(),
                actorId: v.id('users'),
                kind: v.union(v.literal('design'), v.literal('content')),
                expiresAt: v.number(),
                allowanceGeneration: v.optional(v.number()),
                reservedToken: v.optional(v.string()),
            }),
        ),
        status: v.union(
            v.literal('stopped'),
            v.literal('starting'),
            v.literal('ready'),
            v.literal('error'),
        ),
        sandboxId: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
        previewToken: v.optional(v.string()),
        previewGatewayVersion: v.optional(v.number()),
        expiresAt: v.optional(v.number()),
        appliedRevision: v.optional(v.number()),
        leaseUntil: v.optional(v.number()),
        leaseToken: v.optional(v.string()),
        error: v.optional(v.string()),
        materializedPaths: v.optional(v.array(v.string())),
        dependencyHash: v.optional(v.string()),
        updatedAt: v.number(),
    })
        .index('by_projectId', ['projectId'])
        .index('by_branchId', ['branchId'])
        .index('by_createdByUserId_creationId', ['createdByUserId', 'creationId'])
        .index('by_sourcePilotId', ['sourcePilotId'])
        .index('by_workspaceId', ['workspaceId']),
    cloudEditorFiles: defineTable({
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        path: v.string(),
        kind: v.union(v.literal('file'), v.literal('directory')),
        text: v.optional(v.string()),
        storageId: v.optional(v.id('_storage')),
        hash: v.string(),
        bytes: v.number(),
    })
        .index('by_branchId_path', ['branchId', 'path'])
        .index('by_storageId', ['storageId']),
    cloudEditorOperations: defineTable({
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        userId: v.id('users'),
        operationId: v.string(),
        fingerprint: v.string(),
        createdAt: v.number(),
        revision: v.number(),
        storageIds: v.array(v.id('_storage')),
    })
        .index('by_branchId_operationId', ['branchId', 'operationId'])
        .index('by_createdAt', ['createdAt']),
};
