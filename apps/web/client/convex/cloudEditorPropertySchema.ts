import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { contentImageRenderMapping } from './cloudEditorContentSchema';
import { cloudScope } from './lib/cloudEditor';

export const propertyTarget = v.union(
    v.object({ kind: v.literal('component-literal-href'), exportName: v.string(), oid: v.string(), field: v.literal('href') }),
    v.object({ kind: v.literal('mapped-callsite-enum'), exportName: v.string(), oid: v.string(), field: v.literal('tone'), renderMapping: contentImageRenderMapping }),
);
export const propertySelection = v.union(
    v.object({ kind: v.literal('component-literal-href'), path: v.string(), exportName: v.string(), oid: v.string() }),
    v.object({ kind: v.literal('mapped-callsite-enum'), oid: v.string(), mappingId: v.string(), itemId: v.literal('single') }),
);
export const propertyBinding = v.object({ bindingId: v.string(), label: v.string(), target: propertyTarget,
    options: v.array(v.object({ id: v.string(), label: v.string(), value: v.string() })) });
export const propertyScope = { ...cloudScope, actorId: v.id('users') };
export const propertyPin = v.object({ version: v.literal(1), path: v.string(), generation: v.number(),
    preparationId: v.id('cloudEditorImportPreparations'), designRevision: v.number(), definitionHash: v.string(), bindingId: v.string() });
export const propertyApprovalArgs = { ...propertyScope, path: v.string(), expectedRevision: v.number(), expectedGeneration: v.number(),
    expectedPreparationId: v.id('cloudEditorImportPreparations'), expectedDesignRevision: v.number(), bindings: v.array(propertyBinding) };
export const propertyCommitArgs = { ...propertyScope, transport: v.literal('content-property'), transportVersion: v.literal(1),
    expectedRevision: v.number(), operationId: v.string(), pin: propertyPin, previousValue: v.string(), choiceId: v.string(),
    changes: v.array(v.object({ path: v.string(), content: v.string() })) };

/** Retained generation tombstones are drained by the existing enrollment cleanup. */
export const cloudEditorPropertyTables = {
    cloudEditorPropertyContracts: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), workspaceId: v.id('workspaces'), path: v.string(),
        version: v.literal(1), preparationId: v.id('cloudEditorImportPreparations'), designRevision: v.number(),
        generation: v.number(), active: v.boolean(), bindings: v.array(propertyBinding), definitionHash: v.string(),
        approvedByUserId: v.id('users'), approvedRevision: v.number(), updatedAt: v.number(),
    }).index('by_branchId_and_path', ['branchId', 'path']),
};
