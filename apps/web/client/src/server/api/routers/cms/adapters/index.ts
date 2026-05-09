import type { CmsFieldType, CmsSourceType } from '@weblab/models';

/**
 * Adapter contract for an external CMS data source. Each implementation
 * (Payload, Strapi, generic REST) speaks a different protocol but exposes
 * the same three operations to the rest of the system.
 *
 * Credentials are passed in as plaintext at dispatch time — encryption
 * lives at the storage boundary (`cms-credentials.ts`). Adapters never see
 * the encrypted blob.
 */
export interface CmsSourceAdapter {
    type: CmsSourceType;
    /**
     * Health-check. Returns `{ ok: true }` if the credentials authenticate
     * and the API is reachable. Reasons should be human-friendly — they're
     * surfaced directly to the user in the connect wizard.
     */
    testConnection(creds: unknown): Promise<{ ok: true } | { ok: false; reason: string }>;
    /**
     * External "content types" / "collections" the user can map onto Weblab
     * collections. `id` is the stable adapter-specific reference passed back
     * to `fetchItems`.
     */
    listRemoteCollections(creds: unknown): Promise<RemoteCollection[]>;
    /**
     * Fetch every item for the mapped collection. Sync upserts these into
     * `cms_item` keyed by `(collectionId, remoteId)`.
     */
    fetchItems(creds: unknown, remoteCollectionRef: string): Promise<RemoteItem[]>;
}

export interface RemoteCollection {
    /** Adapter-specific reference (e.g. Payload slug, Strapi UID). */
    id: string;
    /** Human label. */
    name: string;
    /** Inferred field shape. v3 uses these to seed a new Weblab collection
     *  when the user picks "Create new" during mapping. */
    fields: { key: string; name: string; type: CmsFieldType }[];
}

export interface RemoteItem {
    /** Adapter-specific item id, stored as `cms_item.remoteId`. */
    id: string;
    /** Optional slug for routing — copied to `cms_item.slug` if set. */
    slug?: string;
    /** Field values, keyed by `cms_field.key`. */
    values: Record<string, unknown>;
}

/**
 * Minimal HTTP helper. Times out after `timeoutMs` (default 10s) and throws
 * a `RemoteAdapterError` on non-2xx so adapters can map to friendly reasons.
 */
export async function fetchWithTimeout(
    url: string,
    init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
    const { timeoutMs = 10_000, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...rest, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
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
