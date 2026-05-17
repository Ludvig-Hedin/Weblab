import { relations } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import { projects } from './project';

export const pageAccessType = pgEnum('page_access_type', ['public', 'password']);

/**
 * Per-page access control. Records whether a route in a project should be
 * served publicly or gated behind a password. Enforcement is wired up by the
 * publish flow, which emits a Next.js `middleware.ts` that checks a signed
 * cookie against `passwordHash`. The hash itself is never exposed to the
 * client.
 */
export const pageAccess = pgTable(
    'page_access',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        pagePath: text('page_path').notNull(),
        accessType: pageAccessType('access_type').notNull().default('public'),
        // bcrypt hash. Null when accessType is 'public'.
        passwordHash: text('password_hash'),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => [uniqueIndex('page_access_project_path_idx').on(table.projectId, table.pagePath)],
).enableRLS();

export const pageAccessInsertSchema = createInsertSchema(pageAccess);
export const pageAccessUpdateSchema = createUpdateSchema(pageAccess);

export const pageAccessRelations = relations(pageAccess, ({ one }) => ({
    project: one(projects, {
        fields: [pageAccess.projectId],
        references: [projects.id],
    }),
}));

export type PageAccess = typeof pageAccess.$inferSelect;
export type NewPageAccess = typeof pageAccess.$inferInsert;
