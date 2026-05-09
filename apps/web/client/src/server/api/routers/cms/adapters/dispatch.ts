import { CmsSourceType } from '@weblab/models';

import type { CmsSourceAdapter } from './index';
import { payloadAdapter } from './payload';
import { restAdapter } from './rest';
import { strapiAdapter } from './strapi';

const ADAPTERS: Partial<Record<CmsSourceType, CmsSourceAdapter>> = {
    [CmsSourceType.PAYLOAD]: payloadAdapter,
    [CmsSourceType.STRAPI]: strapiAdapter,
    [CmsSourceType.REST]: restAdapter,
};

/**
 * Returns the adapter for an external source type, or null for `weblab`
 * (the native source has no adapter).
 */
export function getAdapter(type: CmsSourceType): CmsSourceAdapter | null {
    return ADAPTERS[type] ?? null;
}
