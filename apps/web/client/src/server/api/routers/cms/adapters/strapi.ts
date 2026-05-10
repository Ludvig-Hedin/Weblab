import { CmsFieldType, CmsSourceType } from '@weblab/models';

import type { CmsSourceAdapter, RemoteCollection, RemoteItem } from './index';
import { fetchWithTimeout } from './index';
import { inferFields } from './payload';

/**
 * Strapi v4/v5 adapter. Read-only.
 *
 * Auth: `Authorization: Bearer <token>` — admin or API token. Schema
 * discovery via `/api/content-type-builder/content-types` requires admin
 * privileges, so this v3 implementation falls back to a user-supplied list
 * of content type plural names.
 *
 * Strapi v4 returns items as `{ data: [{ id, attributes: {...} }], meta }`.
 * v5 flattens `attributes` into the top level. We support both.
 */
interface StrapiCredentials {
    baseUrl: string;
    apiToken: string;
    /** Comma-separated plural API names, e.g. "blog-posts,authors". */
    contentTypes?: string;
}

function authHeader(creds: StrapiCredentials): string {
    return `Bearer ${creds.apiToken}`;
}

function isStrapiCreds(value: unknown): value is StrapiCredentials {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.baseUrl === 'string' && typeof v.apiToken === 'string';
}

export const strapiAdapter: CmsSourceAdapter = {
    type: CmsSourceType.STRAPI,

    async testConnection(creds) {
        if (!isStrapiCreds(creds)) {
            return { ok: false, reason: 'Missing baseUrl or apiToken' };
        }
        try {
            // `/api/users/me` works for admin tokens; fallback hits a content
            // type if provided.
            const url = `${creds.baseUrl.replace(/\/$/, '')}/api/users/me`;
            const res = await fetchWithTimeout(url, {
                headers: { Authorization: authHeader(creds) },
                timeoutMs: 8_000,
            });
            if (res.status === 401 || res.status === 403) {
                return { ok: false, reason: 'API token was rejected' };
            }
            // Strapi may return 404 here for tokens without /users/me access;
            // treat any non-5xx as "reachable".
            if (res.status >= 500) {
                return { ok: false, reason: `Server returned ${res.status}` };
            }
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                reason: err instanceof Error ? err.message : 'Could not reach Strapi',
            };
        }
    },

    async listRemoteCollections(creds) {
        if (!isStrapiCreds(creds)) return [];
        const types = (creds.contentTypes ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (types.length === 0) {
            // Try the admin content-type-builder endpoint. Best-effort.
            try {
                const url = `${creds.baseUrl.replace(/\/$/, '')}/api/content-type-builder/content-types`;
                const res = await fetchWithTimeout(url, {
                    headers: { Authorization: authHeader(creds) },
                    timeoutMs: 8_000,
                });
                if (!res.ok) return [];
                const data = (await res.json()) as {
                    data?: Array<{ uid: string; schema?: { pluralName?: string } }>;
                };
                const discovered = (data.data ?? [])
                    .filter((entry) => entry.uid.startsWith('api::'))
                    .map((entry) => entry.schema?.pluralName)
                    .filter((s): s is string => !!s);
                return Promise.all(discovered.map((name) => describeContentType(creds, name)));
            } catch {
                return [];
            }
        }
        return Promise.all(types.map((name) => describeContentType(creds, name)));
    },

    async fetchItems(creds, remoteCollectionRef) {
        if (!isStrapiCreds(creds)) return [];
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(remoteCollectionRef)}?pagination[pageSize]=500`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: authHeader(creds) },
            timeoutMs: 15_000,
        });
        if (!res.ok) return [];
        const data = (await res.json()) as {
            data?: Array<
                { id: number | string; attributes?: Record<string, unknown> } & Record<
                    string,
                    unknown
                >
            >;
        };
        return (data.data ?? []).map((entry): RemoteItem => {
            // v4 has `attributes`; v5 flattens. Strip system fields (id,
            // createdAt, updatedAt, publishedAt) from v5 values so they
            // don't duplicate what's already in RemoteItem.id.
            const STRAPI_SYSTEM_FIELDS = new Set([
                'id',
                'createdAt',
                'updatedAt',
                'publishedAt',
                'documentId',
            ]);
            const values = entry.attributes
                ? entry.attributes
                : Object.fromEntries(
                      Object.entries(entry).filter(([k]) => !STRAPI_SYSTEM_FIELDS.has(k)),
                  );
            const slugValue = values.slug;
            const slug = typeof slugValue === 'string' ? slugValue : undefined;
            return {
                id: String(entry.id),
                slug,
                values,
            };
        });
    },
};

async function describeContentType(
    creds: StrapiCredentials,
    pluralName: string,
): Promise<RemoteCollection> {
    try {
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(pluralName)}?pagination[pageSize]=1`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: authHeader(creds) },
            timeoutMs: 8_000,
        });
        if (!res.ok) {
            return { id: pluralName, name: pluralName, fields: [] };
        }
        const data = (await res.json()) as {
            data?: Array<{ attributes?: Record<string, unknown> } & Record<string, unknown>>;
        };
        const sample = data.data?.[0];
        if (!sample) {
            return { id: pluralName, name: pluralName, fields: [] };
        }
        const values = sample.attributes ? sample.attributes : (sample as Record<string, unknown>);
        return {
            id: pluralName,
            name: pluralName,
            fields: inferFields(values).filter((f) => f.type !== CmsFieldType.REFERENCE),
        };
    } catch {
        return { id: pluralName, name: pluralName, fields: [] };
    }
}
