import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import { InvitationStatus } from '@weblab/models';

import { projectRole, users } from '../user';
import { invitationStatus } from '../workspace/invitation';
import { projectMemberRole } from '../workspace/project-member';
import { projects } from './project';

export const projectInvitations = pgTable(
    'project_invitations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        inviterId: uuid('inviter_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        inviteeEmail: varchar('invitee_email').notNull(),
        token: varchar('token').notNull().unique(),
        role: projectRole('role').notNull(),
        // Added in 0034_workspaces_schema — new project-only role enum, dual-written.
        memberRole: projectMemberRole('member_role'),
        status: invitationStatus('status').notNull().default(InvitationStatus.PENDING),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('project_invitations_invitee_email_project_id_idx').on(
            table.inviteeEmail,
            table.projectId,
        ),
        index('project_invitations_status_idx').on(table.status),
    ],
).enableRLS();

export const projectInvitationInsertSchema = createInsertSchema(projectInvitations);
export const projectInvitationUpdateSchema = createUpdateSchema(projectInvitations);

export type ProjectInvitation = typeof projectInvitations.$inferSelect;
export type NewProjectInvitation = typeof projectInvitations.$inferInsert;

export const projectInvitationRelations = relations(projectInvitations, ({ one }) => ({
    project: one(projects, {
        fields: [projectInvitations.projectId],
        references: [projects.id],
    }),
    inviter: one(users, {
        fields: [projectInvitations.inviterId],
        references: [users.id],
    }),
}));
