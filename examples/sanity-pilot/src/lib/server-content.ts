import 'server-only';

import { cache } from 'react';

import { configFromEnvironment, loadContent } from './content';

export function isSampleMode() {
    const mode = process.env.SANITY_CONTENT_MODE;
    return mode === undefined || mode === 'sample';
}

// Deduplicate layout/page reads within one render, without caching across visits.
export const getSiteContent = cache(() => loadContent(configFromEnvironment(process.env)));
