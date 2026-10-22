import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const studioBlock = v.union(v.literal('text-v1'), v.literal('callout-v1'));
export const journalValues = v.object({ title: v.string(), excerpt: v.string(), body: v.string(),
    cover: v.optional(v.object({ path: v.string(), alt: v.string() })) });
export const journalItem = v.object({ key: v.string(), slug: v.string(), revision: v.number(),
    status: v.union(v.literal('draft'), v.literal('ready')), archived: v.boolean(), values: journalValues });
export const studioSlot = v.object({ id: v.string(), path: v.string(), oid: v.string(),
    ancestry: v.string(), allowedBlocks: v.array(studioBlock), min: v.number(), max: v.number(),
    instances: v.array(v.object({ id: v.string(), block: studioBlock })) });
export const studioSettings = { profile: v.literal('cloud-studio-v1'), generation: v.number(),
    active: v.boolean(), allowPages: v.boolean(), allowedBlocks: v.array(studioBlock), slots: v.array(studioSlot) };
export const studioOperation = v.union(
    v.object({ kind: v.literal('install') }),
    v.object({ kind: v.literal('configure'), active: v.boolean(), allowPages: v.boolean(), allowedBlocks: v.array(studioBlock) }),
    v.object({ kind: v.literal('approveSlot'), path: v.string(), parentOid: v.string(), allowedBlocks: v.array(studioBlock), min: v.number(), max: v.number() }),
    v.object({ kind: v.literal('createPage'), slug: v.string() }),
    v.object({ kind: v.literal('insertBlock'), slotId: v.string(), block: studioBlock, position: v.number() }),
    v.object({ kind: v.literal('moveBlock'), slotId: v.string(), instanceId: v.string(), position: v.number() }),
    v.object({ kind: v.literal('removeBlock'), slotId: v.string(), instanceId: v.string() }),
);
export const journalOperation = v.union(
    v.object({ kind: v.literal('save'), key: v.string(), expectedItemRevision: v.number(), slug: v.string(), values: journalValues, status: v.union(v.literal('draft'), v.literal('ready')) }),
    v.object({ kind: v.literal('archive'), key: v.string(), expectedItemRevision: v.number() }),
    v.object({ kind: v.literal('restore'), key: v.string(), expectedItemRevision: v.number(), values: v.optional(journalValues) }),
);
export const cloudEditorStudioTables = {
    cloudEditorStudioContracts: defineTable({ projectId: v.id('projects'), branchId: v.id('branches'),
        ...studioSettings, approvedByUserId: v.id('users'), updatedAt: v.number() })
        .index('by_branchId', ['branchId']),
    cloudEditorJournalItems: defineTable({ projectId: v.id('projects'), branchId: v.id('branches'),
        ...journalItem.fields, updatedAt: v.number() })
        .index('by_branchId', ['branchId'])
        .index('by_branchId_and_key', ['branchId', 'key'])
        .index('by_branchId_and_slug', ['branchId', 'slug']),
};
