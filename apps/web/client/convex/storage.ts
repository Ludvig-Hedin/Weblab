import { v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';
import { requireUser } from './lib/permissions';

// Convex File Storage primitives.
//
// Replaces Supabase Storage. Single global namespace (no buckets). Every
// authenticated caller can generate an upload URL and read by storageId.
// Ownership is enforced at the parent record level (e.g. project.previewImg)
// not here — the storageId itself is just an opaque pointer.

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

/**
 * Resolves a storage id to a short-lived signed URL. Returns null if the
 * caller isn't authenticated OR the storageId is unknown — both treated
 * the same so we never leak existence-of-id to anonymous callers.
 */
export const getFileUrl = query({
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
