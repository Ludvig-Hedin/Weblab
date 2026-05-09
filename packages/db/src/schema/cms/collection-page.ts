import { relations } from 'drizzle-orm';
import { pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { projects } from '../project';
import { cmsCollections } from './collection';

/**
 * Marks a project page (e.g. `/blog/[slug]`) as a collection-page template.
 * When the editor is showing this page, the binding dialog can offer the
 * `PAGE_ITEM_FIELD` source, and the data pusher resolves the "current item"
 * by URL match (or editor-picked item — whichever the page-mode toolbar
 * provides).
 *
 * `pagePath` is stored verbatim with brackets, e.g. `/blog/[slug]`.
 * `matchFieldKey` names the field on the collection's item that maps to
 * the dynamic segment (typically `slug`).
 */
export const cmsCollectionPages = pgTable('cms_collection_page', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
        .notNull()
        .references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    collectionId: uuid('collection_id')
        .notNull()
        .references(() => cmsCollections.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    pagePath: varchar('page_path').notNull(),
    matchFieldKey: varchar('match_field_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniquePagePerProject: unique('cms_collection_page_project_path_unique').on(table.projectId, table.pagePath),
})).enableRLS();

export const cmsCollectionPageRelations = relations(cmsCollectionPages, ({ one }) => ({
    project: one(projects, {
        fields: [cmsCollectionPages.projectId],
        references: [projects.id],
    }),
    collection: one(cmsCollections, {
        fields: [cmsCollectionPages.collectionId],
        references: [cmsCollections.id],
    }),
}));

export type CmsCollectionPage = typeof cmsCollectionPages.$inferSelect;
export type NewCmsCollectionPage = typeof cmsCollectionPages.$inferInsert;
