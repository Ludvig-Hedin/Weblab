import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { fromDbProjectSettings, projectSettings, projectSettingsInsertSchema } from '@weblab/db';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

export const settingsRouter = createTRPCRouter({
    get: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            const setting = await ctx.db.query.projectSettings.findFirst({
                where: eq(projectSettings.projectId, input.projectId),
            });
            if (!setting) {
                return null;
            }
            return fromDbProjectSettings(setting);
        }),
    upsert: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                settings: projectSettingsInsertSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.manage_settings', {
                projectId: input.projectId,
            });
            // `input` is the wrapper { projectId, settings }, not a row. Insert
            // must receive the row shape (input.settings) — passing `input`
            // matched only the projectId column, leaving runCommand /
            // buildCommand / installCommand to fall back to their NOT NULL
            // defaults of `''`. First-time saves silently dropped the user's
            // commands; subsequent saves worked because the conflict path
            // (which already used input.settings) overwrote the empty row.
            const [updatedSettings] = await ctx.db
                .insert(projectSettings)
                .values(input.settings)
                .onConflictDoUpdate({
                    target: [projectSettings.projectId],
                    set: input.settings,
                })
                .returning();
            if (!updatedSettings) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to update project settings',
                });
            }
            return fromDbProjectSettings(updatedSettings);
        }),
    delete: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.manage_settings', {
                projectId: input.projectId,
            });
            await ctx.db
                .delete(projectSettings)
                .where(eq(projectSettings.projectId, input.projectId));
            return true;
        }),
});
