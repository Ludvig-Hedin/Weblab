import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import { WorkspaceKind } from '@weblab/models';

import { projects } from '../project/project';
import { users } from '../user/user';
import { workspaceInvitations } from './invitation';
import { workspaceMembers } from './member';

export const workspaceKind = pgEnum('workspace_kind', WorkspaceKind);

export const workspaces = pgTable(
    'workspaces',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name').notNull(),
        slug: varchar('slug').notNull(),
        kind: workspaceKind('kind').notNull().default(WorkspaceKind.TEAM),
        // Note: WorkspaceKind value matches the pg enum literal 'team'.
        avatarUrl: text('avatar_url'),
        createdByUserId: uuid('created_by_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('workspaces_slug_unique').on(table.slug),
        index('workspaces_created_by_user_idx').on(table.createdByUserId),
    ],
).enableRLS();

export const workspaceInsertSchema = createInsertSchema(workspaces);
export const workspaceUpdateSchema = createUpdateSchema(workspaces);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export const workspaceRelations = relations(workspaces, ({ one, many }) => ({
    createdBy: one(users, {
        fields: [workspaces.createdByUserId],
        references: [users.id],
    }),
    members: many(workspaceMembers),
    invitations: many(workspaceInvitations),
    projects: many(projects),
}));
