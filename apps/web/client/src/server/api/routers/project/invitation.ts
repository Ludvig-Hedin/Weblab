import { TRPCError } from '@trpc/server';
import { addDays } from 'date-fns';
import { and, eq, ilike, isNull, lt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { checkAcceptable, checkRevocable, isEmailMatch } from '@weblab/auth';
import {
    authUsers,
    createDefaultUserCanvas,
    fromDbUser,
    projectInvitations,
    userCanvases,
    userProjects,
    users,
} from '@weblab/db';
import { constructInvitationLink, getResendClient, sendInvitationEmail } from '@weblab/email';
import { AuditEventKind, InvitationStatus, ProjectMemberRole, ProjectRole } from '@weblab/models';
import { isFreeEmail } from '@weblab/utility';

import { env } from '@/env';
import { audit } from '../../permissions/audit';
import { requireCap } from '../../permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const PROJECT_ROLE_TO_MEMBER_ROLE: Record<ProjectRole, ProjectMemberRole> = {
    [ProjectRole.OWNER]: ProjectMemberRole.MANAGER,
    [ProjectRole.ADMIN]: ProjectMemberRole.MANAGER,
    [ProjectRole.EDITOR]: ProjectMemberRole.EDITOR,
    [ProjectRole.VIEWER]: ProjectMemberRole.VIEWER,
};

const MEMBER_ROLE_TO_PROJECT_ROLE: Record<ProjectMemberRole, ProjectRole> = {
    [ProjectMemberRole.MANAGER]: ProjectRole.ADMIN,
    [ProjectMemberRole.EDITOR]: ProjectRole.EDITOR,
    [ProjectMemberRole.REVIEWER]: ProjectRole.VIEWER,
    [ProjectMemberRole.VIEWER]: ProjectRole.VIEWER,
};

const isUniqueViolation = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const err = error as { code?: unknown; message?: unknown };
    if (err.code === '23505') return true;
    return typeof err.message === 'string' && err.message.includes('duplicate key');
};

/**
 * Internal revoke helper shared by both the new `revoke` mutation and the
 * deprecated `delete` alias. Cap-gated, state-machine guarded.
 */
async function revokeInvitation(
    ctx: { db: Parameters<typeof requireCap>[0]; user: { id: string } },
    id: string,
): Promise<{ ok: true }> {
    const invitation = await ctx.db.query.projectInvitations.findFirst({
        where: eq(projectInvitations.id, id),
    });
    if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
    }
    await requireCap(ctx.db, ctx.user.id, 'project.invite', {
        projectId: invitation.projectId,
    });
    const revokeError = checkRevocable(invitation);
    if (revokeError) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot revoke an invitation in state '${invitation.status}'`,
        });
    }
    const now = new Date();
    // ctx.db at runtime is the full DrizzleDb. The narrow type on the helper
    // only ensures requireCap can be invoked — widen here for the update call.
    const fullDb = ctx.db as unknown as import('@weblab/db').DrizzleDb;
    await fullDb
        .update(projectInvitations)
        .set({
            status: InvitationStatus.REVOKED,
            revokedAt: now,
            updatedAt: now,
        })
        .where(eq(projectInvitations.id, id));
    await audit(fullDb, {
        event: AuditEventKind.PROJECT_INVITE_REVOKED,
        projectId: invitation.projectId,
        actorUserId: ctx.user.id,
        payload: { email: invitation.inviteeEmail },
    });
    return { ok: true };
}

export const invitationRouter = createTRPCRouter({
    get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.projectInvitations.findFirst({
                where: eq(projectInvitations.id, input.id),
                with: {
                    inviter: true,
                },
            });

            if (!invitation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
            }
            if (!invitation.inviter) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Inviter not found' });
            }

            const isInvitee = isEmailMatch(invitation.inviteeEmail, ctx.user.email ?? null);

            return {
                ...invitation,
                token: isInvitee ? invitation.token : null,
                // @ts-expect-error - Drizzle is not typed correctly
                inviter: fromDbUser(invitation.inviter),
            };
        }),
    getWithoutToken: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.projectInvitations.findFirst({
                where: eq(projectInvitations.id, input.id),
                with: { inviter: true },
            });
            if (!invitation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
            }
            if (!invitation.inviter) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Inviter not found' });
            }
            return {
                ...invitation,
                token: null,
                // @ts-expect-error - Drizzle is not typed correctly
                inviter: fromDbUser(invitation.inviter),
            };
        }),
    list: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', {
                projectId: input.projectId,
            });
            // Lazy-expire any pending row whose expires_at has passed.
            await ctx.db
                .update(projectInvitations)
                .set({ status: InvitationStatus.EXPIRED, updatedAt: new Date() })
                .where(
                    and(
                        eq(projectInvitations.projectId, input.projectId),
                        eq(projectInvitations.status, InvitationStatus.PENDING),
                        lt(projectInvitations.expiresAt, new Date()),
                    ),
                );
            const invitations = await ctx.db.query.projectInvitations.findMany({
                where: eq(projectInvitations.projectId, input.projectId),
                limit: 200,
            });
            return invitations;
        }),
    create: protectedProcedure
        .input(
            z
                .object({
                    projectId: z.string(),
                    inviteeEmail: z.string().email(),
                    memberRole: z.nativeEnum(ProjectMemberRole).optional(),
                    // Legacy field kept for transition — existing UI still sends
                    // `role` as `ProjectRole`. Either field is accepted; if both
                    // are missing the request fails validation.
                    role: z.nativeEnum(ProjectRole).optional(),
                })
                .refine((v) => v.memberRole || v.role, {
                    message: 'memberRole or role required',
                }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.invite', {
                projectId: input.projectId,
            });
            const memberRole: ProjectMemberRole =
                input.memberRole ?? PROJECT_ROLE_TO_MEMBER_ROLE[input.role!];

            const inviter = await ctx.db.query.users.findFirst({
                where: eq(users.id, ctx.user.id),
            });
            if (!inviter) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Inviter not found' });
            }

            // Block existing project membership early with a clear conflict.
            const existingUser = await ctx.db
                .select()
                .from(userProjects)
                .innerJoin(authUsers, eq(authUsers.id, userProjects.userId))
                .where(
                    and(
                        eq(userProjects.projectId, input.projectId),
                        eq(authUsers.email, input.inviteeEmail),
                    ),
                )
                .limit(1);
            if (existingUser.length > 0) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: 'Invitation cannot be sent to this email.',
                });
            }

            const legacyRole = MEMBER_ROLE_TO_PROJECT_ROLE[memberRole];
            let invitation: typeof projectInvitations.$inferSelect | undefined;
            try {
                const inserted = await ctx.db
                    .insert(projectInvitations)
                    .values([
                        {
                            projectId: input.projectId,
                            inviteeEmail: input.inviteeEmail,
                            role: legacyRole,
                            memberRole,
                            token: uuidv4(),
                            inviterId: ctx.user.id,
                            expiresAt: addDays(new Date(), 7),
                        },
                    ])
                    .returning();
                invitation = inserted[0];
            } catch (error) {
                if (isUniqueViolation(error)) {
                    throw new TRPCError({
                        code: 'CONFLICT',
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
                    .delete(projectInvitations)
                    .where(eq(projectInvitations.id, invitation.id));
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'RESEND_API_KEY is not set, cannot send email',
                });
            }

            let sendResult: Awaited<ReturnType<typeof sendInvitationEmail>> | undefined;
            let sendException: unknown;
            try {
                sendResult = await sendInvitationEmail(
                    getResendClient({ apiKey: env.RESEND_API_KEY }),
                    {
                        inviteeEmail: input.inviteeEmail,
                        invitedByName: inviter.firstName ?? inviter.displayName ?? undefined,
                        invitedByEmail: ctx.user.email,
                        inviteLink: constructInvitationLink(
                            env.NEXT_PUBLIC_SITE_URL,
                            invitation.id,
                            invitation.token,
                        ),
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
                    .delete(projectInvitations)
                    .where(eq(projectInvitations.id, invitation.id));
                console.error('[invitation.create] sendInvitationEmail failed', {
                    invitationId: invitation.id,
                    error:
                        sendException ??
                        (sendResult &&
                            typeof sendResult === 'object' &&
                            'error' in sendResult &&
                            sendResult.error),
                });
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to send invitation email. Please try again.',
                });
            }

            await audit(ctx.db, {
                event: AuditEventKind.PROJECT_MEMBER_INVITED,
                projectId: input.projectId,
                actorUserId: ctx.user.id,
                payload: { email: input.inviteeEmail, memberRole },
            });

            return invitation;
        }),
    revoke: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => revokeInvitation(ctx, input.id)),
    /** @deprecated Use `revoke` instead. */
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => revokeInvitation(ctx, input.id)),
    accept: protectedProcedure
        .input(z.object({ token: z.string().min(1), id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.projectInvitations.findFirst({
                where: and(
                    eq(projectInvitations.id, input.id),
                    eq(projectInvitations.token, input.token),
                ),
                with: {
                    project: { with: { canvas: true } },
                },
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
                // Lazy-flip a pending row that ran past expiry.
                if (invitation.status === InvitationStatus.PENDING) {
                    await ctx.db
                        .update(projectInvitations)
                        .set({ status: InvitationStatus.EXPIRED, updatedAt: new Date() })
                        .where(eq(projectInvitations.id, invitation.id));
                }
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invitation has expired',
                });
            }
            if (!isEmailMatch(invitation.inviteeEmail, ctx.user.email ?? null)) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `This invitation was sent to ${invitation.inviteeEmail}. Please sign in with that email address.`,
                });
            }

            const memberRole =
                invitation.memberRole ??
                PROJECT_ROLE_TO_MEMBER_ROLE[invitation.role as ProjectRole];

            await ctx.db.transaction(async (tx) => {
                await tx
                    .insert(userProjects)
                    .values({
                        projectId: invitation.projectId,
                        userId: ctx.user.id,
                        role: invitation.role,
                        memberRole,
                    })
                    .onConflictDoNothing();

                await tx
                    .insert(userCanvases)
                    .values(createDefaultUserCanvas(ctx.user.id, invitation.project.canvas.id))
                    .onConflictDoNothing();

                await tx
                    .update(projectInvitations)
                    .set({
                        status: InvitationStatus.ACCEPTED,
                        acceptedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(projectInvitations.id, invitation.id));
            });

            await audit(ctx.db, {
                event: AuditEventKind.PROJECT_INVITE_ACCEPTED,
                projectId: invitation.projectId,
                actorUserId: ctx.user.id,
                payload: { email: invitation.inviteeEmail, memberRole },
            });

            return { projectId: invitation.projectId };
        }),
    suggested: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (isFreeEmail(ctx.user.email)) {
                return [];
            }
            try {
                await requireCap(ctx.db, ctx.user.id, 'project.invite', {
                    projectId: input.projectId,
                });
            } catch {
                return [];
            }

            const domain = ctx.user.email.split('@').at(-1);

            const suggestedUsers = await ctx.db
                .select()
                .from(authUsers)
                .leftJoin(
                    userProjects,
                    and(
                        eq(userProjects.userId, authUsers.id),
                        eq(userProjects.projectId, input.projectId),
                    ),
                )
                .leftJoin(
                    projectInvitations,
                    and(
                        eq(projectInvitations.inviteeEmail, authUsers.email),
                        eq(projectInvitations.projectId, input.projectId),
                    ),
                )
                .where(
                    and(
                        ilike(authUsers.email, `%@${domain}`),
                        isNull(userProjects.userId),
                        isNull(projectInvitations.id),
                    ),
                )
                .limit(5);

            return suggestedUsers.map((user) => user.users.email);
        }),
});
