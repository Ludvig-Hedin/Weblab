import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireCap, requireUser } from './lib/permissions';
import { validatePreviewSlug } from './lib/previewSlug';

// Keep in lockstep with domainActionsDb.ts so the slug a user reserves here
// produces the exact domain `_previewCreate` later publishes.
const HOSTING_DOMAIN = process.env.NEXT_PUBLIC_HOSTING_DOMAIN ?? 'weblab.app';

// Convex port of:
//   src/server/api/routers/domain/index.ts (getAll)
//   src/server/api/routers/domain/preview.ts (get)
//   src/server/api/routers/domain/custom.ts (get, getOwnedDomains)
//   src/server/api/routers/domain/verify/index.ts (getActive)
//
// DB-only reads — actions live in domainActions.ts.

const toDomainInfoFromPreview = (
    row: Doc<'previewDomains'>,
): { url: string; type: 'preview'; publishedAt: number } => ({
    url: row.fullDomain,
    type: 'preview',
    publishedAt: row.updatedAt,
});

const toDomainInfoFromPublished = (
    row: Doc<'projectCustomDomains'>,
): {
    url: string;
    type: 'custom';
    publishedAt: number;
    status: Doc<'projectCustomDomains'>['status'];
} => ({
    url: row.fullDomain,
    type: 'custom',
    publishedAt: row.updatedAt,
    status: row.status,
});

export const getAll = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const preview = await ctx.db
            .query('previewDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        const published = await ctx.db
            .query('projectCustomDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        return {
            preview: preview ? toDomainInfoFromPreview(preview) : null,
            published: published ? toDomainInfoFromPublished(published) : null,
        };
    },
});

export const previewGet = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const preview = await ctx.db
            .query('previewDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        return preview ? toDomainInfoFromPreview(preview) : null;
    },
});

export const customGet = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const customDomain = await ctx.db
            .query('projectCustomDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        return customDomain ? toDomainInfoFromPublished(customDomain) : null;
    },
});

/**
 * All custom domains attached to projects the caller has access to via
 * workspace or project membership. Mirrors the legacy tRPC
 * `domain.custom.getOwnedDomains`.
 */
export const customGetOwnedDomains = query({
    args: {},
    handler: async (ctx): Promise<string[]> => {
        const user = await requireUser(ctx);
        // Resolve projects via workspaces the user belongs to (workspace
        // members get implicit view access on workspace-scoped projects).
        const memberships = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        const workspaceIds = memberships.map((m) => m.workspaceId);
        const workspaceProjects = (
            await Promise.all(
                workspaceIds.map((wsId) =>
                    ctx.db
                        .query('projects')
                        .withIndex('by_workspace', (q) => q.eq('workspaceId', wsId))
                        .collect(),
                ),
            )
        ).flat();

        const projectMembers = await ctx.db
            .query('projectMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        const directProjects = await Promise.all(
            projectMembers.map((pm) => ctx.db.get(pm.projectId)),
        );

        const projectIdSet = new Set<string>();
        for (const p of workspaceProjects) projectIdSet.add(p._id);
        for (const p of directProjects) if (p) projectIdSet.add(p._id);

        const domainsLists = await Promise.all(
            [...projectIdSet].map((pid) =>
                ctx.db
                    .query('projectCustomDomains')
                    .withIndex('by_project', (q) =>
                        q.eq('projectId', pid as Doc<'projects'>['_id']),
                    )
                    .collect(),
            ),
        );
        const out = new Set<string>();
        for (const list of domainsLists) for (const d of list) out.add(d.fullDomain);
        return [...out];
    },
});

export const verificationGetActive = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('customDomainVerification')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        const active = rows.find((row) => row.status === 'pending' || row.status === 'verified');
        if (!active) return null;
        const customDomain = await ctx.db.get(active.customDomainId);
        return { ...active, customDomain };
    },
});

/**
 * The project's free Weblab preview subdomain settings. `slug` is the chosen
 * label (null when never set — caller should show a placeholder); `hostingDomain`
 * is the suffix to render `<slug>.<hostingDomain>`; `publishedDomain` is the
 * actually-live preview domain (null until the project is published).
 */
export const previewSlugGet = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const project = await ctx.db.get(projectId);
        const preview = await ctx.db
            .query('previewDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        return {
            slug: project?.previewSlug ?? null,
            hostingDomain: HOSTING_DOMAIN,
            publishedDomain: preview?.fullDomain ?? null,
        };
    },
});

/**
 * Reserve/rename the project's free Weblab preview subdomain. Validates format
 * and global uniqueness (against both published preview domains and other
 * projects' reserved slugs). The chosen slug is applied the next time the
 * project publishes (see `_previewCreate`).
 */
export const setPreviewSlug = mutation({
    args: { projectId: v.id('projects'), slug: v.string() },
    handler: async (ctx, { projectId, slug }) => {
        await requireCap(ctx, 'project.update', { projectId });

        const validation = validatePreviewSlug(slug);
        if (!validation.ok) {
            throw new Error(`BAD_REQUEST: ${validation.error}`);
        }
        const normalized = validation.normalized;

        const fullDomain = `${normalized}.${HOSTING_DOMAIN}`;

        // Collision with an already-published preview domain of another project.
        const publishedCollision = await ctx.db
            .query('previewDomains')
            .withIndex('by_full_domain', (q) => q.eq('fullDomain', fullDomain))
            .first();
        if (publishedCollision && publishedCollision.projectId !== projectId) {
            throw new Error('BAD_REQUEST: That subdomain is already taken.');
        }

        // Collision with another project's reserved (not-yet-published) slug.
        const slugCollision = await ctx.db
            .query('projects')
            .withIndex('by_preview_slug', (q) => q.eq('previewSlug', normalized))
            .first();
        if (slugCollision && slugCollision._id !== projectId) {
            throw new Error('BAD_REQUEST: That subdomain is already taken.');
        }

        await ctx.db.patch(projectId, { previewSlug: normalized });
        return { slug: normalized, fullDomain };
    },
});
