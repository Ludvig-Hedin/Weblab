import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import { requireCap } from './lib/permissions';

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
        const domain = `${slugifyForSubdomain(projectId)}.${NEXT_PUBLIC_HOSTING_DOMAIN}`;

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
    },
    handler: async (ctx, { domain, projectId }) => {
        await requireCap(ctx, 'project.publish', { projectId });

        // Parse apex without tldts (V8 runtime). Falls back to the full
        // domain when we can't reliably split — Freestyle still accepts it
        // as a single apex in that case.
        const { apexDomain, subdomain } = simpleParseDomain(domain);

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
        await ctx.db.insert('projectCustomDomains', {
            customDomainId: args.customDomainId,
            projectId: args.projectId,
            fullDomain: args.domain,
            status: 'active',
            updatedAt: Date.now(),
        });
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
        const userRow = await ctx.db
            .query('users')
            .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', me.subject))
            .unique();
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
    },
    handler: async (ctx, { fullDomain, projectId }) => {
        await requireCap(ctx, 'project.publish', { projectId });
        const { apexDomain } = simpleParseDomain(fullDomain);

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

/**
 * Best-effort apex extraction without tldts. Treats the last two labels as
 * apex (works for .com/.io/etc.) and the rest as subdomain. Edge TLDs like
 * .co.uk fall back to "entire string is apex"; Freestyle accepts this and
 * the verification flow will still surface DNS errors clearly.
 */
function simpleParseDomain(domain: string): {
    apexDomain: string;
    subdomain: string | null;
} {
    const cleaned = domain.trim().toLowerCase();
    if (!cleaned.includes('.')) {
        throw new Error(`BAD_REQUEST: Invalid domain format ${domain}`);
    }
    const labels = cleaned.split('.');
    if (labels.length <= 2) {
        return { apexDomain: cleaned, subdomain: null };
    }
    const apex = labels.slice(-2).join('.');
    const subdomain = labels.slice(0, -2).join('.');
    return { apexDomain: apex, subdomain };
}
