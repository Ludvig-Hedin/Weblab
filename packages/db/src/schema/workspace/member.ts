import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import { WorkspaceRole } from '@weblab/models';

import { users } from '../user/user';
import { workspaces } from './workspace';

export const workspaceRole = pgEnum('workspace_role', WorkspaceRole);

export const workspaceMembers = pgTable(
    'workspace_members',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id')
            .notNull()
            .references(() => workspaces.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        role: workspaceRole('role').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('workspace_members_workspace_user_unique').on(table.workspaceId, table.userId),
        index('workspace_members_user_idx').on(table.userId),
    ],
).enableRLS();

export const workspaceMemberInsertSchema = createInsertSchema(workspaceMembers);
export const workspaceMemberUpdateSchema = createUpdateSchema(workspaceMembers);

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;

export const workspaceMemberRelations = relations(workspaceMembers, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [workspaceMembers.workspaceId],
        references: [workspaces.id],
    }),
    user: one(users, {
        fields: [workspaceMembers.userId],
        references: [users.id],
    }),
}));
