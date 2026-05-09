import { CmsSourceType } from '@weblab/models';

import type { CmsSourceAdapter, RemoteCollection, RemoteItem } from './index';
import { fetchWithTimeout } from './index';
import { inferFields } from './payload';

/**
 * Generic REST adapter. Minimal v3 implementation:
 *
 * - Credentials carry a base URL, an optional API key, and a list of
 *   "endpoints" — each is a name + path that maps to a remote collection.
 * - `fetchItems` GETs `{baseUrl}{path}` and expects either a top-level
 *   array or `{ items: [...] }` / `{ data: [...] }`.
 * - Auth is via `Authorization: Bearer <key>` if `apiKey` is present.
 *
 * Anything fancier (JSONPath, custom auth headers, pagination, filtering)
 * is intentionally deferred. v3.x can extend.
 */
interface RestEndpoint {
    name: string;
    path: string;
}

interface RestCredentials {
    baseUrl: string;
    apiKey?: string;
    /** JSON-stringified array of {name, path}. Stored as a string so the
     *  credential blob stays a flat object. */
    endpointsJson?: string;
}

function authHeaders(creds: RestCredentials): Record<string, string> {
    return creds.apiKey ? { Authorization: `Bearer ${creds.apiKey}` } : {};
}

function isRestCreds(value: unknown): value is RestCredentials {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.baseUrl === 'string';
}

function parseEndpoints(creds: RestCredentials): RestEndpoint[] {
    if (!creds.endpointsJson) return [];
    try {
        const parsed: unknown = JSON.parse(creds.endpointsJson);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (entry): entry is RestEndpoint =>
                    !!entry &&
                    typeof entry === 'object' &&
                    typeof (entry as RestEndpoint).name === 'string' &&
                    typeof (entry as RestEndpoint).path === 'string',
            )
            .map((entry) => ({ name: entry.name, path: entry.path }));
    } catch {
        return [];
    }
}

function endpointPath(creds: RestCredentials, ref: string): string | null {
    const endpoint = parseEndpoints(creds).find((e) => e.path === ref || e.name === ref);
    return endpoint?.path ?? null;
}

export const restAdapter: CmsSourceAdapter = {
    type: CmsSourceType.REST,

    async testConnection(creds) {
        if (!isRestCreds(creds)) {
            return { ok: false, reason: 'Missing baseUrl' };
        }
        // Validate the endpoints JSON early so the user sees a clear error
        // instead of a silently-empty mapping list later (BUG #27 from review).
        if (creds.endpointsJson?.trim()) {
            try {
                const parsed: unknown = JSON.parse(creds.endpointsJson);
                if (!Array.isArray(parsed)) {
                    return {
                        ok: false,
                        reason: 'Endpoints must be a JSON array of {name, path}',
                    };
                }
            } catch {
                return {
                    ok: false,
                    reason: 'Endpoints field is not valid JSON',
                };
            }
        }
        try {
            const res = await fetchWithTimeout(creds.baseUrl, {
                headers: authHeaders(creds),
                timeoutMs: 8_000,
            });
            if (res.status === 401 || res.status === 403) {
                return { ok: false, reason: 'API key was rejected' };
            }
            // Generic REST APIs vary wildly — anything not 5xx counts as
            // "reachable".
            if (res.status >= 500) {
                return { ok: false, reason: `Server returned ${res.status}` };
            }
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                reason: err instanceof Error ? err.message : 'Could not reach API',
            };
        }
    },

    async listRemoteCollections(creds) {
        if (!isRestCreds(creds)) return [];
        const endpoints = parseEndpoints(creds);
        return Promise.all(
            endpoints.map(async (endpoint): Promise<RemoteCollection> => {
                try {
                    const url = `${creds.baseUrl.replace(/\/$/, '')}${endpoint.path}`;
                    const res = await fetchWithTimeout(url, {
                        headers: authHeaders(creds),
                        timeoutMs: 8_000,
                    });
                    if (!res.ok) {
                        return { id: endpoint.path, name: endpoint.name, fields: [] };
                    }
                    const items = await readItems(res);
                    const sample = items[0];
                    return {
                        id: endpoint.path,
                        name: endpoint.name,
                        fields: sample ? inferFields(sample) : [],
                    };
                } catch {
                    return { id: endpoint.path, name: endpoint.name, fields: [] };
                }
            }),
        );
    },

    async fetchItems(creds, remoteCollectionRef) {
        if (!isRestCreds(creds)) return [];
        const path = endpointPath(creds, remoteCollectionRef);
        if (!path) return [];
        try {
            const url = `${creds.baseUrl.replace(/\/$/, '')}${path}`;
            const res = await fetchWithTimeout(url, {
                headers: authHeaders(creds),
                timeoutMs: 15_000,
            });
            if (!res.ok) return [];
            const items = await readItems(res);
            return items.map((entry, idx): RemoteItem => {
                const id =
                    typeof entry.id === 'string' || typeof entry.id === 'number'
                        ? String(entry.id)
                        : `${path}-${idx}`;
                const slugValue = entry.slug;
                const slug = typeof slugValue === 'string' ? slugValue : undefined;
                return { id, slug, values: entry };
            });
        } catch {
            return [];
        }
    },
};

async function readItems(res: Response): Promise<Array<Record<string, unknown>>> {
    const data = (await res.json()) as unknown;
    if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
    if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.items)) return obj.items as Array<Record<string, unknown>>;
        if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>;
        if (Array.isArray(obj.results)) return obj.results as Array<Record<string, unknown>>;
    }
    return [];
}
