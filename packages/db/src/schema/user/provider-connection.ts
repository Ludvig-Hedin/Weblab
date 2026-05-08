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
 * via `@weblab/encryption` before insert; never store plaintext here.
 *
 * Migration is managed via `bun db:gen` (maintainer-only). Do not edit
 * existing migrations to backfill — issue a new migration if shape changes.
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
