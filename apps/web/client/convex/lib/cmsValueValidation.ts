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
function validPublicUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/\s/.test(value);
    } catch { return false; }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateValueForType(field: Doc<'cmsFields'>, value: unknown): unknown {
    const { type, name: fieldName } = field;
    const config = isPlainObject(field.config) ? field.config : {};
    switch (type) {
        case 'text':
        case 'rich_text':
        case 'slug': {
            if (typeof value !== 'string') {
                throw new Error(`BAD_REQUEST: ${fieldName} must be a string`);
            }
            if (config.format === 'url' && value !== '' && !validPublicUrl(value)) {
                throw new Error(`BAD_REQUEST: ${fieldName} must be an HTTP or HTTPS link.`);
            }
            return value;
        }
        case 'number': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
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
            if (typeof value.url !== 'string' || !validPublicUrl(value.url)) {
                throw new Error(`BAD_REQUEST: ${fieldName} requires a valid url`);
            }
            if (value.path !== undefined && typeof value.path !== 'string') {
                throw new Error(`BAD_REQUEST: ${fieldName}.path must be a string`);
            }
            if (value.alt !== undefined && typeof value.alt !== 'string') throw new Error(`BAD_REQUEST: ${fieldName}.alt must be a string`);
            return value;
        }
        case 'option':
        case 'reference': {
            const entries = typeof value === 'string' ? [value] : value;
            if (!Array.isArray(entries) || entries.length > 100 || !entries.every((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 256)) {
                throw new Error(`BAD_REQUEST: ${fieldName} must contain valid selections.`);
            }
            if (config.multiple !== true && Array.isArray(value)) throw new Error(`BAD_REQUEST: ${fieldName} allows one selection.`);
            if (new Set(entries).size !== entries.length) throw new Error(`BAD_REQUEST: ${fieldName} contains duplicate selections.`);
            if (type === 'option') {
                const options = config.options;
                if (!Array.isArray(options) || !options.every((option) => typeof option === 'string')) {
                    throw new Error(`BAD_REQUEST: Configure the options for ${fieldName} first.`);
                }
                if (entries.some((entry) => !options.includes(entry))) throw new Error(`BAD_REQUEST: ${fieldName} contains an unknown option.`);
            }
            // Reference IDs are checked against actual same-project rows by cmsItems.
            return value;
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
    values: unknown,
): Record<string, unknown> {
    if (!isPlainObject(values)) throw new Error('BAD_REQUEST: Item values must be an object.');

    const cleaned: Record<string, unknown> = {};

    // 1) Walk every known field. Validate required + type.
    for (const field of fields) {
        const raw = values[field.key];

        // Required check first — matches Zod's `.refine` on required fields.
        if (field.required) {
            if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) {
                throw new Error(`BAD_REQUEST: ${field.name} is required`);
            }
        }

        // Optional + missing → drop the key (don't store null/undefined).
        if (raw === undefined || raw === null) continue;

        cleaned[field.key] = validateValueForType(field, raw);
    }

    // 2) Unknown keys (i.e. keys not in fieldByKey) are implicitly stripped
    //    by only writing `cleaned[field.key]` above. No-op.

    return cleaned;
}
