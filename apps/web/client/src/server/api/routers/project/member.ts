import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { fromDbUser, userProjects, users } from '@weblab/db';
import { ProjectRole } from '@weblab/models';

import { createTRPCRouter, protectedProcedure } from '../../trpc';

export const memberRouter = createTRPCRouter({
    list: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const membership = await ctx.db
                .select({ role: userProjects.role })
                .from(userProjects)
                .where(
                    and(
                        eq(userProjects.projectId, input.projectId),
                        eq(userProjects.userId, ctx.user.id),
                    ),
                )
                .limit(1);

            if (membership.length === 0) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Not a member of this project',
                });
            }

            // Explicit join + selection — `query.userProjects.findMany({ with: { user: true } })`
            // ends up returning a narrowed `{ id, email }` shape under our
            // current drizzle relations setup, which loses the rest of the
            // user record. Selecting columns directly from `users` gives us a
            // fully-typed row that `fromDbUser(...)` can map over.
            const rows = await ctx.db
                .select({
                    role: userProjects.role,
                    user: {
                        id: users.id,
                        firstName: users.firstName,
                        lastName: users.lastName,
                        displayName: users.displayName,
                        avatarUrl: users.avatarUrl,
                        email: users.email,
                        createdAt: users.createdAt,
                        updatedAt: users.updatedAt,
                        stripeCustomerId: users.stripeCustomerId,
                        githubInstallationId: users.githubInstallationId,
                    },
                })
                .from(userProjects)
                .innerJoin(users, eq(userProjects.userId, users.id))
                .where(eq(userProjects.projectId, input.projectId));

            return rows.map((row) => ({
                role: row.role,
                user: fromDbUser(row.user),
            }));
        }),
    remove: protectedProcedure
        .input(z.object({ userId: z.string(), projectId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Caller must be OWNER or ADMIN, OR the user being removed (self-leave).
            const callerMembership = await ctx.db
                .select({ role: userProjects.role })
                .from(userProjects)
                .where(
                    and(
                        eq(userProjects.userId, ctx.user.id),
                        eq(userProjects.projectId, input.projectId),
                    ),
                )
                .limit(1);

            const callerRole = callerMembership[0]?.role as ProjectRole | undefined;
            const isAdmin = callerRole === ProjectRole.OWNER || callerRole === ProjectRole.ADMIN;
            const isSelfLeave = input.userId === ctx.user.id && !!callerRole;

            if (!isAdmin && !isSelfLeave) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Insufficient project role',
                });
            }

            await ctx.db.transaction(async (tx) => {
                // Refuse to remove the last OWNER. The check + delete run inside
                // a transaction so a concurrent removal cannot race past the guard.
                const target = await tx
                    .select({ role: userProjects.role })
                    .from(userProjects)
                    .where(
                        and(
                            eq(userProjects.userId, input.userId),
                            eq(userProjects.projectId, input.projectId),
                        ),
                    )
                    .limit(1);

                if (target[0]?.role === ProjectRole.OWNER) {
                    const owners = await tx
                        .select({ userId: userProjects.userId })
                        .from(userProjects)
                        .where(
                            and(
                                eq(userProjects.projectId, input.projectId),
                                eq(userProjects.role, ProjectRole.OWNER),
                            ),
                        );
                    if (owners.length <= 1) {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: 'Cannot remove the last owner',
                        });
                    }
                }

                await tx
                    .delete(userProjects)
                    .where(
                        and(
                            eq(userProjects.userId, input.userId),
                            eq(userProjects.projectId, input.projectId),
                        ),
                    );
            });

            return true;
        }),
});
