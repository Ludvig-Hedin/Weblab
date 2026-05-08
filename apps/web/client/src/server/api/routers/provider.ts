import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { userProviderConnections } from '@weblab/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

const providerInput = z.object({
    provider: z.enum(['codex', 'cursor', 'gemini', 'opencode']),
});

export const providerRouter = createTRPCRouter({
    /**
     * List the CLI providers the current user has connected via OAuth.
     * The picker uses this to flip CLI submenus from "Sign in" → "Ready" on
     * hosted web. Tokens are NEVER returned — we only emit the public
     * metadata the renderer needs.
     */
    connectionsList: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                provider: userProviderConnections.provider,
                accountEmail: userProviderConnections.accountEmail,
                expiresAt: userProviderConnections.expiresAt,
            })
            .from(userProviderConnections)
            .where(eq(userProviderConnections.userId, ctx.user.id));
        return rows;
    }),

    connectionsDelete: protectedProcedure.input(providerInput).mutation(async ({ ctx, input }) => {
        await ctx.db
            .delete(userProviderConnections)
            .where(
                and(
                    eq(userProviderConnections.userId, ctx.user.id),
                    eq(userProviderConnections.provider, input.provider),
                ),
            );
        return { ok: true };
    }),
});
