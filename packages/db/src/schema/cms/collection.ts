import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { projects } from '../project';
import { cmsFields } from './field';
import { cmsItems } from './item';
import { cmsSources } from './source';

/**
 * A CMS collection (e.g., "Blog posts", "Docs", "Jobs"). Each collection
 * belongs to a project and is fed by exactly one source. The default
 * source is the seeded weblab source; v3 adds external sources.
 *
 * `slug` is the stable identifier used in bindings and (later) routing.
 * It is unique per project, not globally.
 */
export const cmsCollections = pgTable('cms_collection', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
        .notNull()
        .references(() => projects.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    sourceId: uuid('source_id')
        .notNull()
        .references(() => cmsSources.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    name: varchar('name').notNull(),
    slug: varchar('slug').notNull(),
    icon: varchar('icon'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const cmsCollectionRelations = relations(cmsCollections, ({ one, many }) => ({
    project: one(projects, {
        fields: [cmsCollections.projectId],
        references: [projects.id],
    }),
    source: one(cmsSources, {
        fields: [cmsCollections.sourceId],
        references: [cmsSources.id],
    }),
    fields: many(cmsFields),
    items: many(cmsItems),
}));

export type CmsCollection = typeof cmsCollections.$inferSelect;
export type NewCmsCollection = typeof cmsCollections.$inferInsert;
