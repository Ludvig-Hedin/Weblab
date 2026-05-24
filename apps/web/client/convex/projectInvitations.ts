import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { internalMutation, mutation, query } from './_generated/server';
import { audit } from './lib/audit';
import { requireCap, requireUser } from './lib/permissions';

const PENDING = 'pending' as const;
const ACCEPTED = 'accepted' as const;
const REVOKED = 'revoked' as const;
const EXPIRED = 'expired' as const;

const isEmailMatch = (a: string | undefined, b: string | undefined | null): boolean =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase();

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Resolve the caller's email + Convex user record. Returns `{}` if the caller
 * is unauthenticated.
 */
async function resolveCaller(
    ctx: QueryCtx,
): Promise<{ email?: string; userId?: Doc<'users'>['_id'] }> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return {};
    const me = await ctx.db
        .query('users')
        .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
        .unique();
    return {
        email: me?.email ?? identity.email ?? undefined,
        userId: me?._id,
    };
}

/**
 * Returns true when the caller has any `projectMembers` row on the project,
 * any `workspaceMembers` row on the project's workspace, or is the inviter.
 * Used to scope invitation visibility to people with a legitimate reason to
 * see the row.
 */
async function callerCanSeeInvitation(
    ctx: QueryCtx,
    invitation: Doc<'projectInvitations'>,
    callerUserId: Doc<'users'>['_id'] | undefined,
): Promise<boolean> {
    if (!callerUserId) return false;
    if (invitation.inviterId === callerUserId) return true;
    const pm = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) =>
            q.eq('projectId', invitation.projectId).eq('userId', callerUserId),
        )
        .unique();
    if (pm) return true;
    const project = await ctx.db.get(invitation.projectId);
    if (!project) return false;
    const wm = await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace_user', (q) =>
            q.eq('workspaceId', project.workspaceId).eq('userId', callerUserId),
        )
        .unique();
    return !!wm;
}

/**
 * Get an invitation by id. The token is only returned to the invitee (email
 * match) — viewers with project access see token=null. Strangers get
 * NOT_FOUND so an attacker can't probe whether an invitation _id exists.
 */
export const get = query({
    args: { id: v.id('projectInvitations') },
    handler: async (ctx, { id }) => {
        const invitation = await ctx.db.get(id);
        if (!invitation) throw new Error('NOT_FOUND: Invitation not found');

        const { email: viewerEmail, userId: viewerUserId } = await resolveCaller(ctx);
        const isInvitee = isEmailMatch(invitation.inviteeEmail, viewerEmail);
        const isProjectViewer = await callerCanSeeInvitation(ctx, invitation, viewerUserId);
        if (!isInvitee && !isProjectViewer) {
            // Indistinguishable from a missing row so attackers can't probe.
            throw new Error('NOT_FOUND: Invitation not found');
        }

        const inviter = await ctx.db.get(invitation.inviterId);
        if (!inviter) throw new Error('NOT_FOUND: Inviter not found');

        return {
            ...invitation,
            token: isInvitee ? invitation.token : null,
            inviter: {
                id: inviter._id,
                email: inviter.email ?? null,
                firstName: inviter.firstName ?? null,
                lastName: inviter.lastName ?? null,
                displayName: inviter.displayName ?? inviter.firstName ?? inviter.email ?? null,
                avatarUrl: inviter.avatarUrl ?? null,
            },
        };
    },
});

/**
 * Same as get() but never returns the token. Used by the listing UI that
 * never needs to render the link. Same visibility rules as get().
 */
export const getWithoutToken = query({
    args: { id: v.id('projectInvitations') },
    handler: async (ctx, { id }) => {
        const invitation = await ctx.db.get(id);
        if (!invitation) throw new Error('NOT_FOUND: Invitation not found');

        const { email: viewerEmail, userId: viewerUserId } = await resolveCaller(ctx);
        const isInvitee = isEmailMatch(invitation.inviteeEmail, viewerEmail);
        const isProjectViewer = await callerCanSeeInvitation(ctx, invitation, viewerUserId);
        if (!isInvitee && !isProjectViewer) {
            throw new Error('NOT_FOUND: Invitation not found');
        }

        const inviter = await ctx.db.get(invitation.inviterId);
        if (!inviter) throw new Error('NOT_FOUND: Inviter not found');

        return {
            ...invitation,
            token: null,
            inviter: {
                id: inviter._id,
                email: inviter.email ?? null,
                firstName: inviter.firstName ?? null,
                lastName: inviter.lastName ?? null,
                displayName: inviter.displayName ?? inviter.firstName ?? inviter.email ?? null,
                avatarUrl: inviter.avatarUrl ?? null,
            },
        };
    },
});

/**
 * List invitations on a project. Lazy-expire is handled by the read path
 * itself (a row that's `pending` but past expiresAt is reported as expired
 * via a virtual status).
 */
export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('projectInvitations')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .take(200);
        const now = Date.now();
        return rows.map((r) => ({
            ...r,
            status: r.status === PENDING && r.expiresAt < now ? EXPIRED : r.status,
        }));
    },
});

/**
 * Suggest other users in the same email domain who aren't yet members and
 * have no pending invite. Always returns [] for free-email accounts.
 */
const FREE_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'icloud.com',
    'aol.com',
    'protonmail.com',
    'mail.com',
    'live.com',
    'msn.com',
]);

const isFreeEmail = (email: string | undefined): boolean => {
    if (!email) return true;
    const domain = email.split('@').at(-1)?.toLowerCase();
    return !domain || FREE_EMAIL_DOMAINS.has(domain);
};

export const suggested = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const user = await requireUser(ctx);
        if (isFreeEmail(user.email)) return [];
        try {
            await requireCap(ctx, 'project.invite', { projectId });
        } catch {
            return [];
        }
        const domain = user.email!.split('@').at(-1)!.toLowerCase();

        // Convex has no LIKE — enumerate users + filter. Bounded by user
        // count; this dashboard rarely sees more than a few hundred users.
        const allUsers = await ctx.db.query('users').collect();
        const candidates = allUsers.filter(
            (u) => u.email && u.email.toLowerCase().endsWith(`@${domain}`),
        );
        if (candidates.length === 0) return [];

        const existingMembers = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) => q.eq('projectId', projectId))
            .collect();
        const memberIds = new Set(existingMembers.map((m) => m.userId));

        const existingInvites = await ctx.db
            .query('projectInvitations')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        const invitedEmails = new Set(existingInvites.map((i) => i.inviteeEmail.toLowerCase()));

        return candidates
            .filter(
                (u) =>
                    !memberIds.has(u._id) && u.email && !invitedEmails.has(u.email.toLowerCase()),
            )
            .slice(0, 5)
            .map((u) => u.email);
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Revoke an invitation (state-machine check: only pending → revoked).
 */
export const revoke = mutation({
    args: { id: v.id('projectInvitations') },
    handler: async (ctx, { id }) => {
        const invitation = await ctx.db.get(id);
        if (!invitation) throw new Error('NOT_FOUND: Invitation not found');
        const { user } = await requireCap(ctx, 'project.invite', {
            projectId: invitation.projectId,
        });
        if (invitation.status !== PENDING) {
            throw new Error(
                `BAD_REQUEST: Cannot revoke an invitation in state '${invitation.status}'`,
            );
        }
        const now = Date.now();
        await ctx.db.patch(id, { status: REVOKED, revokedAt: now, updatedAt: now });
        await audit(ctx, {
            event: 'project_invite.revoked',
            projectId: invitation.projectId,
            actorUserId: user._id,
            payload: { email: invitation.inviteeEmail },
        });
        return { ok: true } as const;
    },
});

/** @deprecated alias of revoke. */
export const remove = mutation({
    args: { id: v.id('projectInvitations') },
    handler: async (ctx, { id }) => {
        // Inline so we don't depend on api self-reference.
        const invitation = await ctx.db.get(id);
        if (!invitation) throw new Error('NOT_FOUND: Invitation not found');
        const { user } = await requireCap(ctx, 'project.invite', {
            projectId: invitation.projectId,
        });
        if (invitation.status !== PENDING) {
            throw new Error(
                `BAD_REQUEST: Cannot revoke an invitation in state '${invitation.status}'`,
            );
        }
        const now = Date.now();
        await ctx.db.patch(id, { status: REVOKED, revokedAt: now, updatedAt: now });
        await audit(ctx, {
            event: 'project_invite.revoked',
            projectId: invitation.projectId,
            actorUserId: user._id,
            payload: { email: invitation.inviteeEmail },
        });
        return { ok: true } as const;
    },
});

/**
 * Accept an invitation: insert projectMember + userCanvas, mark invitation
 * accepted. Validates state + email + expiry.
 */
export const accept = mutation({
    args: { token: v.string(), id: v.id('projectInvitations') },
    handler: async (ctx, { token, id }) => {
        const user = await requireUser(ctx);
        const invitation = await ctx.db.get(id);
        if (!invitation) throw new Error('BAD_REQUEST: Invitation does not exist');
        if (invitation.token !== token) {
            throw new Error('BAD_REQUEST: Invitation does not exist');
        }

        if (invitation.status === ACCEPTED) {
            throw new Error('BAD_REQUEST: Invitation has already been accepted');
        }
        if (invitation.status === REVOKED) {
            throw new Error('BAD_REQUEST: Invitation has been revoked');
        }
        const now = Date.now();
        if (invitation.status === EXPIRED || invitation.expiresAt < now) {
            if (invitation.status === PENDING) {
                await ctx.db.patch(invitation._id, { status: EXPIRED, updatedAt: now });
            }
            throw new Error('BAD_REQUEST: Invitation has expired');
        }
        if (!isEmailMatch(invitation.inviteeEmail, user.email ?? undefined)) {
            throw new Error(
                `BAD_REQUEST: This invitation was sent to ${invitation.inviteeEmail}. Please sign in with that email address.`,
            );
        }

        const memberRole = invitation.memberRole ?? 'viewer';

        // Insert projectMember (skip if already exists — idempotent accept).
        const existingMember = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) =>
                q.eq('projectId', invitation.projectId).eq('userId', user._id),
            )
            .unique();
        if (!existingMember) {
            await ctx.db.insert('projectMembers', {
                projectId: invitation.projectId,
                userId: user._id,
                role: memberRole,
                updatedAt: now,
            });
        }

        // Insert userCanvas for project's canvas (if there is one).
        const canvas = await ctx.db
            .query('canvases')
            .withIndex('by_project', (q) => q.eq('projectId', invitation.projectId))
            .first();
        if (canvas) {
            const existingUC = await ctx.db
                .query('userCanvases')
                .withIndex('by_user_canvas', (q) =>
                    q.eq('userId', user._id).eq('canvasId', canvas._id),
                )
                .unique();
            if (!existingUC) {
                await ctx.db.insert('userCanvases', {
                    userId: user._id,
                    canvasId: canvas._id,
                    scale: 0.56,
                    x: 120,
                    y: 120,
                });
            }
        }

        await ctx.db.patch(invitation._id, {
            status: ACCEPTED,
            acceptedAt: now,
            updatedAt: now,
        });

        await audit(ctx, {
            event: 'project_invite.accepted',
            projectId: invitation.projectId,
            actorUserId: user._id,
            payload: { email: invitation.inviteeEmail, memberRole },
        });

        return { projectId: invitation.projectId };
    },
});

// ─── Internal helpers for action layer ────────────────────────────────────────

/**
 * Internal mutation invoked by projectInvitationActions.create after email
 * send succeeds. Splits the insert away from the action so the action stays
 * pure-side-effect and the row is only written once email succeeds.
 *
 * Also performs the up-front validation (membership conflict, cap check)
 * so the action can early-reject without a sandbox call.
 */
export const _validateAndInsert = internalMutation({
    args: {
        actorUserId: v.id('users'),
        projectId: v.id('projects'),
        inviteeEmail: v.string(),
        memberRole: v.union(
            v.literal('manager'),
            v.literal('editor'),
            v.literal('reviewer'),
            v.literal('viewer'),
        ),
        token: v.string(),
        expiresAt: v.number(),
    },
    handler: async (ctx, args) => {
        // SECURITY: enforce that the authenticated caller actually has
        // `project.invite` on the target project. Without this check any
        // logged-in user could call `projectInvitationActions.create` with an
        // arbitrary projectId and `memberRole: 'manager'`, then accept the
        // self-issued invitation via `accept` (email matches their own
        // verified email), gaining full management rights on the project.
        const { user: actor } = await requireCap(ctx, 'project.invite', {
            projectId: args.projectId,
        });
        if (actor._id !== args.actorUserId) {
            throw new Error('FORBIDDEN: actorUserId mismatch');
        }

        // Conflict guard: already a member.
        const existingByEmail = await ctx.db.query('users').collect();
        const existingUser = existingByEmail.find(
            (u) => u.email && u.email.toLowerCase() === args.inviteeEmail.toLowerCase(),
        );
        if (existingUser) {
            const existingMember = await ctx.db
                .query('projectMembers')
                .withIndex('by_project_user', (q) =>
                    q.eq('projectId', args.projectId).eq('userId', existingUser._id),
                )
                .unique();
            if (existingMember) {
                throw new Error('CONFLICT: Invitation cannot be sent to this email.');
            }
        }

        // Conflict guard: another pending invitation already exists.
        const existingInvite = await ctx.db
            .query('projectInvitations')
            .withIndex('by_invitee_email_project', (q) =>
                q.eq('inviteeEmail', args.inviteeEmail).eq('projectId', args.projectId),
            )
            .first();
        if (existingInvite && existingInvite.status === PENDING) {
            throw new Error('CONFLICT: Invitation cannot be sent to this email.');
        }

        // Translate memberRole -> legacy role.
        const MEMBER_TO_LEGACY: Record<
            typeof args.memberRole,
            'owner' | 'admin' | 'editor' | 'viewer'
        > = {
            manager: 'admin',
            editor: 'editor',
            reviewer: 'viewer',
            viewer: 'viewer',
        };

        const now = Date.now();
        const invitationId = await ctx.db.insert('projectInvitations', {
            projectId: args.projectId,
            inviterId: args.actorUserId,
            inviteeEmail: args.inviteeEmail,
            token: args.token,
            role: MEMBER_TO_LEGACY[args.memberRole],
            memberRole: args.memberRole,
            status: PENDING,
            expiresAt: args.expiresAt,
            updatedAt: now,
        });

        await audit(ctx, {
            event: 'project_member.invited',
            projectId: args.projectId,
            actorUserId: args.actorUserId,
            payload: { email: args.inviteeEmail, memberRole: args.memberRole },
        });

        return (await ctx.db.get(invitationId))!;
    },
});

/**
 * Internal rollback if email send fails after row insert.
 */
export const _rollbackInvitation = internalMutation({
    args: { invitationId: v.id('projectInvitations') },
    handler: async (ctx, { invitationId }) => {
        const row = await ctx.db.get(invitationId);
        if (row) await ctx.db.delete(invitationId);
        return { ok: true } as const;
    },
});
