import { relations, sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import { projects } from '../project/project';
import { users } from '../user/user';

/**
 * Agent Skills authored by a user. Two scopes:
 *   - User-global: project_id IS NULL — applies in all of the user's projects.
 *   - Per-project: project_id set — only loaded for that project.
 *
 * Resolution at chat time gives project-scoped skills priority over
 * user-global, then filesystem (dev), then EMBEDDED_SKILLS (built-ins).
 * Same `name` higher in the chain wins, so users can override built-ins.
 *
 * Uniqueness: a user can have at most one skill per (project_id, name).
 * Postgres treats NULL as distinct in regular UNIQUE constraints, so we
 * enforce uniqueness with two partial indexes split on project_id.
 */
export const skills = pgTable(
    'skills',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        projectId: uuid('project_id').references(() => projects.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
        name: text('name').notNull(),
        description: text('description').notNull().default(''),
        content: text('content').notNull().default(''),
        enabled: boolean('enabled').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .default(sql`now()`),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .default(sql`now()`),
    },
    (table) => [
        uniqueIndex('skills_user_global_name_unique')
            .on(table.userId, table.name)
            .where(sql`${table.projectId} IS NULL`),
        uniqueIndex('skills_user_project_name_unique')
            .on(table.userId, table.projectId, table.name)
            .where(sql`${table.projectId} IS NOT NULL`),
    ],
).enableRLS();

export const skillsRelations = relations(skills, ({ one }) => ({
    user: one(users, {
        fields: [skills.userId],
        references: [users.id],
    }),
    project: one(projects, {
        fields: [skills.projectId],
        references: [projects.id],
    }),
}));

export const skillInsertSchema = createInsertSchema(skills);
export const skillUpdateSchema = createUpdateSchema(skills);

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
