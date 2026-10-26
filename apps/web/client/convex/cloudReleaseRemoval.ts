import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { cloudRemovalConfirmation } from './cloudReleasesSchema';
import { inspectRemoval, beginRemoval, continueRemoval as continueRemovalHandler } from './lib/cloudReleaseRemoval';

export const inspect = query({ args: { releaseId: v.id('cloudReleases'), expectedActorId: v.id('users') }, handler: inspectRemoval });
export const begin = mutation({ args: { ...cloudRemovalConfirmation, expectedActorId: v.id('users'), operationKey: v.string() }, handler: beginRemoval });
export const continueRemoval = mutation({ args: {
    releaseId: v.id('cloudReleases'), operationKey: v.string(), initiatorActorId: v.id('users'), expectedExecutorActorId: v.id('users'),
}, handler: continueRemovalHandler });
