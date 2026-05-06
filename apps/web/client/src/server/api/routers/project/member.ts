import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { fromDbUser, userProjects, users } from '@weblab/db';

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
            await ctx.db
                .delete(userProjects)
                .where(
                    and(
                        eq(userProjects.userId, input.userId),
                        eq(userProjects.projectId, input.projectId),
                    ),
                );

            return true;
        }),
});
