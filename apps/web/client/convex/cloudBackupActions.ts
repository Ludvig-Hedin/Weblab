'use node';

import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import type { releaseFile } from './cloudReleasesSchema';
import { verifiedFileBytes } from './cloudReleaseActions';

const assetRef = makeFunctionReference<'query', { backupId: Id<'cloudReleases'>; path: string }, Infer<typeof releaseFile>>('cloudBackups:_asset');
/** One bounded verified file per request; no public storage URL for private backups. */
export const file = action({
    args: { backupId: v.id('cloudReleases'), path: v.string() },
    handler: async (ctx, args): Promise<ArrayBuffer> => {
        const file = await ctx.runQuery(assetRef, args);
        const bytes = await verifiedFileBytes(ctx, file);
        return Uint8Array.from(bytes).buffer;
    },
});
