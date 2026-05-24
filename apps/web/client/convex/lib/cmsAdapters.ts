'use node';

import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent } from 'undici';

import { CmsFieldType, CmsSourceType } from '@weblab/models';

// Port of apps/web/client/src/server/api/routers/cms/adapters/*.
// Ships as a single file because every adapter shares the same SSRF guard,
// `fetchWithTimeout`, and `inferFields` helpers — splitting would mean
// re-importing across "use node" files for no real win.

// ─── Adapter contract ────────────────────────────────────────────────────────

export interface CmsSourceAdapter {
    type: CmsSourceType;
    testConnection(creds: unknown): Promise<{ ok: true } | { ok: false; reason: string }>;
    listRemoteCollections(creds: unknown): Promise<RemoteCollection[]>;
    fetchItems(creds: unknown, remoteCollectionRef: string): Promise<RemoteItem[]>;
}

export interface RemoteCollection {
    id: string;
    name: string;
    fields: { key: string; name: string; type: CmsFieldType }[];
}

export interface RemoteItem {
    id: string;
    slug?: string;
    values: Record<string, unknown>;
}

export class RemoteAdapterError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = 'RemoteAdapterError';
    }
}

// ─── SSRF guard + safe fetch ─────────────────────────────────────────────────

function isBlockedIp(ip: string): boolean {
    if (ip === '169.254.169.254' || ip === 'fd00:ec2::254') return true;
    if (net.isIPv4(ip)) {
        const [a = 0, b = 0] = ip.split('.').map((part) => Number.parseInt(part, 10));
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        return false;
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (lower.startsWith('fe80:')) return true;
        if (lower.startsWith('::ffff:')) {
            const suffix = lower.slice('::ffff:'.length);
            if (suffix.length === 0) return true;
            return isBlockedIp(suffix);
        }
        return false;
    }
    return false;
}

interface ResolvedAddress {
    address: string;
    family: number;
}

async function assertSafeOutboundUrl(
    rawUrl: string,
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new RemoteAdapterError(`Invalid URL: ${rawUrl}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new RemoteAdapterError(`Unsupported protocol: ${url.protocol}`);
    }
    const host = url.hostname;
    let addresses: ResolvedAddress[];
    if (net.isIP(host)) {
        addresses = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
    } else {
        try {
            addresses = await dnsLookup(host, { all: true });
        } catch {
            throw new RemoteAdapterError(`Could not resolve host: ${host}`);
        }
    }
    for (const addr of addresses) {
        if (isBlockedIp(addr.address)) {
            throw new RemoteAdapterError(`Refusing to connect to internal address ${addr.address}`);
        }
    }
    return { url, addresses };
}

export async function fetchWithTimeout(
    url: string,
    init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
    const { timeoutMs = 10_000, ...rest } = init;
    // SECURITY: a naive `assertSafeOutboundUrl(url)` followed by `fetch(url)`
    // is vulnerable to DNS-rebinding TOCTOU — fetch performs its own,
    // independent DNS lookup, so an attacker-controlled domain can resolve
    // to a public IP for the guard then flip to 169.254.169.254 / RFC1918
    // for the actual connection. Pin the addresses we validated and force
    // undici to reuse them via a per-request dispatcher with a custom
    // `connect.lookup`.
    const { addresses } = await assertSafeOutboundUrl(url);
    const pinnedLookup: LookupFunction = (_hostname, options, cb) => {
        const requestedFamily = typeof options === 'number' ? options : options?.family;
        const match =
            (requestedFamily ? addresses.find((a) => a.family === requestedFamily) : undefined) ??
            addresses[0];
        if (!match) {
            cb(new Error('No safe address available'), '', 0);
            return;
        }
        if (isBlockedIp(match.address)) {
            cb(new Error(`Refusing to connect to internal address ${match.address}`), '', 0);
            return;
        }
        cb(null, match.address, match.family);
    };
    const dispatcher = new Agent({
        connect: { lookup: pinnedLookup },
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            redirect: 'manual',
            ...rest,
            signal: controller.signal,
            // `dispatcher` is undici-specific; Node's fetch is undici under
            // the hood and accepts it at runtime even though the WHATWG
            // type doesn't surface the property.
            ...({ dispatcher } as { dispatcher: Agent }),
        });
        if (res.status >= 300 && res.status < 400) {
            throw new RemoteAdapterError(`Refusing to follow redirect from ${url}`, res.status);
        }
        return res;
    } finally {
        clearTimeout(timer);
        await dispatcher.close().catch(() => undefined);
    }
}

// ─── Type inference shared across adapters ───────────────────────────────────

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

export function inferFields(
    sample: Record<string, unknown>,
): { key: string; name: string; type: CmsFieldType }[] {
    const skip = new Set(['id', '_id', 'createdAt', 'updatedAt']);
    return Object.entries(sample)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => ({
            key,
            name: humanize(key),
            type: inferType(value),
        }));
}

// ─── Payload adapter ─────────────────────────────────────────────────────────

interface PayloadCredentials {
    baseUrl: string;
    apiKey: string;
    usersSlug?: string;
    collectionSlugs?: string;
}

function payloadAuthHeader(creds: PayloadCredentials): string {
    const slug = creds.usersSlug?.trim() || 'users';
    return `${slug} API-Key ${creds.apiKey}`;
}

function isPayloadCreds(value: unknown): value is PayloadCredentials {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.baseUrl === 'string' && typeof v.apiKey === 'string';
}

async function describePayloadCollection(
    creds: PayloadCredentials,
    slug: string,
): Promise<RemoteCollection> {
    try {
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(slug)}?limit=1`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: payloadAuthHeader(creds) },
            timeoutMs: 8_000,
        });
        if (!res.ok) {
            return { id: slug, name: slug, fields: [] };
        }
        const data = (await res.json()) as {
            docs?: Array<Record<string, unknown>>;
        };
        const sample = data.docs?.[0];
        if (!sample) {
            return { id: slug, name: slug, fields: [] };
        }
        return { id: slug, name: slug, fields: inferFields(sample) };
    } catch {
        return { id: slug, name: slug, fields: [] };
    }
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
                headers: { Authorization: payloadAuthHeader(creds) },
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
            try {
                const res = await fetchWithTimeout(
                    `${creds.baseUrl.replace(/\/$/, '')}/api/access`,
                    {
                        headers: { Authorization: payloadAuthHeader(creds) },
                        timeoutMs: 8_000,
                    },
                );
                if (!res.ok) return [];
                const data = (await res.json()) as {
                    collections?: Record<string, unknown>;
                };
                const discovered = Object.keys(data.collections ?? {});
                return Promise.all(
                    discovered.map((slug) => describePayloadCollection(creds, slug)),
                );
            } catch {
                return [];
            }
        }
        return Promise.all(slugs.map((slug) => describePayloadCollection(creds, slug)));
    },

    async fetchItems(creds, remoteCollectionRef) {
        if (!isPayloadCreds(creds)) return [];
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(remoteCollectionRef)}?limit=500`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: payloadAuthHeader(creds) },
            timeoutMs: 15_000,
        });
        if (!res.ok) return [];
        const data = (await res.json()) as {
            docs?: Array<Record<string, unknown>>;
        };
        const docs = data.docs ?? [];
        return docs.map((doc): RemoteItem => {
            const id = String(doc.id ?? doc._id ?? '');
            const slugValue = doc.slug;
            const slug = typeof slugValue === 'string' ? slugValue : undefined;
            return { id, slug, values: doc };
        });
    },
};

// ─── Strapi adapter ──────────────────────────────────────────────────────────

interface StrapiCredentials {
    baseUrl: string;
    apiToken: string;
    contentTypes?: string;
}

function strapiAuthHeader(creds: StrapiCredentials): string {
    return `Bearer ${creds.apiToken}`;
}

function isStrapiCreds(value: unknown): value is StrapiCredentials {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.baseUrl === 'string' && typeof v.apiToken === 'string';
}

async function describeStrapiContentType(
    creds: StrapiCredentials,
    pluralName: string,
): Promise<RemoteCollection> {
    try {
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(pluralName)}?pagination[pageSize]=1`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: strapiAuthHeader(creds) },
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

export const strapiAdapter: CmsSourceAdapter = {
    type: CmsSourceType.STRAPI,

    async testConnection(creds) {
        if (!isStrapiCreds(creds)) {
            return { ok: false, reason: 'Missing baseUrl or apiToken' };
        }
        try {
            const url = `${creds.baseUrl.replace(/\/$/, '')}/api/users/me`;
            const res = await fetchWithTimeout(url, {
                headers: { Authorization: strapiAuthHeader(creds) },
                timeoutMs: 8_000,
            });
            if (res.status === 401 || res.status === 403) {
                return { ok: false, reason: 'API token was rejected' };
            }
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
            try {
                const url = `${creds.baseUrl.replace(/\/$/, '')}/api/content-type-builder/content-types`;
                const res = await fetchWithTimeout(url, {
                    headers: { Authorization: strapiAuthHeader(creds) },
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
                return Promise.all(
                    discovered.map((name) => describeStrapiContentType(creds, name)),
                );
            } catch {
                return [];
            }
        }
        return Promise.all(types.map((name) => describeStrapiContentType(creds, name)));
    },

    async fetchItems(creds, remoteCollectionRef) {
        if (!isStrapiCreds(creds)) return [];
        const url = `${creds.baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(remoteCollectionRef)}?pagination[pageSize]=500`;
        const res = await fetchWithTimeout(url, {
            headers: { Authorization: strapiAuthHeader(creds) },
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

// ─── REST adapter ────────────────────────────────────────────────────────────

interface RestEndpoint {
    name: string;
    path: string;
}

interface RestCredentials {
    baseUrl: string;
    apiKey?: string;
    endpointsJson?: string;
}

function restAuthHeaders(creds: RestCredentials): Record<string, string> {
    return creds.apiKey ? { Authorization: `Bearer ${creds.apiKey}` } : {};
}

function isRestCreds(value: unknown): value is RestCredentials {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.baseUrl === 'string';
}

function parseRestEndpoints(creds: RestCredentials): RestEndpoint[] {
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

function restEndpointPath(creds: RestCredentials, ref: string): string | null {
    const endpoint = parseRestEndpoints(creds).find((e) => e.path === ref || e.name === ref);
    return endpoint?.path ?? null;
}

async function readRestItems(res: Response): Promise<Array<Record<string, unknown>>> {
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

export const restAdapter: CmsSourceAdapter = {
    type: CmsSourceType.REST,

    async testConnection(creds) {
        if (!isRestCreds(creds)) {
            return { ok: false, reason: 'Missing baseUrl' };
        }
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
                headers: restAuthHeaders(creds),
                timeoutMs: 8_000,
            });
            if (res.status === 401 || res.status === 403) {
                return { ok: false, reason: 'API key was rejected' };
            }
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
        const endpoints = parseRestEndpoints(creds);
        return Promise.all(
            endpoints.map(async (endpoint): Promise<RemoteCollection> => {
                try {
                    const normalizedPath = endpoint.path.startsWith('/')
                        ? endpoint.path
                        : `/${endpoint.path}`;
                    const url = `${creds.baseUrl.replace(/\/$/, '')}${normalizedPath}`;
                    const res = await fetchWithTimeout(url, {
                        headers: restAuthHeaders(creds),
                        timeoutMs: 8_000,
                    });
                    if (!res.ok) {
                        return { id: endpoint.path, name: endpoint.name, fields: [] };
                    }
                    const items = await readRestItems(res);
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
        const path = restEndpointPath(creds, remoteCollectionRef);
        if (!path) return [];
        try {
            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            const url = `${creds.baseUrl.replace(/\/$/, '')}${normalizedPath}`;
            const res = await fetchWithTimeout(url, {
                headers: restAuthHeaders(creds),
                timeoutMs: 15_000,
            });
            if (!res.ok) return [];
            const items = await readRestItems(res);
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

// ─── Dispatch ────────────────────────────────────────────────────────────────

const ADAPTERS: Partial<Record<CmsSourceType, CmsSourceAdapter>> = {
    [CmsSourceType.PAYLOAD]: payloadAdapter,
    [CmsSourceType.STRAPI]: strapiAdapter,
    [CmsSourceType.REST]: restAdapter,
};

export function getAdapter(type: CmsSourceType): CmsSourceAdapter | null {
    return ADAPTERS[type] ?? null;
}
