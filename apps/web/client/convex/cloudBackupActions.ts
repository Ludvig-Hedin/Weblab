'use node';

import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import type { releaseFile } from './cloudReleasesSchema';
import { verifiedFileBytes } from './cloudReleaseActions';

const assetRef = makeFunctionReference<'query', { backupId: Id<'cloudReleases'>; path: string }, Infer<typeof releaseFile>>('cloudBackups:_asset');
/** Legacy small-file transport only. The authorized _asset query refuses imported backup profiles. */
export const file = action({
    args: { backupId: v.id('cloudReleases'), path: v.string() },
    handler: async (ctx, args): Promise<ArrayBuffer> => {
        const file = await ctx.runQuery(assetRef, args);
        const bytes = await verifiedFileBytes(ctx, file);
        const current = await ctx.runQuery(assetRef, args);
        if (current.path !== file.path || current.kind !== file.kind || current.text !== file.text ||
            current.storageId !== file.storageId || current.hash !== file.hash || current.bytes !== file.bytes)
            throw new Error('CLOUD_BACKUP_FILE_CHANGED');
        return Uint8Array.from(bytes).buffer;
    },
});
