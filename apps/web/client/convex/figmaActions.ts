import { v } from 'convex/values';

import { extractFigmaFileKey, extractTopLevelFrames, fetchFigmaFile } from '@weblab/figma';

import { action } from './_generated/server';

// Convex port of src/server/api/routers/figma.ts.
//
// Pure fetch against api.figma.com — safe in the default (V8) action runtime.
// No DB writes here; the result flows back to the client. Auth is asserted
// via `ctx.auth.getUserIdentity()` because actions have no `ctx.db` and the
// figma call doesn't need a Convex user row.

export const fetchFile = action({
    args: {
        fileUrl: v.string(),
        personalAccessToken: v.optional(v.string()),
    },
    handler: async (ctx, { fileUrl, personalAccessToken }) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('UNAUTHORIZED');

        const pat = personalAccessToken;
        if (!pat || pat.trim().length === 0) {
            throw new Error(
                'BAD_REQUEST: Paste a Figma personal access token to import this file.',
            );
        }
        const fileKey = extractFigmaFileKey(fileUrl);
        if (!fileKey) {
            throw new Error(
                'BAD_REQUEST: Could not extract a file key from the Figma URL. Use a /file/ or /design/ URL.',
            );
        }
        let file;
        try {
            file = await fetchFigmaFile(fileKey, pat);
        } catch (err) {
            throw new Error(
                `BAD_REQUEST: ${err instanceof Error ? err.message : 'Failed to fetch Figma file'}`,
            );
        }
        return {
            fileName: file.name,
            fileKey,
            frames: extractTopLevelFrames(file),
        };
    },
});
