import type { Doc } from '../_generated/dataModel';
import { configObject, mergeFieldConfig } from './cmsFieldConfig';
import { validateAndCleanItemValues } from './cmsValueValidation';

export const CMS_RELEASE_LIMITS = { collections: 40, fields: 100, items: 500, bytes: 700_000 };

export interface CmsReleaseCollection {
    collection: Doc<'cmsCollections'>;
    fields: Doc<'cmsFields'>[];
    items: Doc<'cmsItems'>[];
}

/** Publish only settings used by the value contract, never provider metadata. */
function releaseField(field: Doc<'cmsFields'>, eligible: Map<string, Set<string>>): Doc<'cmsFields'> {
    const original = configObject(field.config);
    const settings: Record<string, unknown> = {};
    if (field.type === 'option') settings.options = original.options;
    if (field.type === 'reference') settings.collectionId = original.collectionId;
    if ((field.type === 'option' || field.type === 'reference') && original.multiple !== undefined) {
        settings.multiple = original.multiple;
    }
    const textType = field.type === 'text' || field.type === 'rich_text' || field.type === 'slug';
    if (textType && original.format !== undefined) settings.format = original.format;
    const config = mergeFieldConfig(textType ? 'text' : field.type, undefined, settings);
    // Legacy options may have meaningful whitespace. Never silently change their values.
    if (field.type === 'option' && JSON.stringify(config.options) !== JSON.stringify(original.options)) {
        throw new Error(`CMS_RELEASE_INVALID_FIELD_CONFIG: ${field.name}`);
    }
    if (field.type === 'reference' && (typeof config.collectionId !== 'string' || !eligible.has(config.collectionId))) {
        throw new Error(`CMS_RELEASE_INVALID_REFERENCE: ${field.name}`);
    }
    return { ...field, config };
}

/** A release includes site content, never source connection credentials or drafts. */
export function serializeCmsRelease(collections: CmsReleaseCollection[]): string {
    if (collections.length > CMS_RELEASE_LIMITS.collections) {
        throw new Error('CMS_RELEASE_TOO_LARGE: collections');
    }
    const projectId = collections[0]?.collection.projectId;
    const eligible = new Map<string, Set<string>>();
    for (const { collection, items } of collections) {
        if (collection.projectId !== projectId || eligible.has(collection._id)) throw new Error('CMS_RELEASE_INVALID_COLLECTION');
        const ids = new Set<string>();
        for (const item of items) {
            if (item.collectionId !== collection._id || item.status !== 'published' || item.archivedAt !== undefined || item.remoteId !== undefined || ids.has(item._id)) throw new Error('CMS_RELEASE_INVALID_COLLECTION');
            ids.add(item._id);
        }
        eligible.set(collection._id, ids);
    }
    function valuesForRelease(fields: Doc<'cmsFields'>[], item: Doc<'cmsItems'>) {
        const values = validateAndCleanItemValues(fields, item.values);
        for (const field of fields) {
            if (field.type !== 'reference' || values[field.key] === undefined) continue;
            const config = field.config && typeof field.config === 'object' && !Array.isArray(field.config) ? field.config as Record<string, unknown> : {};
            const target = typeof config.collectionId === 'string' ? eligible.get(config.collectionId) : undefined;
            const value = values[field.key];
            if (config.multiple === true ? !Array.isArray(value) : typeof value !== 'string') throw new Error(`CMS_RELEASE_INVALID_REFERENCE: ${field.name}`);
            const references = typeof value === 'string' ? [value] : value;
            if (!target || !Array.isArray(references) || !references.every((id) => typeof id === 'string' && target.has(id))) throw new Error(`CMS_RELEASE_INVALID_REFERENCE: ${field.name}`);
        }
        return values;
    }
    let itemCount = 0;
    const content = {
        // Older immutable v1 snapshots omitted field constraints. Keep them distinct.
        version: 2,
        collections: collections.map(({ collection, fields, items }) => {
            if (fields.length > CMS_RELEASE_LIMITS.fields) {
                throw new Error('CMS_RELEASE_TOO_LARGE: fields');
            }
            itemCount += items.length;
            if (itemCount > CMS_RELEASE_LIMITS.items) {
                throw new Error('CMS_RELEASE_TOO_LARGE: items');
            }
            if (fields.some((field) => field.collectionId !== collection._id) ||
                items.some((item) => item.collectionId !== collection._id || item.status !== 'published' || item.archivedAt !== undefined)) {
                throw new Error('CMS_RELEASE_INVALID_COLLECTION');
            }
            const releaseFields = fields.map((field) => releaseField(field, eligible));
            return {
                id: collection._id,
                name: collection.name,
                slug: collection.slug,
                fields: releaseFields.map((field) => ({
                    key: field.key, name: field.name, type: field.type, required: field.required, config: field.config,
                })),
                items: items.map((item) => ({
                    id: item._id, slug: item.slug ?? null, revision: item.revision ?? 0,
                    values: valuesForRelease(releaseFields, item),
                })),
            };
        }),
    };
    const serialized = JSON.stringify(content);
    if (new TextEncoder().encode(serialized).byteLength > CMS_RELEASE_LIMITS.bytes) {
        throw new Error('CMS_RELEASE_TOO_LARGE: content');
    }
    return serialized;
}
