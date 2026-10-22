import { makeFunctionReference } from 'convex/server';
import type { Id } from '../../convex/_generated/dataModel';
import type { BlogSummary } from '../../convex/lib/sanityBlogContract';

export type BlogScope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
export interface BlogConnection extends BlogScope {
    id: Id<'cmsSanityBlogConnections'>;
    sanityProjectId: string;
    dataset: string;
    profile: 'sanity-blog-v1';
    revision: number;
}
export type BlogConnectionScope = BlogScope & { connectionId: Id<'cmsSanityBlogConnections'>; connectionRevision: number };
export interface BlogDraft {
    id: Id<'cmsSanityBlogDrafts'>;
    documentId: string;
    originalJson: string;
    documentJson: string;
    providerRevision: string | null;
    revision: number;
    archived: boolean;
    updatedAt: number;
}
export type BlogDraftScope = BlogConnectionScope & { draftId: Id<'cmsSanityBlogDrafts'>; expectedRevision: number; providerRevision: string | null };
export interface BlogDraftSummary extends BlogSummary { id: Id<'cmsSanityBlogDrafts'>; revision: number; archived: boolean; updatedAt: number }
export const sanityBlogApi = {
    connection: makeFunctionReference<'query', BlogScope, BlogConnection | null>('cmsSanityBlog:connection'),
    connect: makeFunctionReference<'action', BlogScope & { sanityProjectId: string; dataset: string }, BlogConnection>('cmsSanityBlogActions:connect'),
    list: makeFunctionReference<'action', BlogConnectionScope & { cursor?: string }, { items: BlogSummary[]; cursor: string | null }>('cmsSanityBlogActions:list'),
    drafts: makeFunctionReference<'query', BlogConnectionScope & { cursor?: string }, { items: BlogDraftSummary[]; cursor: string | null }>('cmsSanityBlog:drafts'),
    open: makeFunctionReference<'action', BlogConnectionScope & { documentId: string }, BlogDraft>('cmsSanityBlogActions:open'),
    create: makeFunctionReference<'mutation', BlogConnectionScope & { operationId: string; title: string; slug: string; publishedAt: string }, BlogDraft>('cmsSanityBlog:create'),
    save: makeFunctionReference<'mutation', BlogDraftScope & { operationsJson: string }, BlogDraft>('cmsSanityBlog:save'),
    archive: makeFunctionReference<'mutation', BlogDraftScope & { archived: boolean }, BlogDraft>('cmsSanityBlog:archive'),
};
