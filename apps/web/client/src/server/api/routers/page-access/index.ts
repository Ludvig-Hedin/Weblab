import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { pageAccess } from '@weblab/db';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { hashPassword } from './hash';

const PAGE_PATH_SCHEMA = z
    .string()
    .min(1)
    .refine((value) => value.startsWith('/'), {
        message: 'pagePath must start with "/"',
    });

/**
 * Per-page access control storage. Records public/password-protected state
 * for each route in a project. Enforcement happens in the user's published
 * site via a generated `middleware.ts` (see `publish/helpers/access-middleware.ts`),
 * not here — this router only persists the policy and the password hash.
 */
export const pageAccessRouter = createTRPCRouter({
    list: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            const rows = await ctx.db.query.pageAccess.findMany({
                where: eq(pageAccess.projectId, input.projectId),
            });
            // Never expose the password hash to the client.
            return rows.map(({ passwordHash: _drop, ...rest }) => rest);
        }),

    get: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                pagePath: PAGE_PATH_SCHEMA,
            }),
        )
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            const row = await ctx.db.query.pageAccess.findFirst({
                where: and(
                    eq(pageAccess.projectId, input.projectId),
                    eq(pageAccess.pagePath, input.pagePath),
                ),
            });
            if (!row) {
                return { accessType: 'public' as const, hasPassword: false };
            }
            return {
                accessType: row.accessType,
                hasPassword: Boolean(row.passwordHash),
            };
        }),

    upsert: protectedProcedure
        .input(
            z
                .object({
                    projectId: z.string().uuid(),
                    pagePath: PAGE_PATH_SCHEMA,
                    accessType: z.enum(['public', 'password']),
                    // Optional: only required when accessType === 'password' AND the page
                    // doesn't already have a password set. Sent in plaintext over HTTPS,
                    // never persisted as plaintext.
                    password: z.string().min(4).max(256).optional(),
                })
                .superRefine((data, ctx) => {
                    if (
                        data.accessType === 'password' &&
                        data.password !== undefined &&
                        data.password.length < 4
                    ) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ['password'],
                            message: 'Password must be at least 4 characters',
                        });
                    }
                }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.publish', {
                projectId: input.projectId,
            });

            const existing = await ctx.db.query.pageAccess.findFirst({
                where: and(
                    eq(pageAccess.projectId, input.projectId),
                    eq(pageAccess.pagePath, input.pagePath),
                ),
            });

            if (input.accessType === 'public') {
                if (existing) {
                    await ctx.db
                        .update(pageAccess)
                        .set({
                            accessType: 'public',
                            passwordHash: null,
                            updatedAt: new Date(),
                        })
                        .where(eq(pageAccess.id, existing.id));
                }
                return { accessType: 'public' as const, hasPassword: false };
            }

            // accessType === 'password'
            // Hash the new password if provided; otherwise keep the existing hash.
            let nextHash: string | null = existing?.passwordHash ?? null;
            if (input.password !== undefined && input.password.length > 0) {
                nextHash = await hashPassword(input.password);
            }
            if (!nextHash) {
                throw new Error(
                    'A password is required when switching this page to password-protected.',
                );
            }

            if (existing) {
                await ctx.db
                    .update(pageAccess)
                    .set({
                        accessType: 'password',
                        passwordHash: nextHash,
                        updatedAt: new Date(),
                    })
                    .where(eq(pageAccess.id, existing.id));
            } else {
                await ctx.db.insert(pageAccess).values({
                    projectId: input.projectId,
                    pagePath: input.pagePath,
                    accessType: 'password',
                    passwordHash: nextHash,
                });
            }

            return { accessType: 'password' as const, hasPassword: true };
        }),
});
