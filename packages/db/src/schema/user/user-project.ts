import { relations } from 'drizzle-orm';
import { pgEnum, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { ProjectRole } from '@weblab/models';

import { projects } from '../project';
import { projectMemberRole } from '../workspace/project-member';
import { users } from './user';

export const projectRole = pgEnum('project_role', ProjectRole);

export const userProjects = pgTable(
    'user_projects',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
        role: projectRole('role').notNull(),
        // Added in 0034_workspaces_schema — dual-written by app code during transition.
        // Phase 9 drops legacy `role` and renames table to project_members.
        memberRole: projectMemberRole('member_role'),
    },
    (table) => [primaryKey({ columns: [table.userId, table.projectId] })],
).enableRLS();

export const userProjectsRelations = relations(userProjects, ({ one }) => ({
    user: one(users, {
        fields: [userProjects.userId],
        references: [users.id],
    }),
    project: one(projects, {
        fields: [userProjects.projectId],
        references: [projects.id],
    }),
}));

export const userProjectInsertSchema = createInsertSchema(userProjects);
export type UserProject = typeof userProjects.$inferSelect;
export type NewUserProject = typeof userProjects.$inferInsert;
