import type { Doc } from '../_generated/dataModel';

// Port of buildItemValuesSchema from
// src/server/api/routers/cms/values.ts. Convex's V8 runtime can't easily
// host Zod for hot-path mutations (cold-start cost on a small isolate),
// so we inline a minimal per-field-type validator with the same rules:
//
// - Required fields fail when value is undefined / null / empty string.
// - Type mismatches throw with the field's display name.
// - Unknown keys (i.e. keys not in the current field list) are stripped
//   — that's how rename / type-change / delete remains non-breaking for
//   existing items.

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /^https?:\/\/[^\s]+$/i;

type FieldType = Doc<'cmsFields'>['type'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateValueForType(type: FieldType, value: unknown, fieldName: string): unknown {
    switch (type) {
        case 'text':
        case 'rich_text':
        case 'slug': {
            if (typeof value !== 'string') {
                throw new Error(`BAD_REQUEST: ${fieldName} must be a string`);
            }
            return value;
        }
        case 'number': {
            if (typeof value !== 'number' || Number.isNaN(value)) {
                throw new Error(`BAD_REQUEST: ${fieldName} must be a number`);
            }
            return value;
        }
        case 'boolean': {
            if (typeof value !== 'boolean') {
                throw new Error(`BAD_REQUEST: ${fieldName} must be a boolean`);
            }
            return value;
        }
        case 'date': {
            if (
                typeof value !== 'string' ||
                (!ISO_DATETIME_RE.test(value) && !DATE_ONLY_RE.test(value))
            ) {
                throw new Error(
                    `BAD_REQUEST: ${fieldName} must be an ISO datetime or YYYY-MM-DD date`,
                );
            }
            return value;
        }
        case 'image': {
            if (!isPlainObject(value)) {
                throw new Error(`BAD_REQUEST: ${fieldName} must be an object with { url, path? }`);
            }
            if (typeof value.url !== 'string' || !URL_RE.test(value.url)) {
                throw new Error(`BAD_REQUEST: ${fieldName} requires a valid url`);
            }
            if (value.path !== undefined && typeof value.path !== 'string') {
                throw new Error(`BAD_REQUEST: ${fieldName}.path must be a string`);
            }
            return value;
        }
        case 'option': {
            if (typeof value === 'string') return value;
            if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
                return value;
            }
            throw new Error(`BAD_REQUEST: ${fieldName} must be a string or array of strings`);
        }
        case 'reference': {
            if (typeof value === 'string') {
                if (!UUID_RE.test(value)) {
                    throw new Error(`BAD_REQUEST: ${fieldName} must be a UUID`);
                }
                return value;
            }
            if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
                for (const id of value) {
                    if (!UUID_RE.test(id)) {
                        throw new Error(`BAD_REQUEST: ${fieldName} entries must be UUIDs`);
                    }
                }
                return value;
            }
            throw new Error(`BAD_REQUEST: ${fieldName} must be a UUID or array of UUIDs`);
        }
        default:
            return value;
    }
}

/**
 * Validate an item `values` payload against the collection's field list.
 *
 * - `values` is the FULL (already-merged) payload. Callers doing partial
 *   updates must merge against the prior values BEFORE calling this.
 * - Returns the cleaned payload: unknown keys stripped + null/undefined
 *   keys dropped entirely so they don't accumulate as orphans.
 */
export function validateAndCleanItemValues(
    fields: Doc<'cmsFields'>[],
    values: Record<string, unknown>,
): Record<string, unknown> {
    const fieldByKey = new Map<string, Doc<'cmsFields'>>();
    for (const f of fields) fieldByKey.set(f.key, f);

    const cleaned: Record<string, unknown> = {};

    // 1) Walk every known field. Validate required + type.
    for (const field of fields) {
        const raw = values[field.key];

        // Required check first — matches Zod's `.refine` on required fields.
        if (field.required) {
            if (raw === undefined || raw === null || raw === '') {
                throw new Error(`BAD_REQUEST: ${field.name} is required`);
            }
        }

        // Optional + missing → drop the key (don't store null/undefined).
        if (raw === undefined || raw === null) continue;

        cleaned[field.key] = validateValueForType(field.type, raw, field.name);
    }

    // 2) Unknown keys (i.e. keys not in fieldByKey) are implicitly stripped
    //    by only writing `cleaned[field.key]` above. No-op.

    return cleaned;
}
