import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const importPreparationPolicy = v.object({
    kind: v.literal('next-app-bun-v1'), node: v.literal('node24'), bun: v.literal('1.3.11'),
    next: v.literal('16.3.1'), install: v.literal('frozen-ignore-scripts'),
    dev: v.literal('next-dev'), build: v.literal('next-build-webpack'),
    bunArchiveSha256: v.string(),
    pinnedFiles: v.array(v.object({ path: v.string(), hash: v.string(), bytes: v.number() })),
    policyHash: v.string(),
});
export const importPreparationInstrumentation = v.object({
    path: v.string(), beforeHash: v.union(v.string(), v.null()), afterHash: v.string(),
    addedOids: v.array(v.string()), bootstrapChanges: v.boolean(),
});

/** Immutable preparation provenance. Source and original media stay in their existing rows. */
export const importPreparationTables = {
    cloudEditorImportPreparations: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), workspaceId: v.id('workspaces'),
        actorId: v.id('users'), operationKey: v.string(), baselineAttemptId: v.id('cloudEditorImports'),
        baselineManifestHash: v.string(), inputRevision: v.number(), preparedRevision: v.number(),
        inputManifestHash: v.string(), preparedManifestHash: v.string(),
        generation: v.literal(1), profileVersion: v.literal(1), preparationVersion: v.literal(1),
        policy: importPreparationPolicy, instrumentation: v.array(importPreparationInstrumentation),
        createdAt: v.number(),
    }).index('by_branchId_operationKey', ['branchId', 'operationKey'])
        .index('by_branchId_generation', ['branchId', 'generation']),
};
