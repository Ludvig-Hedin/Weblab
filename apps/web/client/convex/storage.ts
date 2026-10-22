import { v } from 'convex/values';

import { internalMutation, internalQuery, mutation } from './_generated/server';
import { requireUser } from './lib/permissions';

// Convex storage URLs are resolved only inside authorized parent-record flows.

/**
 * Returns a pre-signed URL the browser POSTs a file to. Required for
 * client-side uploads (Convex File Storage's `ctx.storage.store` is server-
 * side only). Caller must be authenticated.
 */
export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        await requireUser(ctx);
        return ctx.storage.generateUploadUrl();
    },
});

/** Internal-only URL lookup. Public reads must authorize the owning record. */
export const getFileUrl = internalQuery({
    args: { storageId: v.id('_storage') },
    handler: async (ctx, { storageId }) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;
        return ctx.storage.getUrl(storageId);
    },
});

/**
 * Delete a stored blob. SECURITY: this is `internalMutation` only — the
 * Convex storage namespace is global, so a public `deleteFile(storageId)`
 * would let any authenticated user delete any other tenant's blob if they
 * obtained the storage id (leaked via project queries, screenshots, etc.).
 * Cascade cleanup of orphaned blobs lives in `internal/cascade.ts`, which
 * calls `ctx.storage.delete` directly with the parent-record context, so no
 * public callers ever need this entry point.
 */
export const deleteFile = internalMutation({
    args: { storageId: v.id('_storage') },
    handler: async (ctx, { storageId }) => {
        await ctx.storage.delete(storageId);
    },
});

// `uploadServerSideBlob` (Node-only because Buffer) lives in
// `convex/storageActions.ts` — separate file because Convex enforces one
// runtime per file. Call via `useAction(api.storageActions.uploadServerSideBlob)`.
