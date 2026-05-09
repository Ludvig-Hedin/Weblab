import { TRPCError } from '@trpc/server';
import { addDays, isAfter } from 'date-fns';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import {
    authUsers,
    createDefaultUserCanvas,
    fromDbUser,
    projectInvitationInsertSchema,
    projectInvitations,
    userCanvases,
    userProjects,
    users,
} from '@weblab/db';
import { constructInvitationLink, getResendClient, sendInvitationEmail } from '@weblab/email';
import { ProjectRole } from '@weblab/models';
import { isFreeEmail } from '@weblab/utility';

import { env } from '@/env';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { verifyProjectAccess } from './helper';

async function requireProjectRole(
    db: Pick<DrizzleDb, 'query'>,
    userId: string,
    projectId: string,
    allowed: ProjectRole[],
): Promise<ProjectRole> {
    const membership = await db.query.userProjects.findFirst({
        where: and(eq(userProjects.userId, userId), eq(userProjects.projectId, projectId)),
    });
    const role = membership?.role as ProjectRole | undefined;
    if (!role || !allowed.includes(role)) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Insufficient project role',
        });
    }
    return role;
}

export const invitationRouter = createTRPCRouter({
    get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
        const invitation = await ctx.db.query.projectInvitations.findFirst({
            where: eq(projectInvitations.id, input.id),
            with: {
                inviter: true,
            },
        });

        if (!invitation) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Invitation not found',
            });
        }

        if (!invitation.inviter) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Inviter not found',
            });
        }

        // Only the intended invitee can read the raw token. All other
        // authenticated callers receive a token-stripped view.
        const isInvitee =
            !!ctx.user.email &&
            invitation.inviteeEmail.toLowerCase() === ctx.user.email.toLowerCase();

        return {
            ...invitation,
            token: isInvitee ? invitation.token : null,
            // @ts-expect-error - Drizzle is not typed correctly
            inviter: fromDbUser(invitation.inviter),
        };
    }),
    getWithoutToken: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.projectInvitations.findFirst({
                where: eq(projectInvitations.id, input.id),
                with: {
                    inviter: true,
                },
            });

            if (!invitation) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Invitation not found',
                });
            }

            if (!invitation.inviter) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Inviter not found',
                });
            }

            return {
                ...invitation,
                token: null,
                // @ts-expect-error - Drizzle is not typed correctly
                inviter: fromDbUser(invitation.inviter),
            };
        }),
    list: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const invitations = await ctx.db.query.projectInvitations.findMany({
                where: eq(projectInvitations.projectId, input.projectId),
            });

            return invitations;
        }),
    create: protectedProcedure
        .input(
            projectInvitationInsertSchema.pick({
                projectId: true,
                inviteeEmail: true,
                role: true,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            if (!ctx.user.id) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'You must be logged in to invite a user',
                });
            }
            // Only project admins/owners may invite. Editors and viewers may not.
            const callerRole = await requireProjectRole(ctx.db, ctx.user.id, input.projectId, [
                ProjectRole.OWNER,
                ProjectRole.ADMIN,
            ]);

            // Non-owners may not grant the OWNER role.
            const requestedRole = input.role as ProjectRole;
            if (requestedRole === ProjectRole.OWNER && callerRole !== ProjectRole.OWNER) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Only owners can invite as OWNER',
                });
            }

            const inviter = await ctx.db.query.users.findFirst({
                where: eq(users.id, ctx.user.id),
            });

            if (!inviter) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Inviter not found',
                });
            }

            const [invitation] = await ctx.db.transaction(async (tx) => {
                const existingUser = await tx
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
                        message: 'User is already a member of the project',
                    });
                }

                return await tx
                    .insert(projectInvitations)
                    .values([
                        {
                            ...input,
                            role: input.role as ProjectRole,
                            token: uuidv4(),
                            inviterId: ctx.user.id,
                            expiresAt: addDays(new Date(), 7),
                        },
                    ])
                    .returning();
            });

            if (invitation) {
                if (!env.RESEND_API_KEY) {
                    // CR-063: roll back the row if we can't even attempt the email,
                    // otherwise we leave behind an invitation with no recipient
                    // notification.
                    await ctx.db
                        .delete(projectInvitations)
                        .where(eq(projectInvitations.id, invitation.id));
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'RESEND_API_KEY is not set, cannot send email',
                    });
                }
                const emailClient = getResendClient({
                    apiKey: env.RESEND_API_KEY,
                });

                // Bug fix #8: Default to actually sending emails. Previously this no-op'd
                // outside production, so staging and preview deploys silently dropped invites.
                // Set EMAIL_DRY_RUN=true to opt back into dry-run behavior.
                let sendResult: Awaited<ReturnType<typeof sendInvitationEmail>> | undefined;
                let sendException: unknown;
                try {
                    sendResult = await sendInvitationEmail(
                        emailClient,
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
                        {
                            dryRun: env.EMAIL_DRY_RUN === 'true',
                        },
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
                    // CR-063: roll back the invitation row when the email cannot
                    // be sent so retries don't accumulate orphan invites the
                    // recipient never saw.
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
            }

            return invitation;
        }),
    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const invitation = await ctx.db.query.projectInvitations.findFirst({
                where: eq(projectInvitations.id, input.id),
            });
            if (!invitation) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Invitation not found',
                });
            }
            // Only project admins/owners may rescind invitations.
            await requireProjectRole(ctx.db, ctx.user.id, invitation.projectId, [
                ProjectRole.OWNER,
                ProjectRole.ADMIN,
            ]);
            await ctx.db.delete(projectInvitations).where(eq(projectInvitations.id, input.id));

            return true;
        }),
    accept: protectedProcedure
        .input(z.object({ token: z.string(), id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.user.id) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'You must be logged in to accept an invitation',
                });
            }

            const invitation = await ctx.db.query.projectInvitations.findFirst({
                where: and(
                    eq(projectInvitations.id, input.id),
                    eq(projectInvitations.token, input.token),
                ),
                with: {
                    project: {
                        with: {
                            canvas: true,
                        },
                    },
                },
            });

            if (!invitation) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invitation does not exist',
                });
            }

            if (invitation.inviteeEmail !== ctx.user.email) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `This invitation was sent to ${invitation.inviteeEmail}. Please sign in with that email address.`,
                });
            }

            if (isAfter(new Date(), invitation.expiresAt)) {
                if (invitation) {
                    await ctx.db
                        .delete(projectInvitations)
                        .where(eq(projectInvitations.id, invitation.id));
                }

                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invitation has expired',
                });
            }

            await ctx.db.transaction(async (tx) => {
                await tx.delete(projectInvitations).where(eq(projectInvitations.id, invitation.id));

                await tx
                    .insert(userProjects)
                    .values({
                        projectId: invitation.projectId,
                        userId: ctx.user.id,
                        role: invitation.role,
                    })
                    .onConflictDoNothing();

                await tx
                    .insert(userCanvases)
                    .values(createDefaultUserCanvas(ctx.user.id, invitation.project.canvas.id))
                    .onConflictDoNothing();
            });
        }),
    suggested: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (isFreeEmail(ctx.user.email)) {
                return [];
            }

            // Bug fix #61: Only return suggested teammates if the caller has at least
            // EDITOR role on the project. VIEWERs (and non-members) shouldn't be able
            // to enumerate corporate-domain coworkers' emails.
            const callerMembership = await ctx.db.query.userProjects.findFirst({
                where: and(
                    eq(userProjects.userId, ctx.user.id),
                    eq(userProjects.projectId, input.projectId),
                ),
            });

            if (
                !callerMembership ||
                (callerMembership.role !== ProjectRole.ADMIN &&
                    callerMembership.role !== ProjectRole.EDITOR)
            ) {
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
                        isNull(userProjects.userId), // Not in the project
                        isNull(projectInvitations.id), // Not invited
                    ),
                )
                .limit(5);

            return suggestedUsers.map((user) => user.users.email);
        }),
});
