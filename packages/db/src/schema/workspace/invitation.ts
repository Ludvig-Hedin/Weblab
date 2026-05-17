import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import { InvitationStatus } from '@weblab/models';

import { users } from '../user/user';
import { workspaceRole } from './member';
import { workspaces } from './workspace';

export const invitationStatus = pgEnum('invitation_status', InvitationStatus);

export const workspaceInvitations = pgTable(
    'workspace_invitations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id')
            .notNull()
            .references(() => workspaces.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        email: varchar('email').notNull(),
        role: workspaceRole('role').notNull(),
        token: varchar('token').notNull().unique(),
        status: invitationStatus('status').notNull().default(InvitationStatus.PENDING),
        invitedByUserId: uuid('invited_by_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('workspace_invitations_email_workspace_status_idx').on(
            table.email,
            table.workspaceId,
            table.status,
        ),
    ],
).enableRLS();

export const workspaceInvitationInsertSchema = createInsertSchema(workspaceInvitations);
export const workspaceInvitationUpdateSchema = createUpdateSchema(workspaceInvitations);

export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type NewWorkspaceInvitation = typeof workspaceInvitations.$inferInsert;

export const workspaceInvitationRelations = relations(workspaceInvitations, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [workspaceInvitations.workspaceId],
        references: [workspaces.id],
    }),
    invitedBy: one(users, {
        fields: [workspaceInvitations.invitedByUserId],
        references: [users.id],
    }),
}));
