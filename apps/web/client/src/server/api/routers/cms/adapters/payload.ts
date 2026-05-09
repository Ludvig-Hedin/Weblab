import { CmsFieldType, CmsSourceType } from '@weblab/models';

import type { CmsSourceAdapter, RemoteCollection, RemoteItem } from './index';
import { fetchWithTimeout } from './index';

/**
 * Payload v3 adapter (also works against v2 for the read-only operations
 * this implementation needs).
 *
 * Auth header for users-collection API keys:
 *   Authorization: <users-collection-slug> API-Key <key>
 * For server-issued bearer tokens (not common):
 *   Authorization: Bearer <token>
 *
 * Schema discovery in Payload requires the admin GraphQL endpoint. To keep
 * the adapter REST-only, this v3 implementation asks the user to enter the
 * collection slugs they want to expose. We sample one item per slug to
 * infer field types.
 */
interface PayloadCredentials {
    baseUrl: string;
    apiKey: string;
    /** Slug of the users collection that issued the API key. Defaults to
     *  "users" — the Payload default. */
    usersSlug?: string;
    /** Comma-separated collection slugs to expose, e.g. "blog,docs,jobs".
     *  Empty string means "discover from /api/access" (best-effort). */
    collectionSlugs?: string;
}

function authHeader(creds: PayloadCredentials): string {
    const slug = creds.usersSlug?.trim() || 'users';
    return `${slug} API-Key ${creds.apiKey}`;
}

function isPayloadCreds(value: unknown): value is PayloadCredentials {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.baseUrl === 'string' && typeof v.apiKey === 'string';
}

export const payloadAdapter: CmsSourceAdapter = {
    type: CmsSourceType.PAYLOAD,

    async testConnection(creds) {
        if (!isPayloadCreds(creds)) {
            return { ok: false, reason: 'Missing baseUrl or apiKey' };
        }
        try {
            const url = `${creds.baseUrl.replace(/\/$/, '')}/api/access`;
            const res = await fetchWithTimeout(url, {
                headers: { Authorization: authHeader(creds) },
                timeoutMs: 8_000,
            });
            if (res.status === 401 || res.status === 403) {
                return { ok: false, reason: 'API key was rejected' };
            }
            if (!res.ok) {
                return { ok: false, reason: `Server returned ${res.status}` };
            }
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                reason: err instanceof Error ? err.message : 'Could not reach Payload',
            };
        }
    },

    async listRemoteCollections(creds) {
        if (!isPayloadCreds(creds)) return [];
        const slugs = (creds.collectionSlugs ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (slugs.length === 0) {
            // Best effort: hit /api/access and surface keys as collections.
            // Permissions vary, so we tolerate failure and return empty.
            try {
                const res = await fetchWithTimeout(
                    `${creds.baseUrl.replace(/\/$/, '')}/api/access`,
                    {
                        headers: { Authorization: authHeader(creds) },
                        timeoutMs: 8_000,
                    },
                );
                if (!res.ok) return [];
                const data = (await res.json()) as { collections?: Record<string, unknown> };
                const discovered = Object.keys(data.collections ?? {});
                return Promise.all(discovered.map((slug) => describeCollection(creds, slug)));
            } catch {
                return [];
            }
        }
        return Promise.all(slugs.map((slug) => describeCollection(creds, slug)));
    },

    async fetchItems(creds, remoteCollectionRef) {
        if (!isPayloadCreds(creds)) return [];
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(remoteCollectionRef)}?limit=500`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: authHeader(creds) },
            timeoutMs: 15_000,
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { docs?: Array<Record<string, unknown>> };
        const docs = data.docs ?? [];
        return docs.map((doc) => {
            const id = String(doc.id ?? doc._id ?? '');
            const slugValue = doc.slug;
            const slug = typeof slugValue === 'string' ? slugValue : undefined;
            return {
                id,
                slug,
                values: doc,
            } satisfies RemoteItem;
        });
    },
};

async function describeCollection(
    creds: PayloadCredentials,
    slug: string,
): Promise<RemoteCollection> {
    // Sample one item; infer field types from values. Falls back to a
    // bare-slug collection if the sample fails.
    try {
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(slug)}?limit=1`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: authHeader(creds) },
            timeoutMs: 8_000,
        });
        if (!res.ok) {
            return { id: slug, name: slug, fields: [] };
        }
        const data = (await res.json()) as { docs?: Array<Record<string, unknown>> };
        const sample = data.docs?.[0];
        if (!sample) {
            return { id: slug, name: slug, fields: [] };
        }
        return { id: slug, name: slug, fields: inferFields(sample) };
    } catch {
        return { id: slug, name: slug, fields: [] };
    }
}

/**
 * Best-effort type inference. Payload returns rich-text as objects with a
 * `root` key, images as objects with `url`, dates as ISO strings, etc.
 */
export function inferFields(
    sample: Record<string, unknown>,
): { key: string; name: string; type: CmsFieldType }[] {
    const skip = new Set(['id', '_id', 'createdAt', 'updatedAt']);
    return Object.entries(sample)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => ({ key, name: humanize(key), type: inferType(value) }));
}

function inferType(value: unknown): CmsFieldType {
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return CmsFieldType.DATE;
        return CmsFieldType.TEXT;
    }
    if (typeof value === 'number') return CmsFieldType.NUMBER;
    if (typeof value === 'boolean') return CmsFieldType.BOOLEAN;
    if (value && typeof value === 'object') {
        const v = value as Record<string, unknown>;
        if (typeof v.url === 'string') return CmsFieldType.IMAGE;
        if ('root' in v || 'children' in v) return CmsFieldType.RICH_TEXT;
    }
    return CmsFieldType.TEXT;
}

function humanize(key: string): string {
    return key
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
}
