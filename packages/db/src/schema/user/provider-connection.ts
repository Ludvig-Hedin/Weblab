import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { users } from './user';

/**
 * OAuth tokens linking a Weblab user to an external AI provider account
 * (Codex/ChatGPT, Cursor, Gemini, OpenCode). Used by `/api/chat` on the
 * hosted web path to call the provider with the user's bearer instead of
 * Weblab's shared API key.
 *
 * `accessToken` and `refreshToken` are encrypted at rest by the route handlers
 * via `@/server/utils/provider-tokens` (AES-256-GCM) before insert. Never
 * store plaintext here.
 *
 * Migration is managed via `bun db:gen` (maintainer-only). Do not edit
 * existing migrations to backfill — issue a new migration if shape changes.
 *
 * TODO(rls): `enableRLS()` is on but no policies are defined here. The tRPC
 * `provider.connectionsList` / `connectionsDelete` procedures and the chat
 * route's bearer lookup all run with the service role (`db` from
 * `@weblab/db/src/client`), so RLS isn't currently enforced. If we ever
 * expose this table to PostgREST or a user-scoped Supabase client, add:
 *
 *     CREATE POLICY "user_provider_connections_owner"
 *     ON user_provider_connections
 *     FOR ALL
 *     USING (user_id = auth.uid());
 *
 * — and confirm cascading deletes still work under that policy.
 */
export const userProviderConnections = pgTable(
    'user_provider_connections',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        /** Stable provider id from `@weblab/ai` ProviderManifest.webOAuth.provider. */
        provider: text('provider').notNull(),
        accessTokenEncrypted: text('access_token_encrypted').notNull(),
        refreshTokenEncrypted: text('refresh_token_encrypted'),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        scopes: text('scopes'),
        accountEmail: text('account_email'),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        userProviderUnique: uniqueIndex('user_provider_connections_user_provider_idx').on(
            table.userId,
            table.provider,
        ),
        userIdx: index('user_provider_connections_user_idx').on(table.userId),
    }),
).enableRLS();

export const userProviderConnectionsRelations = relations(userProviderConnections, ({ one }) => ({
    user: one(users, {
        fields: [userProviderConnections.userId],
        references: [users.id],
    }),
}));

export const userProviderConnectionInsertSchema = createInsertSchema(userProviderConnections);
export type UserProviderConnection = typeof userProviderConnections.$inferSelect;
export type NewUserProviderConnection = typeof userProviderConnections.$inferInsert;
