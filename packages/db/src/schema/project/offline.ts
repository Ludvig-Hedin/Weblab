import { relations } from 'drizzle-orm';
import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from '../user/user';
import { projects } from './project';

/**
 * Per-user, per-project pin marking the project as "available offline".
 * Pinned projects are pre-cached client-side in IndexedDB so the editor
 * can boot without a network round-trip. RLS restricts rows to the
 * owning user.
 */
export const projectOfflinePins = pgTable(
    'project_offline_pins',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        pinnedAt: timestamp('pinned_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.projectId] }),
        index('project_offline_pins_user_idx').on(table.userId),
    ],
).enableRLS();

export const projectOfflinePinsRelations = relations(projectOfflinePins, ({ one }) => ({
    user: one(users, {
        fields: [projectOfflinePins.userId],
        references: [users.id],
    }),
    project: one(projects, {
        fields: [projectOfflinePins.projectId],
        references: [projects.id],
    }),
}));

export type ProjectOfflinePin = typeof projectOfflinePins.$inferSelect;
export type NewProjectOfflinePin = typeof projectOfflinePins.$inferInsert;
