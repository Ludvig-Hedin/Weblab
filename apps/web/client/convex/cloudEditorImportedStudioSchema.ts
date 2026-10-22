import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/** Portable recipe/instance data lives in source JSON, never in this authority row. */
export const importedStudioTables = {
    cloudEditorImportedStudioApprovals: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), workspaceId: v.id('workspaces'),
        preparationId: v.id('cloudEditorImportPreparations'), designRevision: v.number(),
        generation: v.number(), active: v.boolean(), recipeFingerprint: v.string(),
        approvedByUserId: v.id('users'), updatedAt: v.number(),
    }).index('by_branchId', ['branchId']),
};

export const importedStudioOperation = v.union(
    v.object({ kind: v.literal('capture'), label: v.string(), blockLabel: v.string(),
        slots: v.array(v.object({ key: v.string(), max: v.number() })) }),
    v.object({ kind: v.literal('createPage'), templateId: v.literal('basic-page-v1'), slug: v.string() }),
    v.object({ kind: v.literal('insertBlock'), pageId: v.string(), slotKey: v.string(), blockId: v.literal('text-block-v1'), position: v.number() }),
    v.object({ kind: v.literal('moveBlock'), pageId: v.string(), slotKey: v.string(), instanceId: v.string(), position: v.number() }),
    v.object({ kind: v.literal('removeBlock'), pageId: v.string(), slotKey: v.string(), instanceId: v.string() }),
);

export const importedStudioPin = {
    expectedRevision: v.number(), expectedGeneration: v.number(),
    expectedPreparationId: v.id('cloudEditorImportPreparations'), expectedDesignRevision: v.number(),
    expectedRecipeFingerprint: v.string(),
};
