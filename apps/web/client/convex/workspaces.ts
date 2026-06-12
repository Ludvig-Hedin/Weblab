import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, mutation, query } from './_generated/server';
import { audit } from './lib/audit';
import { vWorkspaceRole } from './lib/enums';
import { requireCap, requireUser } from './lib/permissions';
import { generateUniqueWorkspaceSlug } from './lib/workspaceSlug';

const PERSONAL = 'personal' as const;
const TEAM = 'team' as const;
const OWNER = 'owner' as const;

async function getMembership(
    ctx: QueryCtx | MutationCtx,
    workspaceId: Doc<'workspaces'>['_id'],
    userId: Doc<'users'>['_id'],
) {
    return ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace_user', (q) =>
            q.eq('workspaceId', workspaceId).eq('userId', userId),
        )
        .unique();
}

export const list = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const memberships = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        const out = await Promise.all(
            memberships.map(async (m) => {
                const ws = await ctx.db.get(m.workspaceId);
                return ws ? { ...ws, viewerRole: m.role } : null;
            }),
        );
        return out
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => {
                if (a.kind === PERSONAL && b.kind !== PERSONAL) return -1;
                if (b.kind === PERSONAL && a.kind !== PERSONAL) return 1;
                return a.name.localeCompare(b.name);
            });
    },
});

export const getBySlug = query({
    args: { slug: v.string() },
    handler: async (ctx, { slug }) => {
        const user = await requireUser(ctx);
        const ws = await ctx.db
            .query('workspaces')
            .withIndex('by_slug', (q) => q.eq('slug', slug))
            .unique();
        if (!ws) return null;
        const membership = await getMembership(ctx, ws._id, user._id);
        if (!membership) return null;
        return { ...ws, viewerRole: membership.role };
    },
});

export const get = query({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        const { workspace, workspaceRole } = await requireCap(ctx, 'workspace.view', {
            workspaceId,
        });
        return { ...workspace, viewerRole: workspaceRole };
    },
});

export const ensurePersonal = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db
            .query('workspaces')
            .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id))
            .filter((q) => q.eq(q.field('kind'), PERSONAL))
            .first();
        if (existing) return existing;

        const displayName =
            user.displayName?.trim() ||
            user.firstName?.trim() ||
            (user.email?.split('@')[0] ?? '') ||
            'Personal';
        const name = `${displayName}'s Workspace`;
        // Human-readable slug derived from the name (e.g. "martins-workspace").
        // Uniqueness across racing creates is guaranteed by Convex OCC: a
        // concurrent insert re-runs this handler, and the by_created_by_user
        // check above then returns the already-created workspace.
        const slug = await generateUniqueWorkspaceSlug(ctx, name);
        const now = Date.now();

        const id = await ctx.db.insert('workspaces', {
            name,
            slug,
            kind: PERSONAL,
            createdByUserId: user._id,
            updatedAt: now,
        });
        await ctx.db.insert('workspaceMembers', {
            workspaceId: id,
            userId: user._id,
            role: OWNER,
            updatedAt: now,
        });
        return (await ctx.db.get(id))!;
    },
});

export const createTeam = mutation({
    args: { name: v.string(), slug: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const name = args.name.trim();
        if (name.length === 0 || name.length > 80) throw new Error('BAD_REQUEST: name 1-80');

        let slug: string;
        if (args.slug !== undefined) {
            // Explicit, user-supplied slug: validate format, reject the
            // reserved `personal-` prefix, and fail loudly on collision.
            slug = args.slug.trim();
            if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2 || slug.length > 64) {
                throw new Error('BAD_REQUEST: slug invalid');
            }
            if (slug.startsWith('personal-')) {
                throw new Error('BAD_REQUEST: slug cannot start with "personal-"');
            }
            const collision = await ctx.db
                .query('workspaces')
                .withIndex('by_slug', (q) => q.eq('slug', slug))
                .unique();
            if (collision) throw new Error('CONFLICT: slug already in use');
        } else {
            // Default: derive a unique, human-readable slug from the name.
            slug = await generateUniqueWorkspaceSlug(ctx, name);
        }

        const now = Date.now();
        const id = await ctx.db.insert('workspaces', {
            name,
            slug,
            kind: TEAM,
            createdByUserId: user._id,
            updatedAt: now,
        });
        await ctx.db.insert('workspaceMembers', {
            workspaceId: id,
            userId: user._id,
            role: OWNER,
            updatedAt: now,
        });
        await audit(ctx, {
            event: 'workspace.created',
            workspaceId: id,
            actorUserId: user._id,
            payload: { name, slug, kind: TEAM },
        });
        return (await ctx.db.get(id))!;
    },
});

/**
 * One-off backfill: rewrite legacy `personal-<userId>` slugs to the
 * human-readable, name-derived form. Internal admin tool — invoke via
 * `npx convex run workspaces:_backfillPersonalSlugs`.
 *
 * Safe to re-run: a row is migrated only when its slug is *exactly* the legacy
 * `personal-<createdByUserId>` shape, so a name-derived slug that merely starts
 * with "personal-" (e.g. a workspace named "Personal A" → "personal-a-...") is
 * never touched, and already-migrated rows are skipped. Scans only the
 * `personal-*` slug range via the by_slug index, so re-runs read ~zero rows.
 */
export const _backfillPersonalSlugs = internalMutation({
    args: {},
    handler: async (ctx) => {
        // [`personal-`, `personal.`) is exactly the set of slugs with the
        // `personal-` prefix ('-' = U+002D sorts just below '.' = U+002E).
        const candidates = await ctx.db
            .query('workspaces')
            .withIndex('by_slug', (q) => q.gte('slug', 'personal-').lt('slug', 'personal.'))
            .collect();
        let updated = 0;
        for (const ws of candidates) {
            // Match the legacy format precisely: `personal-<createdByUserId>`.
            if (ws.kind !== PERSONAL) continue;
            if (ws.slug !== `personal-${ws.createdByUserId}`) continue;
            const slug = await generateUniqueWorkspaceSlug(ctx, ws.name);
            await ctx.db.patch(ws._id, { slug, updatedAt: Date.now() });
            updated++;
        }
        return { scanned: candidates.length, updated };
    },
});

export const update = mutation({
    args: {
        workspaceId: v.id('workspaces'),
        name: v.optional(v.string()),
        slug: v.optional(v.string()),
        avatarUrl: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, { workspaceId, name, slug, avatarUrl }) => {
        const { user, workspace } = await requireCap(ctx, 'workspace.update', {
            workspaceId,
        });
        const patch: Partial<Doc<'workspaces'>> = { updatedAt: Date.now() };
        if (name !== undefined) {
            const trimmed = name.trim();
            if (trimmed.length === 0 || trimmed.length > 80) throw new Error('BAD_REQUEST: name');
            patch.name = trimmed;
        }
        if (slug !== undefined) {
            if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2 || slug.length > 64) {
                throw new Error('BAD_REQUEST: slug invalid');
            }
            // Reserved prefix — mirrors the createTeam guard so the reserved
            // `personal-` namespace can't be claimed via the update path.
            if (slug.startsWith('personal-')) {
                throw new Error('BAD_REQUEST: slug cannot start with "personal-"');
            }
            const collision = await ctx.db
                .query('workspaces')
                .withIndex('by_slug', (q) => q.eq('slug', slug))
                .unique();
            if (collision && collision._id !== workspaceId) throw new Error('CONFLICT: slug');
            patch.slug = slug;
        }
        if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl ?? undefined;

        await ctx.db.patch(workspaceId, patch);
        const updated = (await ctx.db.get(workspaceId))!;
        await audit(ctx, {
            event: 'workspace.renamed',
            workspaceId,
            actorUserId: user._id,
            payload: { name: updated.name, slug: updated.slug },
        });
        return updated;
    },
});

export const remove = mutation({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        const { user, workspace } = await requireCap(ctx, 'workspace.delete', {
            workspaceId,
        });
        if (workspace.kind === PERSONAL) {
            throw new Error('BAD_REQUEST: personal workspaces cannot be deleted');
        }
        const projectsInWs = await ctx.db
            .query('projects')
            .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
            .collect();
        if (projectsInWs.length > 0) {
            throw new Error(
                `BAD_REQUEST: workspace still has ${projectsInWs.length} project(s). Move or delete them first.`,
            );
        }
        await audit(ctx, {
            event: 'workspace.deleted',
            workspaceId,
            actorUserId: user._id,
            payload: {
                name: workspace.name,
                slug: workspace.slug,
                kind: workspace.kind,
            },
        });
        const members = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspaceId))
            .collect();
        for (const m of members) await ctx.db.delete(m._id);
        const invites = await ctx.db
            .query('workspaceInvitations')
            .withIndex('by_workspace_email_status', (q) => q.eq('workspaceId', workspaceId))
            .collect();
        for (const i of invites) await ctx.db.delete(i._id);
        await ctx.db.delete(workspaceId);
        return { ok: true } as const;
    },
});

export const leave = mutation({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        const user = await requireUser(ctx);
        const membership = await getMembership(ctx, workspaceId, user._id);
        if (!membership) throw new Error('NOT_FOUND: not a member');
        if (membership.role === OWNER) {
            const owners = await ctx.db
                .query('workspaceMembers')
                .withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspaceId))
                .filter((q) => q.eq(q.field('role'), OWNER))
                .collect();
            if (owners.length <= 1) {
                throw new Error('BAD_REQUEST: last owner — transfer ownership first');
            }
        }
        await ctx.db.delete(membership._id);
        await audit(ctx, {
            event: 'workspace_member.removed',
            workspaceId,
            actorUserId: user._id,
            payload: { selfLeave: true },
        });
        return { ok: true } as const;
    },
});

export const transferOwnership = mutation({
    args: { workspaceId: v.id('workspaces'), newOwnerUserId: v.id('users') },
    handler: async (ctx, { workspaceId, newOwnerUserId }) => {
        const { user } = await requireCap(ctx, 'workspace.manage_members', {
            workspaceId,
        });
        const current = await getMembership(ctx, workspaceId, user._id);
        if (current?.role !== OWNER) throw new Error('FORBIDDEN: caller not owner');
        const target = await getMembership(ctx, workspaceId, newOwnerUserId);
        if (!target) throw new Error('NOT_FOUND: target not a member');
        const now = Date.now();
        await ctx.db.patch(target._id, { role: OWNER, updatedAt: now });
        await ctx.db.patch(current._id, { role: 'admin', updatedAt: now });
        await audit(ctx, {
            event: 'workspace_member.role_changed',
            workspaceId,
            actorUserId: user._id,
            payload: { fromUser: user._id, toUser: newOwnerUserId },
        });
        return { ok: true } as const;
    },
});

// ─── members ─────────────────────────────────────────────────────────────────

export const listMembers = query({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        await requireCap(ctx, 'workspace.view', { workspaceId });
        const rows = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspaceId))
            .collect();
        const enriched = await Promise.all(
            rows.map(async (m) => {
                const u = await ctx.db.get(m.userId);
                return {
                    ...m,
                    user: u
                        ? {
                              id: u._id,
                              email: u.email,
                              displayName: u.displayName ?? u.firstName ?? u.email,
                              avatarUrl: u.avatarUrl,
                          }
                        : null,
                };
            }),
        );
        return enriched;
    },
});

export const updateMemberRole = mutation({
    args: {
        workspaceId: v.id('workspaces'),
        userId: v.id('users'),
        role: vWorkspaceRole,
    },
    handler: async (ctx, { workspaceId, userId, role }) => {
        const { user } = await requireCap(ctx, 'workspace.manage_members', {
            workspaceId,
        });
        const target = await getMembership(ctx, workspaceId, userId);
        if (!target) throw new Error('NOT_FOUND: member');
        if (target.role === OWNER && role !== OWNER) {
            const owners = await ctx.db
                .query('workspaceMembers')
                .withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspaceId))
                .filter((q) => q.eq(q.field('role'), OWNER))
                .collect();
            if (owners.length <= 1) throw new Error('BAD_REQUEST: cannot demote last owner');
        }
        await ctx.db.patch(target._id, { role, updatedAt: Date.now() });
        await audit(ctx, {
            event: 'workspace_member.role_changed',
            workspaceId,
            actorUserId: user._id,
            payload: { targetUser: userId, role },
        });
        return (await ctx.db.get(target._id))!;
    },
});

export const removeMember = mutation({
    args: { workspaceId: v.id('workspaces'), userId: v.id('users') },
    handler: async (ctx, { workspaceId, userId }) => {
        const { user } = await requireCap(ctx, 'workspace.manage_members', {
            workspaceId,
        });
        if (userId === user._id) throw new Error('BAD_REQUEST: use leave() to remove self');
        const target = await getMembership(ctx, workspaceId, userId);
        if (!target) throw new Error('NOT_FOUND: member');
        if (target.role === OWNER)
            throw new Error('BAD_REQUEST: cannot remove owner — transfer first');
        await ctx.db.delete(target._id);
        await audit(ctx, {
            event: 'workspace_member.removed',
            workspaceId,
            actorUserId: user._id,
            payload: { targetUser: userId },
        });
        return { ok: true } as const;
    },
});

// ─── invitations ─────────────────────────────────────────────────────────────

function randomToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export const inviteCreate = mutation({
    args: {
        workspaceId: v.id('workspaces'),
        email: v.string(),
        role: vWorkspaceRole,
    },
    handler: async (ctx, { workspaceId, email, role }) => {
        const { user } = await requireCap(ctx, 'workspace.invite', { workspaceId });
        // Personal workspaces are intentionally single-seat. Reject invites
        // regardless of the caller's cap so a stale UI or hand-crafted call
        // cannot create a second member in someone's personal space.
        const workspace = await ctx.db.get(workspaceId);
        if (!workspace) throw new Error('NOT_FOUND: workspace');
        if (workspace.kind === PERSONAL) {
            throw new Error(
                'BAD_REQUEST: Personal workspaces cannot have invitations. Create a team workspace to collaborate.',
            );
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            throw new Error('BAD_REQUEST: invalid email');
        }
        const pendingRows = await ctx.db
            .query('workspaceInvitations')
            .withIndex('by_workspace_email_status', (q) =>
                q
                    .eq('workspaceId', workspaceId)
                    .eq('email', normalizedEmail)
                    .eq('status', 'pending'),
            )
            .collect();
        const now = Date.now();
        if (pendingRows.some((r) => r.expiresAt >= now)) {
            throw new Error('CONFLICT: pending invitation exists');
        }
        // Expired-but-still-'pending' rows must not block a re-invite — flip
        // them to 'expired' here (the only write path that can persist the
        // lazy expiry, since inviteAccept's throw rolls back any patch) and
        // proceed with the fresh invitation.
        for (const r of pendingRows) {
            await ctx.db.patch(r._id, { status: 'expired' });
        }

        const token = randomToken();
        const id = await ctx.db.insert('workspaceInvitations', {
            workspaceId,
            email: normalizedEmail,
            role,
            token,
            status: 'pending',
            invitedByUserId: user._id,
            expiresAt: Date.now() + INVITE_EXPIRY_MS,
        });
        await audit(ctx, {
            event: 'workspace_member.invited',
            workspaceId,
            actorUserId: user._id,
            payload: { email: normalizedEmail, role },
        });
        return (await ctx.db.get(id))!;
    },
});

export const inviteList = query({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        await requireCap(ctx, 'workspace.invite', { workspaceId });
        const rows = await ctx.db
            .query('workspaceInvitations')
            .withIndex('by_workspace_email_status', (q) => q.eq('workspaceId', workspaceId))
            .collect();
        // Lazy expiry on read: a row that's still 'pending' but past its
        // expiresAt is reported with a virtual 'expired' status (mirrors
        // projectInvitations.list). The stored row is flipped for real the
        // next time inviteCreate re-invites the same email.
        const now = Date.now();
        return rows.map((r) => ({
            ...r,
            status: r.status === 'pending' && r.expiresAt < now ? ('expired' as const) : r.status,
        }));
    },
});

export const inviteGetByToken = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const row = await ctx.db
            .query('workspaceInvitations')
            .withIndex('by_token', (q) => q.eq('token', token))
            .unique();
        if (!row) return null;
        const ws = await ctx.db.get(row.workspaceId);
        const inviter = await ctx.db.get(row.invitedByUserId);
        return {
            ...row,
            workspace: ws
                ? { id: ws._id, name: ws.name, slug: ws.slug, avatarUrl: ws.avatarUrl }
                : null,
            invitedBy: inviter
                ? { id: inviter._id, displayName: inviter.displayName ?? inviter.email }
                : null,
        };
    },
});

export const inviteRevoke = mutation({
    args: { invitationId: v.id('workspaceInvitations') },
    handler: async (ctx, { invitationId }) => {
        const row = await ctx.db.get(invitationId);
        if (!row) throw new Error('NOT_FOUND: invitation');
        const { user } = await requireCap(ctx, 'workspace.invite', {
            workspaceId: row.workspaceId,
        });
        if (row.status !== 'pending') throw new Error('BAD_REQUEST: not pending');
        await ctx.db.patch(invitationId, {
            status: 'revoked',
            revokedAt: Date.now(),
        });
        await audit(ctx, {
            event: 'workspace_invite.revoked',
            workspaceId: row.workspaceId,
            actorUserId: user._id,
            payload: { email: row.email, role: row.role },
        });
        return { ok: true } as const;
    },
});

export const inviteAccept = mutation({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const user = await requireUser(ctx);
        const row = await ctx.db
            .query('workspaceInvitations')
            .withIndex('by_token', (q) => q.eq('token', token))
            .unique();
        if (!row) throw new Error('NOT_FOUND: invitation');
        if (row.status !== 'pending') throw new Error('BAD_REQUEST: invitation not pending');
        if (row.expiresAt < Date.now()) {
            // No status patch here: Convex rolls back all writes when a
            // mutation throws, so a patch-then-throw never persists. Lazy
            // expiry is handled on read (inviteList) and on re-invite
            // (inviteCreate).
            throw new Error('BAD_REQUEST: invitation expired');
        }
        // Resolve the caller's email: prefer the Drizzle-stored `users.email`
        // (which the bridge keeps in sync with Clerk's primary email), then
        // fall back to the Clerk identity claim. Without a fallback,
        // freshly-created users whose Drizzle row hasn't synced yet would
        // get FORBIDDEN even though they own the matching email.
        let userEmail = user.email?.toLowerCase();
        if (!userEmail) {
            const identity = await ctx.auth.getUserIdentity();
            userEmail = identity?.email?.toLowerCase();
        }
        if (!userEmail || userEmail !== row.email.toLowerCase()) {
            throw new Error('FORBIDDEN: invitation email does not match');
        }
        const existing = await getMembership(ctx, row.workspaceId, user._id);
        if (existing) {
            await ctx.db.patch(row._id, {
                status: 'accepted',
                acceptedAt: Date.now(),
            });
            return existing;
        }
        const memberId = await ctx.db.insert('workspaceMembers', {
            workspaceId: row.workspaceId,
            userId: user._id,
            role: row.role,
            updatedAt: Date.now(),
        });
        await ctx.db.patch(row._id, { status: 'accepted', acceptedAt: Date.now() });
        await audit(ctx, {
            event: 'workspace_invite.accepted',
            workspaceId: row.workspaceId,
            actorUserId: user._id,
            payload: { role: row.role },
        });
        return (await ctx.db.get(memberId))!;
    },
});
