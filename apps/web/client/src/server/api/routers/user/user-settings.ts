import { eq } from 'drizzle-orm';

import {
    createDefaultUserSettings,
    fromDbUserSettings,
    userSettings,
    userSettingsUpdateSchema,
} from '@weblab/db';

import { createTRPCRouter, protectedProcedure } from '../../trpc';

export const userSettingsRouter = createTRPCRouter({
    get: protectedProcedure.query(async ({ ctx }) => {
        const user = ctx.user;
        const settings = await ctx.db.query.userSettings.findFirst({
            where: eq(userSettings.userId, user.id),
        });
        return fromDbUserSettings(settings ?? createDefaultUserSettings(user.id));
    }),
    upsert: protectedProcedure.input(userSettingsUpdateSchema).mutation(async ({ ctx, input }) => {
        const user = ctx.user;

        // Single round-trip via Postgres ON CONFLICT — the unique constraint on
        // `user_settings.user_id` (see schema) lets Drizzle resolve to either
        // an insert (defaults + input) or an update (input only). The previous
        // select-then-write pattern doubled the latency of every settings save.
        const insertValues = { ...createDefaultUserSettings(user.id), ...input };
        const [row] = await ctx.db
            .insert(userSettings)
            .values(insertValues)
            .onConflictDoUpdate({
                target: userSettings.userId,
                set: input,
            })
            .returning();

        if (!row) {
            throw new Error('Failed to upsert user settings');
        }

        return fromDbUserSettings(row);
    }),
});
