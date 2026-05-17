import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import { ProjectMemberRole } from '@weblab/models';

import { projects } from '../project/project';
import { users } from '../user/user';

export const projectMemberRole = pgEnum('project_member_role', ProjectMemberRole);

export const projectMembers = pgTable(
    'project_members',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        role: projectMemberRole('role').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('project_members_project_user_unique').on(table.projectId, table.userId),
        index('project_members_user_idx').on(table.userId),
    ],
).enableRLS();

export const projectMemberInsertSchema = createInsertSchema(projectMembers);
export const projectMemberUpdateSchema = createUpdateSchema(projectMembers);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

export const projectMemberRelations = relations(projectMembers, ({ one }) => ({
    project: one(projects, {
        fields: [projectMembers.projectId],
        references: [projects.id],
    }),
    user: one(users, {
        fields: [projectMembers.userId],
        references: [users.id],
    }),
}));
