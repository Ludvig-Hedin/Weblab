import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const importFile = v.object({ path: v.string(), kind: v.union(v.literal('text'), v.literal('binary')),
    bytes: v.number(), hash: v.string(), text: v.optional(v.string()) });

/** Import receipts and finalized pristine manifests survive ordinary project deletion. */
export const importTables = {
    cloudEditorImports: defineTable({
        actorId: v.id('users'), workspaceId: v.id('workspaces'), operationKey: v.string(), name: v.string(),
        files: v.array(importFile), bytes: v.number(), manifestHash: v.string(), createdAt: v.number(), expiresAt: v.number(),
        state: v.union(v.literal('open'), v.literal('finalized'), v.literal('expired')),
        projectId: v.optional(v.id('projects')), branchId: v.optional(v.id('branches')),
    }).index('by_actorId_operationKey', ['actorId', 'operationKey'])
        .index('by_actorId_createdAt', ['actorId', 'createdAt'])
        .index('by_workspaceId_createdAt', ['workspaceId', 'createdAt'])
        .index('by_expiresAt', ['expiresAt']).index('by_projectId', ['projectId']),
    cloudEditorImportFiles: defineTable({
        attemptId: v.id('cloudEditorImports'), index: v.number(), path: v.string(), hash: v.string(), bytes: v.number(),
        state: v.union(v.literal('pending'), v.literal('receiving'), v.literal('sending'), v.literal('received'), v.literal('unknown')),
        nonce: v.optional(v.string()), leaseUntil: v.optional(v.number()), claimedAt: v.optional(v.number()),
        storageId: v.optional(v.id('_storage')), valid: v.optional(v.boolean()), collectedAt: v.optional(v.number()),
    }).index('by_attemptId_index', ['attemptId', 'index']).index('by_attemptId', ['attemptId'])
        .index('by_storageId', ['storageId']).index('by_state_leaseUntil', ['state', 'leaseUntil']),
};
