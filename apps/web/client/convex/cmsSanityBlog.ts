import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';
import { blogConnectionValidator as connectionResult, blogDraftValidator as draftResult, blogDraftPageValidator } from './cmsSanityBlogSchema';
import { applyBlogOperations, BLOG_PROFILE, blogSummary, newBlogDocument, parseBlogDocument, sanitizeSanityCoordinates } from './lib/sanityBlogContract';
import type { BlogConnection, BlogConnectionScope, BlogDraft, BlogDraftScope, BlogScope } from '../src/lib/sanity-blog-api';
import { NATIVE_CONTENT_MAX_SELECTION, NATIVE_CONTENT_RESPONSE_LIMIT } from '../src/lib/native-content-export';

const scope = { projectId: v.id('projects'), branchId: v.id('branches') };
const connected = { ...scope, connectionId: v.id('cmsSanityBlogConnections'), connectionRevision: v.number() };
const draftScope = { ...connected, draftId: v.id('cmsSanityBlogDrafts'), expectedRevision: v.number(), providerRevision: v.union(v.string(), v.null()) };

export async function assertBlogBranch(ctx: QueryCtx | MutationCtx, args: BlogScope, capability: 'project.view' | 'project.update') {
    const access = await requireCap(ctx, capability, { projectId: args.projectId });
    const branch = await ctx.db.get(args.branchId);
    if (!branch || branch.projectId !== args.projectId || branch.runtimeType !== 'local') throw new Error('NOT_FOUND: local branch');
    return access;
}
function connectionOutput(row: Doc<'cmsSanityBlogConnections'>): BlogConnection {
    return { id: row._id, projectId: row.projectId, branchId: row.branchId, sanityProjectId: row.sanityProjectId, dataset: row.dataset, profile: row.profile, revision: row.revision };
}
function draftOutput(row: Doc<'cmsSanityBlogDrafts'>): BlogDraft {
    return { id: row._id, documentId: row.documentId, originalJson: row.originalJson, documentJson: row.documentJson, providerRevision: row.providerRevision, revision: row.revision, archived: row.archived, updatedAt: row.updatedAt };
}
async function loadConnection(ctx: QueryCtx | MutationCtx, args: BlogConnectionScope, capability: 'project.view' | 'project.update') {
    const access = await assertBlogBranch(ctx, args, capability);
    const row = await ctx.db.get(args.connectionId);
    if (!row || row.projectId !== args.projectId || row.branchId !== args.branchId || row.profile !== BLOG_PROFILE) throw new Error('NOT_FOUND: blog connection');
    if (row.revision !== args.connectionRevision) throw new Error('CONFLICT: blog connection changed');
    return { row, access };
}
async function loadDraft(ctx: QueryCtx | MutationCtx, args: BlogDraftScope) {
    const { access } = await loadConnection(ctx, args, 'project.update');
    const row = await ctx.db.get(args.draftId);
    if (!row || row.connectionId !== args.connectionId || row.branchId !== args.branchId || row.projectId !== args.projectId) throw new Error('NOT_FOUND: blog draft');
    if (row.revision !== args.expectedRevision || row.providerRevision !== args.providerRevision) throw new Error('CONFLICT: blog draft changed. Reopen before saving.');
    return { row, access };
}
async function assertSlugAvailable(ctx: MutationCtx, connectionId: Id<'cmsSanityBlogConnections'>, slug: string, except?: Id<'cmsSanityBlogDrafts'>) {
    const matches = await ctx.db.query('cmsSanityBlogDrafts').withIndex('by_connection_slug', q => q.eq('connectionId', connectionId).eq('slug', slug)).take(2);
    if (matches.some(row => row._id !== except)) throw new Error('CONFLICT: another Weblab draft has this address');
}
export const assertAccess = internalQuery({ args: { ...scope, capability: v.union(v.literal('project.view'), v.literal('project.update')) }, returns: v.null(), handler: async (ctx, args) => { await assertBlogBranch(ctx, args, args.capability); return null; } });
export const load = internalQuery({ args: { ...connected, capability: v.union(v.literal('project.view'), v.literal('project.update')) }, returns: connectionResult, handler: async (ctx, args) => connectionOutput((await loadConnection(ctx, args, args.capability)).row) });
export const connection = query({ args: scope, returns: v.union(connectionResult, v.null()), handler: async (ctx, args) => {
    await assertBlogBranch(ctx, args, 'project.view');
    const row = await ctx.db.query('cmsSanityBlogConnections').withIndex('by_branch', q => q.eq('branchId', args.branchId)).unique();
    return row ? connectionOutput(row) : null;
} });
export const createConnection = internalMutation({ args: { ...scope, sanityProjectId: v.string(), dataset: v.string() }, returns: connectionResult, handler: async (ctx, args) => {
    const { user } = await assertBlogBranch(ctx, args, 'project.update');
    const coordinates = sanitizeSanityCoordinates(args.sanityProjectId, args.dataset);
    const existing = await ctx.db.query('cmsSanityBlogConnections').withIndex('by_branch', q => q.eq('branchId', args.branchId)).unique();
    if (existing) {
        if (existing.sanityProjectId !== coordinates.projectId || existing.dataset !== coordinates.dataset) throw new Error('CONFLICT: this work copy is already connected to another dataset');
        return connectionOutput(existing);
    }
    const id = await ctx.db.insert('cmsSanityBlogConnections', { ...args, sanityProjectId: coordinates.projectId, dataset: coordinates.dataset, profile: BLOG_PROFILE, revision: 1, createdBy: user._id });
    const row = await ctx.db.get(id);
    if (!row) throw new Error('NOT_FOUND: blog connection');
    return connectionOutput(row);
} });
export const findDraft = internalQuery({ args: { ...connected, documentId: v.string() }, returns: v.union(draftResult, v.null()), handler: async (ctx, args) => {
    await loadConnection(ctx, args, 'project.view');
    const row = await ctx.db.query('cmsSanityBlogDrafts').withIndex('by_connection_document', q => q.eq('connectionId', args.connectionId).eq('documentId', args.documentId)).unique();
    return row ? draftOutput(row) : null;
} });
export const capture = internalMutation({ args: { ...connected, documentJson: v.string() }, returns: draftResult, handler: async (ctx, args) => {
    const { access } = await loadConnection(ctx, args, 'project.update');
    const doc = parseBlogDocument(args.documentJson);
    if (typeof doc._rev !== 'string' || !doc._rev || typeof doc._id !== 'string' || doc._id.startsWith('drafts.') || doc._id.startsWith('versions.')) throw new Error('BAD_REQUEST: published blog version required');
    const summary = blogSummary(args.documentJson);
    const existing = await ctx.db.query('cmsSanityBlogDrafts').withIndex('by_connection_document', q => q.eq('connectionId', args.connectionId).eq('documentId', summary.documentId)).unique();
    // A slow provider response cannot replace a baseline or edits captured meanwhile.
    if (existing) return draftOutput(existing);
    await assertSlugAvailable(ctx, args.connectionId, summary.slug);
    const id = await ctx.db.insert('cmsSanityBlogDrafts', { projectId: args.projectId, branchId: args.branchId, connectionId: args.connectionId, documentId: summary.documentId, originalJson: args.documentJson, documentJson: args.documentJson, providerRevision: doc._rev, revision: 1, slug: summary.slug, archived: false, updatedAt: Date.now(), updatedBy: access.user._id });
    return draftOutput((await ctx.db.get(id))!);
} });
export const drafts = query({ args: { ...connected, cursor: v.optional(v.string()) }, returns: blogDraftPageValidator, handler: async (ctx, args) => {
    await loadConnection(ctx, args, 'project.view');
    if (args.cursor !== undefined && !/^[A-Za-z0-9_.-]{1,128}$/.test(args.cursor)) throw new Error('BAD_REQUEST: draft cursor');
    // Nine worst-case 512KiB rows stay within a bounded transaction read.
    const rows = await ctx.db.query('cmsSanityBlogDrafts').withIndex('by_connection_document', q => args.cursor === undefined ? q.eq('connectionId', args.connectionId) : q.eq('connectionId', args.connectionId).gt('documentId', args.cursor)).take(9);
    const page = rows.slice(0, 8);
    return { items: page.map(row => ({ ...blogSummary(row.documentJson), id: row._id, revision: row.revision, archived: row.archived, updatedAt: row.updatedAt })), cursor: rows.length > 8 ? page.at(-1)!.documentId : null };
} });
export const publicationDrafts = query({
    args: { ...connected, cursor: v.optional(v.string()) },
    returns: v.object({ items: v.array(v.object({ id: v.id('cmsSanityBlogDrafts'), documentId: v.string(), title: v.string(), slug: v.string(), revision: v.number(), providerRevision: v.union(v.string(), v.null()), archived: v.boolean() })), cursor: v.union(v.string(), v.null()) }),
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.publish', { projectId: args.projectId });
        await loadConnection(ctx, args, 'project.view');
        if (args.cursor !== undefined && !/^[A-Za-z0-9_.-]{1,128}$/.test(args.cursor)) throw new Error('BAD_REQUEST: draft cursor');
        const rows = await ctx.db.query('cmsSanityBlogDrafts').withIndex('by_connection_document', q => args.cursor === undefined ? q.eq('connectionId', args.connectionId) : q.eq('connectionId', args.connectionId).gt('documentId', args.cursor)).take(9);
        const page = rows.slice(0, 8);
        return { items: page.map(row => {
            const { title, slug } = blogSummary(row.documentJson);
            return { id: row._id, documentId: row.documentId, title, slug, revision: row.revision, providerRevision: row.providerRevision, archived: row.archived };
        }), cursor: rows.length > 8 ? page.at(-1)!.documentId : null };
    },
});

export const exportSelected = query({
    args: { ...connected, selections: v.array(v.object({ draftId: v.id('cmsSanityBlogDrafts'), expectedRevision: v.number(), providerRevision: v.union(v.string(), v.null()), archived: v.boolean() })) },
    returns: v.object({ version: v.literal(1), userId: v.string(), connection: connectionResult, drafts: v.array(draftResult) }),
    handler: async (ctx, args) => {
        const access = await requireCap(ctx, 'project.publish', { projectId: args.projectId });
        const { row: connection } = await loadConnection(ctx, args, 'project.view');
        if (args.selections.length > NATIVE_CONTENT_MAX_SELECTION || new Set(args.selections.map((pin) => pin.draftId)).size !== args.selections.length) throw new Error('BAD_REQUEST: bounded unique draft selection required');
        const selected: BlogDraft[] = [];
        for (const pin of args.selections) {
            if (!Number.isSafeInteger(pin.expectedRevision) || pin.expectedRevision < 1) throw new Error('BAD_REQUEST: draft revision');
            const row = await ctx.db.get(pin.draftId);
            if (!row || row.projectId !== args.projectId || row.branchId !== args.branchId || row.connectionId !== args.connectionId) throw new Error('NOT_FOUND: selected blog draft');
            if (row.revision !== pin.expectedRevision || row.providerRevision !== pin.providerRevision || row.archived !== pin.archived) throw new Error('CONFLICT: selected blog draft changed. Review again.');
            selected.push(draftOutput(row));
        }
        const result = { version: 1 as const, userId: access.user.clerkUserId, connection: connectionOutput(connection), drafts: selected };
        if (new TextEncoder().encode(JSON.stringify(result)).byteLength > NATIVE_CONTENT_RESPONSE_LIMIT) throw new Error('BAD_REQUEST: selected content exceeds the export size limit');
        return result;
    },
});
export const create = mutation({ args: { ...connected, operationId: v.string(), title: v.string(), slug: v.string(), publishedAt: v.string() }, returns: draftResult, handler: async (ctx, args) => {
    const { access } = await loadConnection(ctx, args, 'project.update');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.operationId)) throw new Error('BAD_REQUEST: post identity');
    const documentId = `weblab-${args.operationId}`;
    const documentJson = newBlogDocument(documentId, args.title, args.slug, args.publishedAt);
    const existing = await ctx.db.query('cmsSanityBlogDrafts').withIndex('by_connection_document', q => q.eq('connectionId', args.connectionId).eq('documentId', documentId)).unique();
    if (existing) {
        if (existing.originalJson !== documentJson) throw new Error('CONFLICT: post identity belongs to different initial content');
        return draftOutput(existing);
    }
    await assertSlugAvailable(ctx, args.connectionId, args.slug);
    const id = await ctx.db.insert('cmsSanityBlogDrafts', { projectId: args.projectId, branchId: args.branchId, connectionId: args.connectionId, documentId, originalJson: documentJson, documentJson, providerRevision: null, revision: 1, slug: args.slug, archived: false, updatedAt: Date.now(), updatedBy: access.user._id });
    return draftOutput((await ctx.db.get(id))!);
} });
export const save = mutation({ args: { ...draftScope, operationsJson: v.string() }, returns: draftResult, handler: async (ctx, args) => {
    const { row, access } = await loadDraft(ctx, args);
    if (row.archived) throw new Error('CONFLICT: restore this draft before editing');
    const documentJson = applyBlogOperations(row.documentJson, args.operationsJson);
    const summary = blogSummary(documentJson);
    await assertSlugAvailable(ctx, args.connectionId, summary.slug, row._id);
    await ctx.db.patch(row._id, { documentJson, slug: summary.slug, revision: row.revision + 1, updatedAt: Date.now(), updatedBy: access.user._id });
    return draftOutput((await ctx.db.get(row._id))!);
} });
export const archive = mutation({ args: { ...draftScope, archived: v.boolean() }, returns: draftResult, handler: async (ctx, args) => {
    const { row, access } = await loadDraft(ctx, args);
    await ctx.db.patch(row._id, { archived: args.archived, revision: row.revision + 1, updatedAt: Date.now(), updatedBy: access.user._id });
    return draftOutput((await ctx.db.get(row._id))!);
} });

export const cleanupBranch = internalMutation({ args: { branchId: v.id('branches') }, returns: v.null(), handler: async (ctx, { branchId }) => {
    if (await ctx.db.get(branchId)) throw new Error('CONFLICT: branch still exists');
    const rows = await ctx.db.query('cmsSanityBlogDrafts').withIndex('by_branch', q => q.eq('branchId', branchId)).take(8);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 8) await ctx.scheduler.runAfter(0, makeFunctionReference<'mutation', { branchId: Id<'branches'> }, null>('cmsSanityBlog:cleanupBranch'), { branchId });
    else {
        const connections = await ctx.db.query('cmsSanityBlogConnections').withIndex('by_branch', q => q.eq('branchId', branchId)).take(2);
        for (const row of connections) await ctx.db.delete(row._id);
    }
    return null;
} });
