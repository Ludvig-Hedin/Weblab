import { relations } from 'drizzle-orm';
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { CmsItemStatus } from '@weblab/models';

import { cmsCollections } from './collection';

/**
 * A single content item belonging to a collection. `values` is keyed by
 * `cmsField.key` and is heterogeneous; the tRPC layer builds a Zod schema
 * from the collection's fields at call time and validates `values` against
 * it before write. The DB intentionally does not enforce shape — same
 * pattern as `chat.message.parts` and `project.runtime_metadata`.
 *
 * `slug` is unique per collection and is used to address the item in
 * collection-page routing (v4); for v1 it is informational.
 */
export const cmsItems = pgTable('cms_item', {
    id: uuid('id').primaryKey().defaultRandom(),
    collectionId: uuid('collection_id')
        .notNull()
        .references(() => cmsCollections.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    slug: varchar('slug'),
    status: varchar('status').$type<CmsItemStatus>().notNull().default(CmsItemStatus.DRAFT),
    /**
     * Foreign id from an external CMS source (Payload, Strapi, REST). Null
     * for items native to the Weblab CMS. Used by the sync routine to upsert
     * external items into this table without creating duplicates.
     */
    remoteId: varchar('remote_id'),
    values: jsonb('values').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
}).enableRLS();

export const cmsItemRelations = relations(cmsItems, ({ one }) => ({
    collection: one(cmsCollections, {
        fields: [cmsItems.collectionId],
        references: [cmsCollections.id],
    }),
}));

export type CmsItem = typeof cmsItems.$inferSelect;
export type NewCmsItem = typeof cmsItems.$inferInsert;
