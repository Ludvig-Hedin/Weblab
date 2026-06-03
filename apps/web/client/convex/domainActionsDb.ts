import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import { getUserByClerkIdSafe, requireCap } from './lib/permissions';
import { slugFromNameForSubdomain } from './lib/previewSlug';

// V8-runtime DB helpers invoked by domainActions.ts. Split from the action
// file because Convex `"use node"` modules cannot also export queries/mutations
// running under the default runtime — the cost of crypto + freestyle SDK
// would be paid by every read otherwise.
//
// Apex/subdomain parsing happens inside the action (Node-only `tldts`) — these
// mutations accept already-parsed inputs.

const NEXT_PUBLIC_HOSTING_DOMAIN = process.env.NEXT_PUBLIC_HOSTING_DOMAIN ?? 'weblab.app';

const slugifyForSubdomain = (projectId: string): string =>
    projectId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'project';

/**
 * Default preview subdomain for a project that hasn't set `previewSlug`.
 * Prefers a label derived from the project NAME (so `<name>.weblab.app` reads
 * like the site); falls back to the id-derived slug when the name yields
 * nothing valid. Guarantees global uniqueness by appending `-2`, `-3`… against
 * both published preview domains and other projects' reserved slugs — so the
 * caller's collision check never trips on an auto-default.
 */
async function deriveUniquePreviewSlug(
    ctx: MutationCtx,
    name: string | undefined,
    projectId: Id<'projects'>,
): Promise<string> {
    const base = slugFromNameForSubdomain(name ?? '') ?? slugifyForSubdomain(projectId);
    const isTaken = async (candidate: string): Promise<boolean> => {
        const domain = `${candidate}.${NEXT_PUBLIC_HOSTING_DOMAIN}`;
        const domainHit = await ctx.db
            .query('previewDomains')
            .withIndex('by_full_domain', (q) => q.eq('fullDomain', domain))
            .first();
        if (domainHit && domainHit.projectId !== projectId) return true;
        const slugHit = await ctx.db
            .query('projects')
            .withIndex('by_preview_slug', (q) => q.eq('previewSlug', candidate))
            .first();
        return slugHit !== null && slugHit._id !== projectId;
    };
    if (!(await isTaken(base))) return base;
    for (let n = 2; n < 1000; n++) {
        const suffix = `-${n}`;
        const candidate = `${base.slice(0, 48 - suffix.length)}${suffix}`;
        if (!(await isTaken(candidate))) return candidate;
    }
    // The id-derived slug is globally unique by construction (no two projects
    // share an id), so this is always free.
    return slugifyForSubdomain(projectId);
}

async function findExistingPendingVerification(
    ctx: QueryCtx | MutationCtx,
    projectId: Id<'projects'>,
    customDomainId: Id<'customDomains'>,
) {
    const rows = await ctx.db
        .query('customDomainVerification')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    return rows.find((row) => row.customDomainId === customDomainId && row.status === 'pending');
}

export const _previewCreate = internalMutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }): Promise<{ domain: string }> => {
        await requireCap(ctx, 'project.publish', { projectId });
        // Honor a user-chosen subdomain (domains.setPreviewSlug); otherwise
        // derive a unique label from the project name (id-based fallback).
        const project = await ctx.db.get(projectId);
        const slug = project?.previewSlug ?? (await deriveUniquePreviewSlug(ctx, project?.name, projectId));
        const domain = `${slug}.${NEXT_PUBLIC_HOSTING_DOMAIN}`;

        const collision = await ctx.db
            .query('previewDomains')
            .withIndex('by_full_domain', (q) => q.eq('fullDomain', domain))
            .first();
        if (collision && collision.projectId !== projectId) {
            throw new Error(`BAD_REQUEST: Domain ${domain} already taken`);
        }

        const existing = await ctx.db
            .query('previewDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        const now = Date.now();
        if (existing) {
            await ctx.db.patch(existing._id, { fullDomain: domain, updatedAt: now });
        } else {
            await ctx.db.insert('previewDomains', {
                fullDomain: domain,
                projectId,
                updatedAt: now,
            });
        }
        return { domain };
    },
});

export const _customRemove = internalMutation({
    args: {
        domain: v.string(),
        projectId: v.id('projects'),
    },
    handler: async (ctx, { domain, projectId }) => {
        await requireCap(ctx, 'project.publish', { projectId });

        const verifications = await ctx.db
            .query('customDomainVerification')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        for (const row of verifications) {
            if (row.fullDomain === domain) {
                await ctx.db.patch(row._id, {
                    status: 'cancelled',
                    updatedAt: Date.now(),
                });
            }
        }

        const projectDomains = await ctx.db
            .query('projectCustomDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        for (const row of projectDomains) {
            if (row.fullDomain === domain) {
                await ctx.db.patch(row._id, {
                    status: 'cancelled',
                    updatedAt: Date.now(),
                });
            }
        }
        return { ok: true } as const;
    },
});

export const _verificationCancel = internalMutation({
    args: { verificationId: v.id('customDomainVerification') },
    handler: async (ctx, { verificationId }) => {
        const existing = await ctx.db.get(verificationId);
        if (!existing) throw new Error('NOT_FOUND: verification');
        await requireCap(ctx, 'project.publish', { projectId: existing.projectId });
        await ctx.db.patch(verificationId, {
            status: 'cancelled',
            updatedAt: Date.now(),
        });
        return { ok: true } as const;
    },
});

export const _ensureCustomDomainForVerification = internalMutation({
    args: {
        domain: v.string(),
        projectId: v.id('projects'),
        // Pre-parsed apex + subdomain from the Node action layer. The action
        // uses tldts (Public Suffix List), so multi-label TLDs like
        // `foo.co.uk`, `mysite.github.io`, `app.vercel.app` are split
        // correctly. The V8 runtime can't load tldts, so we accept the
        // parsed pair as args instead of computing here.
        apexDomain: v.string(),
        subdomain: v.union(v.string(), v.null()),
    },
    handler: async (ctx, { domain: _domain, projectId, apexDomain, subdomain }) => {
        await requireCap(ctx, 'project.publish', { projectId });

        const existing = await ctx.db
            .query('customDomains')
            .withIndex('by_apex_domain', (q) => q.eq('apexDomain', apexDomain))
            .first();

        let customDomainId: Id<'customDomains'>;
        if (existing) {
            await ctx.db.patch(existing._id, { updatedAt: Date.now() });
            customDomainId = existing._id;
        } else {
            customDomainId = await ctx.db.insert('customDomains', {
                apexDomain,
                verified: false,
                updatedAt: Date.now(),
            });
        }

        const existingVerification = await findExistingPendingVerification(
            ctx,
            projectId,
            customDomainId,
        );
        if (existingVerification) {
            const customDomain = await ctx.db.get(customDomainId);
            return {
                customDomainId,
                subdomain,
                existing: { ...existingVerification, customDomain },
            };
        }

        return { customDomainId, subdomain, existing: null };
    },
});

export const _verificationInsert = internalMutation({
    args: {
        projectId: v.id('projects'),
        customDomainId: v.id('customDomains'),
        domain: v.string(),
        freestyleVerificationId: v.string(),
        txtRecord: v.any(),
        aRecords: v.array(v.any()),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert('customDomainVerification', {
            customDomainId: args.customDomainId,
            projectId: args.projectId,
            fullDomain: args.domain,
            freestyleVerificationId: args.freestyleVerificationId,
            txtRecord: args.txtRecord,
            aRecords: args.aRecords,
            status: 'pending',
            updatedAt: Date.now(),
        });
        const row = (await ctx.db.get(id))!;
        const customDomain = await ctx.db.get(args.customDomainId);
        return { ...row, customDomain };
    },
});

export const _getPendingVerification = internalQuery({
    args: { verificationId: v.id('customDomainVerification') },
    handler: async (ctx, { verificationId }) => {
        const row = await ctx.db.get(verificationId);
        if (row?.status !== 'pending') return null;
        // SECURITY: gate the verify flow on the same cap as every other domain
        // mutation. Auth propagates from the verificationVerify action via
        // ctx.runQuery, so this rejects a caller who passes a verificationId for
        // a project they don't own (defense-in-depth — Convex ids are opaque,
        // but the rest of the domain surface gates here so this must too).
        await requireCap(ctx, 'project.publish', { projectId: row.projectId });
        return row;
    },
});

export const _verificationMarkVerified = internalMutation({
    args: {
        verificationId: v.id('customDomainVerification'),
        customDomainId: v.id('customDomains'),
        projectId: v.id('projects'),
        domain: v.string(),
    },
    handler: async (ctx, args) => {
        const customDomain = await ctx.db.get(args.customDomainId);
        if (!customDomain) throw new Error('NOT_FOUND: custom domain');
        await ctx.db.patch(args.customDomainId, {
            verified: true,
            updatedAt: Date.now(),
        });
        // Re-verifying a previously cancelled / removed domain would otherwise
        // insert a duplicate `projectCustomDomains` row. `customGet` then picks
        // one arbitrarily via `.first()`, surfacing stale URLs in production.
        // Look up by (customDomainId, projectId) and patch instead of insert.
        const existing = await ctx.db
            .query('projectCustomDomains')
            .withIndex('by_domain_project', (q) =>
                q.eq('customDomainId', args.customDomainId).eq('projectId', args.projectId),
            )
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                fullDomain: args.domain,
                status: 'active',
                updatedAt: Date.now(),
            });
        } else {
            await ctx.db.insert('projectCustomDomains', {
                customDomainId: args.customDomainId,
                projectId: args.projectId,
                fullDomain: args.domain,
                status: 'active',
                updatedAt: Date.now(),
            });
        }
        await ctx.db.patch(args.verificationId, {
            status: 'verified',
            updatedAt: Date.now(),
        });
        return { ok: true } as const;
    },
});

/**
 * Confirms the caller previously completed a real DNS verification for this
 * full domain on at least one of their projects. Mirrors
 * src/server/api/routers/domain/verify/helpers/helpers.ts::ensureUserOwnsDomain.
 */
export const _ensureUserOwnsDomain = internalQuery({
    args: {
        fullDomain: v.string(),
        projectId: v.id('projects'),
    },
    handler: async (ctx, { fullDomain, projectId }) => {
        await requireCap(ctx, 'project.publish', { projectId });

        const verifications = await ctx.db
            .query('customDomainVerification')
            .withIndex('by_full_domain', (q) => q.eq('fullDomain', fullDomain))
            .collect();
        const verified = verifications.filter((v_) => v_.status === 'verified');
        if (verified.length === 0) return { ownsDomain: false };

        // The caller's accessible projectIds are anything they're a project
        // member of plus all projects in workspaces they're a member of.
        // Mirrors the legacy `userProjects` join used by ensureUserOwnsDomain.
        const me = (await ctx.auth.getUserIdentity())!;
        // `.collect()` + dedupe via the shared helper — never `.unique()` on
        // by_clerk_user_id (JIT/webhook race tolerance).
        const userRow = await getUserByClerkIdSafe(ctx, me.subject);
        if (!userRow) return { ownsDomain: false };

        const projectMems = await ctx.db
            .query('projectMembers')
            .withIndex('by_user', (q) => q.eq('userId', userRow._id))
            .collect();
        const projectIdSet = new Set<string>(projectMems.map((p) => p.projectId));

        const wsMems = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_user', (q) => q.eq('userId', userRow._id))
            .collect();
        for (const m of wsMems) {
            const wp = await ctx.db
                .query('projects')
                .withIndex('by_workspace', (q) => q.eq('workspaceId', m.workspaceId))
                .collect();
            for (const p of wp) projectIdSet.add(p._id);
        }

        return {
            ownsDomain: verified.some((v_) => projectIdSet.has(v_.projectId)),
        };
    },
});

export const _ensureCustomDomainForOwned = internalMutation({
    args: {
        fullDomain: v.string(),
        projectId: v.id('projects'),
        // Pre-parsed apex from the Node action layer (tldts-backed).
        apexDomain: v.string(),
    },
    handler: async (ctx, { fullDomain: _fullDomain, projectId, apexDomain }) => {
        await requireCap(ctx, 'project.publish', { projectId });

        const existing = await ctx.db
            .query('customDomains')
            .withIndex('by_apex_domain', (q) => q.eq('apexDomain', apexDomain))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { updatedAt: Date.now() });
            return { apexDomain, customDomainId: existing._id };
        }
        const customDomainId = await ctx.db.insert('customDomains', {
            apexDomain,
            verified: false,
            updatedAt: Date.now(),
        });
        return { apexDomain, customDomainId };
    },
});

export const _insertOwnedProjectDomain = internalMutation({
    args: {
        projectId: v.id('projects'),
        fullDomain: v.string(),
        customDomainId: v.id('customDomains'),
    },
    handler: async (ctx, { projectId, fullDomain, customDomainId }) => {
        // Dedup against the same domain previously attached then cancelled —
        // mirrors `_verificationMarkVerified` to keep `customGet`'s `.first()`
        // deterministic.
        const existing = await ctx.db
            .query('projectCustomDomains')
            .withIndex('by_domain_project', (q) =>
                q.eq('customDomainId', customDomainId).eq('projectId', projectId),
            )
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                fullDomain,
                status: 'active',
                updatedAt: Date.now(),
            });
            return (await ctx.db.get(existing._id))!;
        }
        const id = await ctx.db.insert('projectCustomDomains', {
            customDomainId,
            projectId,
            fullDomain,
            status: 'active',
            updatedAt: Date.now(),
        });
        return (await ctx.db.get(id))!;
    },
});

