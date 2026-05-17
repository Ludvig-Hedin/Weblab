import { relations } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { AuditEventKind } from '@weblab/models';

import { projects } from '../project/project';
import { users } from '../user/user';
import { workspaces } from './workspace';

export const auditEventKind = pgEnum('audit_event_kind', AuditEventKind);

export const auditLogs = pgTable(
    'audit_log',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').references(() => workspaces.id, {
            onDelete: 'set null',
            onUpdate: 'cascade',
        }),
        projectId: uuid('project_id').references(() => projects.id, {
            onDelete: 'set null',
            onUpdate: 'cascade',
        }),
        actorUserId: uuid('actor_user_id').references(() => users.id, {
            onDelete: 'set null',
            onUpdate: 'cascade',
        }),
        event: auditEventKind('event').notNull(),
        payload: jsonb('payload').notNull().default({}),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('audit_log_workspace_idx').on(table.workspaceId, table.createdAt),
        index('audit_log_project_idx').on(table.projectId, table.createdAt),
    ],
).enableRLS();

export const auditLogInsertSchema = createInsertSchema(auditLogs);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export const auditLogRelations = relations(auditLogs, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [auditLogs.workspaceId],
        references: [workspaces.id],
    }),
    project: one(projects, {
        fields: [auditLogs.projectId],
        references: [projects.id],
    }),
    actor: one(users, {
        fields: [auditLogs.actorUserId],
        references: [users.id],
    }),
}));
