import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const blogConnectionValidator = v.object({
    projectId: v.id('projects'), branchId: v.id('branches'), id: v.id('cmsSanityBlogConnections'),
    sanityProjectId: v.string(), dataset: v.string(), profile: v.literal('sanity-blog-v1'), revision: v.number(),
});
export const blogDraftValidator = v.object({
    id: v.id('cmsSanityBlogDrafts'), documentId: v.string(), originalJson: v.string(), documentJson: v.string(),
    providerRevision: v.union(v.string(), v.null()), revision: v.number(), archived: v.boolean(), updatedAt: v.number(),
});
const summaryFields = { documentId: v.string(), title: v.string(), slug: v.string(), excerpt: v.string(), publishedAt: v.string() };
export const blogPageValidator = v.object({ items: v.array(v.object(summaryFields)), cursor: v.union(v.string(), v.null()) });
export const blogDraftPageValidator = v.object({
    items: v.array(v.object({ ...summaryFields, id: v.id('cmsSanityBlogDrafts'), revision: v.number(), archived: v.boolean(), updatedAt: v.number() })), cursor: v.union(v.string(), v.null()),
});

export const sanityBlogTables = {
    cmsSanityBlogConnections: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'),
        sanityProjectId: v.string(), dataset: v.string(), profile: v.literal('sanity-blog-v1'),
        revision: v.number(), createdBy: v.id('users'),
    }).index('by_project', ['projectId']).index('by_branch', ['branchId']),
    cmsSanityBlogDrafts: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), connectionId: v.id('cmsSanityBlogConnections'),
        documentId: v.string(), originalJson: v.string(), documentJson: v.string(),
        providerRevision: v.union(v.string(), v.null()), revision: v.number(),
        slug: v.string(), archived: v.boolean(), updatedAt: v.number(), updatedBy: v.id('users'),
    }).index('by_connection_document', ['connectionId', 'documentId'])
        .index('by_connection_slug', ['connectionId', 'slug'])
        .index('by_branch', ['branchId']),
};
