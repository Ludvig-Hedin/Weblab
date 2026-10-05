import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';

const preflightRef = makeFunctionReference<'mutation', { operationId: Id<'nativeReleaseOperations'>; nonce: string }, false>('nativeReleases:_preflight');

/** The original scheduled worker positively completes after an explicit unsent refusal.
 * There is no provider client, eligibility verifier, successful result setter or send path.
 */
export const work = internalAction({
    args: { operationId: v.id('nativeReleaseOperations'), nonce: v.string() }, returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.runMutation(preflightRef, args);
        return null;
    },
});
