import { relations } from 'drizzle-orm';
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import type { CmsBindingPayload } from '@weblab/models';

import { projects } from '../project';

/**
 * Element-to-CMS binding sidecar. Keyed by parser-assigned `oid` so the
 * user's source code stays clean (no data-cms-bind attributes leaking
 * into exported code). One row per (project, oid) — the parser keeps
 * `oid`s stable across edits, so this is durable.
 *
 * `binding` is a discriminated union (see `CmsBindingPayload` in
 * @weblab/models) covering single-item, first-match, and (v2) repeating
 * + current-item-field cases.
 */
export const cmsBindings = pgTable('cms_binding', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
        .notNull()
        .references(() => projects.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    oid: varchar('oid').notNull(),
    binding: jsonb('binding').$type<CmsBindingPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const cmsBindingRelations = relations(cmsBindings, ({ one }) => ({
    project: one(projects, {
        fields: [cmsBindings.projectId],
        references: [projects.id],
    }),
}));

export type CmsBinding = typeof cmsBindings.$inferSelect;
export type NewCmsBinding = typeof cmsBindings.$inferInsert;
