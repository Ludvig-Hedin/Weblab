import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { HostingProvider } from '@weblab/models';

import { users } from '../user/user';

/**
 * Shared Postgres enum for hosting providers. Sourced from `HostingProvider`
 * in `@weblab/models` so the DB and app never drift. Also used by the
 * `provider` column on `deployments`.
 */
export const hostingProvider = pgEnum('hosting_provider', HostingProvider);

/**
 * Links a Weblab user to an external hosting provider account (Vercel,
 * Netlify, Cloudflare, Railway, Render) so deployments can run on the user's
 * own account instead of Weblab-managed hosting.
 *
 * `tokenEncrypted` is encrypted at rest via `@/server/utils/provider-tokens`
 * (AES-256-GCM) before insert. Never store a plaintext token here.
 *
 * One connection per (user, provider). `HostingProvider.FREESTYLE` never has a
 * row here — it is Weblab's own hosting and needs no user credentials.
 */
export const hostingProviderConnections = pgTable(
    'hosting_provider_connections',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        provider: hostingProvider('provider').notNull(),
        /** AES-256-GCM encrypted provider API token. */
        tokenEncrypted: text('token_encrypted').notNull(),
        /** Display label for the connected account (team name / email). */
        accountLabel: text('account_label'),
        /** Provider-side account or team id, when the provider exposes one. */
        accountId: text('account_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        userProviderUnique: uniqueIndex('hosting_provider_connections_user_provider_idx').on(
            table.userId,
            table.provider,
        ),
        userIdx: index('hosting_provider_connections_user_idx').on(table.userId),
    }),
).enableRLS();

export const hostingProviderConnectionsRelations = relations(
    hostingProviderConnections,
    ({ one }) => ({
        user: one(users, {
            fields: [hostingProviderConnections.userId],
            references: [users.id],
        }),
    }),
);

export const hostingProviderConnectionInsertSchema = createInsertSchema(hostingProviderConnections);

export type HostingProviderConnection = typeof hostingProviderConnections.$inferSelect;
export type NewHostingProviderConnection = typeof hostingProviderConnections.$inferInsert;
