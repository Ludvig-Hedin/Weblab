'use node';

import { v } from 'convex/values';

import { action } from './_generated/server';

// Node-runtime sibling of `storage.ts`. Lives here because it needs Node's
// `Buffer` for base64 decoding (V8 runtime has no Buffer). Convex enforces
// one runtime per file — keep V8-side primitives in `storage.ts` and Node-
// side helpers here.
//
// Trusted server-side upload for code paths that already have a base64
// payload (e.g. tRPC-era `project.captureScreenshot` after Firecrawl).
// Returns the storage id; caller persists it on the parent record.

// 25 MB ceiling. Matches the transcribe API's cap and bounds the cost a
// single authenticated user can impose on the Convex storage quota per call.
// Higher caps invite free-tier abuse (any signed-in user can fill storage).
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Allowlist of MIME types this entry point is intended to handle. Today
// it's only project preview screenshots + a small set of user-supplied
// images. Reject anything else loudly so a future caller doesn't smuggle
// arbitrary blobs through the path.
const ALLOWED_CONTENT_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
]);

export const uploadServerSideBlob = action({
    args: {
        contentType: v.string(),
        base64Data: v.string(),
    },
    handler: async (ctx, { contentType, base64Data }) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('UNAUTHORIZED');
        if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
            throw new Error(`BAD_REQUEST: contentType '${contentType}' not allowed`);
        }
        // Reject obviously oversized payloads before allocating a Buffer. The
        // base64 string is ~4/3 the binary size; cheap upper-bound check.
        if (base64Data.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4) {
            throw new Error(
                `BAD_REQUEST: payload exceeds ${MAX_UPLOAD_BYTES} bytes (base64 length ${base64Data.length})`,
            );
        }
        const binary = Buffer.from(base64Data, 'base64');
        if (binary.length > MAX_UPLOAD_BYTES) {
            throw new Error(
                `BAD_REQUEST: payload exceeds ${MAX_UPLOAD_BYTES} bytes (decoded ${binary.length})`,
            );
        }
        const blob = new Blob([binary], { type: contentType });
        return ctx.storage.store(blob);
    },
});
