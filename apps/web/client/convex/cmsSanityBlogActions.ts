'use node';

import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { action } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import type { BlogConnection, BlogConnectionScope, BlogDraft, BlogScope } from '../src/lib/sanity-blog-api';
import { SanityBlogReader } from './lib/sanityBlogReader';
import { sanitizeSanityCoordinates } from './lib/sanityBlogContract';
import { blogConnectionValidator, blogDraftValidator, blogPageValidator } from './cmsSanityBlogSchema';

const scope = { projectId: v.id('projects'), branchId: v.id('branches') };
const connected = { ...scope, connectionId: v.id('cmsSanityBlogConnections'), connectionRevision: v.number() };
const state = {
    assertAccess: makeFunctionReference<'query', BlogScope & { capability: 'project.view' | 'project.update' }, null>('cmsSanityBlog:assertAccess'),
    createConnection: makeFunctionReference<'mutation', BlogScope & { sanityProjectId: string; dataset: string }, BlogConnection>('cmsSanityBlog:createConnection'),
    load: makeFunctionReference<'query', BlogConnectionScope & { capability: 'project.view' | 'project.update' }, BlogConnection>('cmsSanityBlog:load'),
    findDraft: makeFunctionReference<'query', BlogConnectionScope & { documentId: string }, BlogDraft | null>('cmsSanityBlog:findDraft'),
    capture: makeFunctionReference<'mutation', BlogConnectionScope & { documentJson: string }, BlogDraft>('cmsSanityBlog:capture'),
};
async function loadReader(ctx: ActionCtx, args: BlogConnectionScope, capability: 'project.view' | 'project.update') {
    const connection = await ctx.runQuery(state.load, { ...args, capability });
    return new SanityBlogReader({ projectId: connection.sanityProjectId, dataset: connection.dataset });
}
export const connect = action({ args: { ...scope, sanityProjectId: v.string(), dataset: v.string() }, returns: blogConnectionValidator, handler: async (ctx, args): Promise<BlogConnection> => {
    await ctx.runQuery(state.assertAccess, { projectId: args.projectId, branchId: args.branchId, capability: 'project.update' });
    const coordinates = sanitizeSanityCoordinates(args.sanityProjectId, args.dataset);
    // Anonymous published GET proves the public dataset can be read. No keys,
    // provider drafts, assets or write endpoint exist in this reader.
    await new SanityBlogReader(coordinates).list();
    return ctx.runMutation(state.createConnection, args);
} });
export const list = action({ args: { ...connected, cursor: v.optional(v.string()) }, returns: blogPageValidator, handler: async (ctx, args) => {
    const { cursor, ...connection } = args;
    const reader = await loadReader(ctx, connection, 'project.view');
    const result = await reader.list(cursor);
    await ctx.runQuery(state.load, { ...connection, capability: 'project.view' });
    return result;
} });
export const open = action({ args: { ...connected, documentId: v.string() }, returns: blogDraftValidator, handler: async (ctx, args): Promise<BlogDraft> => {
    const { documentId, ...connection } = args;
    const reader = await loadReader(ctx, connection, 'project.update');
    const existing = await ctx.runQuery(state.findDraft, args);
    if (existing) return existing;
    const documentJson = await reader.get(documentId);
    // The mutation rechecks rights, local branch and immutable connection pins
    // after the network read. Existing original+edited copies never refresh.
    return ctx.runMutation(state.capture, { ...connection, documentJson });
} });
