import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const textBinding = v.object({ oid: v.string(), fields: v.array(v.literal('text')) });
export const contentField = v.union(v.literal('text'), v.literal('src'), v.literal('alt'), v.literal('href'), v.literal('className'));
export const contentBinding = v.object({
    oid: v.string(), fields: v.array(contentField),
    allowImageUploads: v.optional(v.boolean()),
    allowedValues: v.optional(v.object({ src: v.optional(v.array(v.string())), href: v.optional(v.array(v.string())) })),
    choices: v.optional(v.record(v.string(), v.string())),
    choiceLabels: v.optional(v.record(v.string(), v.string())),
});
export const expectedContract = v.object({ path: v.string(), generation: v.number() });
export const contentCandidate = v.object({ path: v.string(), content: v.string() });
export const contentTransport = { transport: v.literal('content'), transportVersion: v.literal(1) };

/** Revoked rows remain as generation tombstones until enrollment cleanup. */
export const cloudEditorContentTables = {
    cloudEditorContentContracts: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), path: v.string(),
        version: v.literal(1), generation: v.number(), active: v.boolean(),
        bindings: v.array(contentBinding), fingerprint: v.string(),
        approvedByUserId: v.id('users'), approvedRevision: v.number(), updatedAt: v.number(),
    }).index('by_branchId_and_path', ['branchId', 'path']),
};
