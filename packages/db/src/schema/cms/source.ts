import { relations } from 'drizzle-orm';
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { CmsSourceType } from '@weblab/models';

import { projects } from '../project';
import { cmsCollections } from './collection';

/**
 * Per-project CMS data sources. Every project gets a default `weblab` source
 * seeded on creation; users can later add `payload`, `strapi`, or `rest`.
 *
 * `credentials` stays opaque (jsonb) because each adapter has its own shape
 * (api keys, base URLs, project ids). Adapter code in `@weblab/cms` validates
 * the shape per-type before issuing requests.
 */
export const cmsSources = pgTable('cms_source', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
        .notNull()
        .references(() => projects.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    name: varchar('name').notNull(),
    type: varchar('type').$type<CmsSourceType>().notNull().default(CmsSourceType.WEBLAB),
    credentials: jsonb('credentials').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status').notNull().default('connected'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const cmsSourceRelations = relations(cmsSources, ({ one, many }) => ({
    project: one(projects, {
        fields: [cmsSources.projectId],
        references: [projects.id],
    }),
    collections: many(cmsCollections),
}));

export type CmsSource = typeof cmsSources.$inferSelect;
export type NewCmsSource = typeof cmsSources.$inferInsert;
