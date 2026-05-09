import { relations } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import type { CmsFieldType } from '@weblab/models';

import { cmsCollections } from './collection';

/**
 * Field definition for a collection. The collection's "schema" is the set
 * of its fields ordered by `order`. `key` is the stable identifier used in
 * `cmsItems.values` and in bindings; `name` is the human label.
 *
 * `config` is jsonb because each field type has its own knobs:
 *  - text:      { maxLength?, multiline? }
 *  - rich_text: {}
 *  - number:    { min?, max?, integer? }
 *  - date:      { mode: 'date' | 'datetime' }
 *  - image:     { aspectRatio? }
 *  - slug:      { sourceFieldKey? }   // auto-fill from another field
 *  - option:    { options: { value, label }[], multi? }
 *  - reference: { collectionId, multi? }
 */
export const cmsFields = pgTable('cms_field', {
    id: uuid('id').primaryKey().defaultRandom(),
    collectionId: uuid('collection_id')
        .notNull()
        .references(() => cmsCollections.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    name: varchar('name').notNull(),
    key: varchar('key').notNull(),
    type: varchar('type').$type<CmsFieldType>().notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    helpText: varchar('help_text'),
    required: boolean('required').notNull().default(false),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const cmsFieldRelations = relations(cmsFields, ({ one }) => ({
    collection: one(cmsCollections, {
        fields: [cmsFields.collectionId],
        references: [cmsCollections.id],
    }),
}));

export type CmsField = typeof cmsFields.$inferSelect;
export type NewCmsField = typeof cmsFields.$inferInsert;
