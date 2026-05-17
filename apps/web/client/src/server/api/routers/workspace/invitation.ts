import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { addDays, isAfter } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { checkAcceptable, isEmailMatch } from '@weblab/auth';
import { fromDbUser, users, workspaceInvitations, workspaceMembers, workspaces } from '@weblab/db';
import {
    constructWorkspaceInvitationLink,
    getResendClient,
    sendWorkspaceInvitationEmail,
} from '@weblab/email';
import { AuditEventKind, InvitationStatus, WorkspaceRole } from '@weblab/models';

import { env } from '@/env';
import { audit } from '../../permissions/audit';
import { requireCap } from '../../permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const workspaceRoleEnum = z.nativeEnum(WorkspaceRole);

/**
 * Hierarchical guard: caller cannot grant a role greater than or equal to
 * their own. Owners can grant any non-owner role; admins can grant member or
 * viewer.
 */
const ROLE_RANK: Record<WorkspaceRole, number> = {
    [WorkspaceRole.OWNER]: 3,
    [WorkspaceRole.ADMIN]: 2,
    [WorkspaceRole.MEMBER]: 1,
    [WorkspaceRole.VIEWER]: 0,
};

const assertCanGrant = (callerRole: WorkspaceRole | null, requestedRole: WorkspaceRole) => {
    if (!callerRole) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a workspace member' });
    }
    // Owners can grant any role except OWNER (owners are promoted only by
    // explicit transfer flow — out of scope MVP).
    if (requestedRole === WorkspaceRole.OWNER) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Use ownership transfer to grant owner role',
        });
    }
    if (ROLE_RANK[requestedRole] >= ROLE_RANK[callerRole]) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot grant a role at or above your own',
        });
    }
};

const generateToken = () => crypto.randomBytes(32).toString('base64url');

const isUniqueViolation = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const err = error as { code?: unknown; message?: unknown };
    if (err.code === '23505') return true;
    return typeof err.message === 'string' && err.message.includes('duplicate key');
};

export const workspaceInvitationRouter = createTRPCRouter({
    /**
     * Lookup by id. Returns the raw token only to the intended invitee.
     */
    get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.workspaceInvitations.findFirst({
                where: eq(workspaceInvitations.id, input.id),
                with: { invitedBy: true, workspace: true },
            });
            if (!invitation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
            }

            const isInvitee = isEmailMatch(invitation.email, ctx.user.email ?? null);

            return {
                ...invitation,
                token: isInvitee ? invitation.token : null,
                // @ts-expect-error - Drizzle relation pulls the full users row but
                // narrows the inferred type via Supabase auth.users overlap.
                inviter: invitation.invitedBy ? fromDbUser(invitation.invitedBy) : null,
            };
        }),

    /**
     * Token-stripped lookup for the recipient page (which separately reads
     * the token from the URL).
     */
    getWithoutToken: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.workspaceInvitations.findFirst({
                where: eq(workspaceInvitations.id, input.id),
                with: { invitedBy: true, workspace: true },
            });
            if (!invitation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
            }
            return {
                ...invitation,
                token: null,
                // @ts-expect-error - Drizzle relation pulls the full users row but
                // narrows the inferred type via Supabase auth.users overlap.
                inviter: invitation.invitedBy ? fromDbUser(invitation.invitedBy) : null,
            };
        }),

    /**
     * List invitations for a workspace. Requires `workspace.invite`.
     * Lazily flips expired pending rows to `expired` state.
     */
    list: protectedProcedure
        .input(z.object({ workspaceId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'workspace.invite', {
                workspaceId: input.workspaceId,
            });
            const rows = await ctx.db.query.workspaceInvitations.findMany({
                where: eq(workspaceInvitations.workspaceId, input.workspaceId),
                limit: 200,
                with: { invitedBy: true },
            });
            const now = new Date();
            const stale = rows.filter(
                (r) => r.status === InvitationStatus.PENDING && isAfter(now, r.expiresAt),
            );
            if (stale.length > 0) {
                await Promise.all(
                    stale.map((r) =>
                        ctx.db
                            .update(workspaceInvitations)
                            .set({ status: InvitationStatus.EXPIRED, updatedAt: now })
                            .where(eq(workspaceInvitations.id, r.id)),
                    ),
                );
                stale.forEach((r) => (r.status = InvitationStatus.EXPIRED));
            }
            return rows.map((r) => ({
                ...r,
                // @ts-expect-error - see note above on fromDbUser typing
                inviter: r.invitedBy ? fromDbUser(r.invitedBy) : null,
            }));
        }),

    /**
     * Create an invitation. Requires `workspace.invite`. Sends an email; rolls
     * back the row if the email cannot be sent (matches project invite behavior).
     */
    create: protectedProcedure
        .input(
            z.object({
                workspaceId: z.string().uuid(),
                email: z.string().email().trim().toLowerCase(),
                role: workspaceRoleEnum,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const resource = await requireCap(ctx.db, ctx.user.id, 'workspace.invite', {
                workspaceId: input.workspaceId,
            });
            assertCanGrant(resource.workspaceRole, input.role);

            const workspace = await ctx.db.query.workspaces.findFirst({
                where: eq(workspaces.id, input.workspaceId),
            });
            if (!workspace) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
            }

            const inviter = await ctx.db.query.users.findFirst({
                where: eq(users.id, ctx.user.id),
            });
            if (!inviter) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Inviter not found' });
            }

            // Pre-check: existing workspace member with this email.
            const existingMember = await ctx.db
                .select({ id: workspaceMembers.id })
                .from(workspaceMembers)
                .innerJoin(users, eq(users.id, workspaceMembers.userId))
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, input.workspaceId),
                        eq(users.email, input.email),
                    ),
                )
                .limit(1);
            if (existingMember.length > 0) {
                // Generic message — distinct copy here vs the unique-pending
                // 23505 branch above would leak account-existence + membership
                // state to anyone with workspace.invite cap.
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: 'Invitation cannot be sent to this email.',
                });
            }

            let invitation: typeof workspaceInvitations.$inferSelect | undefined;
            try {
                const inserted = await ctx.db
                    .insert(workspaceInvitations)
                    .values({
                        workspaceId: input.workspaceId,
                        email: input.email,
                        role: input.role,
                        token: generateToken(),
                        status: InvitationStatus.PENDING,
                        invitedByUserId: ctx.user.id,
                        expiresAt: addDays(new Date(), 7),
                    })
                    .returning();
                invitation = inserted[0];
            } catch (error) {
                // The partial unique index workspace_invitations_pending_unique
                // surfaces concurrent duplicate-create races as Postgres 23505.
                // Map to a friendly CONFLICT so the second user gets a useful
                // toast instead of a 500.
                if (isUniqueViolation(error)) {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        // Same generic message as the existing-member branch
                        // above; the inviter knows the address was rejected
                        // but not WHY (member vs pending-invite vs new).
                        message: 'Invitation cannot be sent to this email.',
                    });
                }
                throw error;
            }
            if (!invitation) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create invitation',
                });
            }

            if (!env.RESEND_API_KEY) {
                await ctx.db
                    .delete(workspaceInvitations)
                    .where(eq(workspaceInvitations.id, invitation.id));
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'RESEND_API_KEY is not set, cannot send email',
                });
            }

            const inviteLink = constructWorkspaceInvitationLink(
                env.NEXT_PUBLIC_SITE_URL,
                invitation.id,
                invitation.token,
            );

            let sendException: unknown;
            let sendResult: Awaited<ReturnType<typeof sendWorkspaceInvitationEmail>> | undefined;
            try {
                sendResult = await sendWorkspaceInvitationEmail(
                    getResendClient({ apiKey: env.RESEND_API_KEY }),
                    {
                        inviteeEmail: input.email,
                        invitedByName: inviter.firstName ?? inviter.displayName ?? undefined,
                        invitedByEmail: ctx.user.email,
                        workspaceName: workspace.name,
                        inviteLink,
                    },
                    { dryRun: env.EMAIL_DRY_RUN === 'true' },
                );
            } catch (error) {
                sendException = error;
            }

            const sendFailed =
                !!sendException ||
                (sendResult &&
                    typeof sendResult === 'object' &&
                    'error' in sendResult &&
                    sendResult.error);

            if (sendFailed) {
                await ctx.db
                    .delete(workspaceInvitations)
                    .where(eq(workspaceInvitations.id, invitation.id));
                console.error('[workspaceInvitation.create] send failed', {
                    invitationId: invitation.id,
                    error:
                        sendException ??
                        (sendResult && typeof sendResult === 'object' && 'error' in sendResult
                            ? sendResult.error
                            : null),
                });
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to send invitation email. Please try again.',
                });
            }

            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_MEMBER_INVITED,
                workspaceId: input.workspaceId,
                actorUserId: ctx.user.id,
                payload: { email: input.email, role: input.role },
            });

            return { ...invitation, inviteLink };
        }),

    /**
     * Revoke an invitation. Sets status='revoked' (does not delete) so the
     * audit history is preserved.
     */
    revoke: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.workspaceInvitations.findFirst({
                where: eq(workspaceInvitations.id, input.id),
            });
            if (!invitation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
            }
            await requireCap(ctx.db, ctx.user.id, 'workspace.invite', {
                workspaceId: invitation.workspaceId,
            });
            if (invitation.status !== InvitationStatus.PENDING) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Cannot revoke an invitation in state '${invitation.status}'`,
                });
            }
            await ctx.db
                .update(workspaceInvitations)
                .set({
                    status: InvitationStatus.REVOKED,
                    revokedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(workspaceInvitations.id, input.id));
            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_INVITE_REVOKED,
                workspaceId: invitation.workspaceId,
                actorUserId: ctx.user.id,
                payload: { email: invitation.email },
            });
            return { ok: true };
        }),

    /**
     * Accept an invitation. Caller must be authenticated and the email
     * must match.
     */
    accept: protectedProcedure
        .input(z.object({ id: z.string().uuid(), token: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.workspaceInvitations.findFirst({
                where: and(
                    eq(workspaceInvitations.id, input.id),
                    eq(workspaceInvitations.token, input.token),
                ),
            });
            if (!invitation) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invitation does not exist',
                });
            }
            const acceptError = checkAcceptable(invitation, new Date());
            if (acceptError === 'already_accepted') {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invitation has already been accepted',
                });
            }
            if (acceptError === 'revoked') {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invitation has been revoked',
                });
            }
            if (acceptError === 'expired') {
                if (invitation.status === InvitationStatus.PENDING) {
                    await ctx.db
                        .update(workspaceInvitations)
                        .set({ status: InvitationStatus.EXPIRED, updatedAt: new Date() })
                        .where(eq(workspaceInvitations.id, invitation.id));
                }
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invitation has expired',
                });
            }
            if (!isEmailMatch(invitation.email, ctx.user.email ?? null)) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `This invitation was sent to ${invitation.email}. Please sign in with that email.`,
                });
            }

            await ctx.db.transaction(async (tx) => {
                await tx
                    .insert(workspaceMembers)
                    .values({
                        workspaceId: invitation.workspaceId,
                        userId: ctx.user.id,
                        role: invitation.role,
                    })
                    .onConflictDoNothing();
                await tx
                    .update(workspaceInvitations)
                    .set({
                        status: InvitationStatus.ACCEPTED,
                        acceptedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(workspaceInvitations.id, invitation.id));
            });

            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_INVITE_ACCEPTED,
                workspaceId: invitation.workspaceId,
                actorUserId: ctx.user.id,
                payload: { email: invitation.email, role: invitation.role },
            });

            return { workspaceId: invitation.workspaceId };
        }),
});
