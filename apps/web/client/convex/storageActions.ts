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

export const uploadServerSideBlob = action({
    args: {
        contentType: v.string(),
        base64Data: v.string(),
    },
    handler: async (ctx, { contentType, base64Data }) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('UNAUTHORIZED');
        const binary = Buffer.from(base64Data, 'base64');
        const blob = new Blob([binary], { type: contentType });
        return ctx.storage.store(blob);
    },
});
