import { z } from 'zod';

import type { CmsField } from '@weblab/db';
import { CmsFieldType } from '@weblab/models';

/**
 * Build a Zod schema from a collection's field list. Used to validate
 * `cmsItem.values` on create/update. Required fields without a value
 * fail with a friendly message; type mismatches fail with the field
 * name in the message.
 *
 * Unknown keys are stripped — extra keys in the payload don't error,
 * they just get dropped. This makes schema migration (renaming/removing
 * a field) non-breaking for existing items.
 */
export function buildItemValuesSchema(fields: CmsField[]): z.ZodType<Record<string, unknown>> {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const field of fields) {
        let schema = baseSchemaForType(field.type, field.config);
        if (!field.required) {
            schema = schema.optional().nullable();
        } else {
            schema = schema.refine((v) => v !== undefined && v !== null && v !== '', {
                message: `${field.name} is required`,
            });
        }
        shape[field.key] = schema;
    }

    return z.object(shape).strip();
}

function baseSchemaForType(type: CmsFieldType, _config: Record<string, unknown>): z.ZodTypeAny {
    switch (type) {
        case CmsFieldType.TEXT:
        case CmsFieldType.RICH_TEXT:
        case CmsFieldType.SLUG:
            return z.string();
        case CmsFieldType.NUMBER:
            return z.number();
        case CmsFieldType.BOOLEAN:
            return z.boolean();
        case CmsFieldType.DATE:
            return z
                .string()
                .datetime()
                .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
        case CmsFieldType.IMAGE:
            return z.object({ url: z.string().url(), path: z.string().optional() });
        case CmsFieldType.OPTION:
            return z.string().or(z.array(z.string()));
        case CmsFieldType.REFERENCE:
            return z.string().uuid().or(z.array(z.string().uuid()));
        default:
            return z.unknown();
    }
}
