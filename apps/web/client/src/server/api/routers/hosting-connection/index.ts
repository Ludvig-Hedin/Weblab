import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { HostingProviderConnection } from '@weblab/db';
import type { HostingProvider } from '@weblab/models';
import { hostingProviderConnections } from '@weblab/db';
import { EXTERNAL_HOSTING_PROVIDERS } from '@weblab/models';

import { encryptProviderToken } from '@/server/utils/provider-tokens';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { HostingProviderFactory } from '../domain/hosting-factory';

/**
 * Strip the encrypted token from a row before returning to the client. We
 * never want the encrypted blob to leave the server — there's no reason for
 * the browser to hold ciphertext it can't decrypt anyway.
 */
function stripTokenField(
    row: HostingProviderConnection,
): Omit<HostingProviderConnection, 'tokenEncrypted'> {
    const { tokenEncrypted: _ignored, ...rest } = row;
    void _ignored;
    return rest;
}

/**
 * Manages a user's connections to external hosting providers (Vercel, Netlify,
 * Cloudflare Pages, Railway, Render). Tokens are encrypted at rest via
 * `encryptProviderToken` (AES-256-GCM) before insert.
 *
 * `HostingProvider.FREESTYLE` is Weblab's own hosting and intentionally cannot
 * be stored here — `externalProviderSchema` rejects it.
 */
const externalProviderSchema = z.enum(
    EXTERNAL_HOSTING_PROVIDERS as [HostingProvider, ...HostingProvider[]],
);

export const hostingConnectionRouter = createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db.query.hostingProviderConnections.findMany({
            where: eq(hostingProviderConnections.userId, ctx.user.id),
            orderBy: desc(hostingProviderConnections.createdAt),
        });
        // Never return the encrypted token to the client.
        return rows.map(stripTokenField);
    }),

    validateToken: protectedProcedure
        .input(
            z.object({
                provider: externalProviderSchema,
                token: z.string().trim().min(1),
            }),
        )
        .mutation(async ({ input }) => {
            const adapter = HostingProviderFactory.create(input.provider);
            if (!adapter.validateToken) {
                return {
                    ok: false as const,
                    message: 'This provider does not support token validation.',
                };
            }
            return adapter.validateToken(input.token);
        }),

    create: protectedProcedure
        .input(
            z.object({
                provider: externalProviderSchema,
                token: z.string().trim().min(1),
                /** Optional override; otherwise we use the label returned by the provider. */
                accountLabel: z.string().trim().max(120).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const adapter = HostingProviderFactory.create(input.provider);
            let accountLabel = input.accountLabel ?? null;
            let accountId: string | null = null;

            if (adapter.validateToken) {
                const validation = await adapter.validateToken(input.token);
                if (!validation.ok) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: validation.message ?? 'Token validation failed.',
                    });
                }
                accountLabel = accountLabel ?? validation.accountLabel ?? null;
                accountId = validation.accountId ?? null;
            }

            const tokenEncrypted = encryptProviderToken(input.token);

            // Upsert: one connection per (user, provider).
            const existing = await ctx.db.query.hostingProviderConnections.findFirst({
                where: and(
                    eq(hostingProviderConnections.userId, ctx.user.id),
                    eq(hostingProviderConnections.provider, input.provider),
                ),
            });
            if (existing) {
                const [updated] = await ctx.db
                    .update(hostingProviderConnections)
                    .set({
                        tokenEncrypted,
                        accountLabel,
                        accountId,
                        updatedAt: new Date(),
                    })
                    .where(eq(hostingProviderConnections.id, existing.id))
                    .returning();
                if (!updated) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to update connection',
                    });
                }
                return stripTokenField(updated);
            }
            const [created] = await ctx.db
                .insert(hostingProviderConnections)
                .values({
                    userId: ctx.user.id,
                    provider: input.provider,
                    tokenEncrypted,
                    accountLabel,
                    accountId,
                })
                .returning();
            if (!created) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create connection',
                });
            }
            return stripTokenField(created);
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.query.hostingProviderConnections.findFirst({
                where: and(
                    eq(hostingProviderConnections.id, input.id),
                    eq(hostingProviderConnections.userId, ctx.user.id),
                ),
            });
            if (!existing) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' });
            }
            await ctx.db
                .delete(hostingProviderConnections)
                .where(eq(hostingProviderConnections.id, input.id));
            return { success: true };
        }),
});
