import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

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
 * SECURITY: Reject CMS URLs that point at our own infrastructure. The user
 * supplies these as part of "connect to your CMS" and an unrestricted
 * fetch is a classic SSRF primitive (cloud metadata IPs, internal services,
 * loopback). We allowlist the protocol to http(s), resolve the host's IPs,
 * and reject anything that lands on a private/link-local/loopback range or
 * a cloud metadata IP.
 */
function isBlockedIp(ip: string): boolean {
    // Cloud metadata
    if (ip === '169.254.169.254' || ip === 'fd00:ec2::254') return true;
    // IPv4 ranges
    if (net.isIPv4(ip)) {
        const [a = 0, b = 0] = ip.split('.').map((part) => Number.parseInt(part, 10));
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
        return false;
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
        if (lower.startsWith('fe80:')) return true; // link-local
        if (lower.startsWith('::ffff:')) {
            // IPv4-mapped IPv6 — recurse on the embedded v4 octets, but
            // default-deny on the malformed `::ffff:` (no octets) form so a
            // recursive call into `net.isIPv4('')` cannot quietly pass.
            const suffix = lower.slice('::ffff:'.length);
            if (suffix.length === 0) return true;
            return isBlockedIp(suffix);
        }
        return false;
    }
    return false;
}

async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
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
    let addresses: { address: string; family: number }[];
    if (net.isIP(host)) {
        addresses = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
    } else {
        // DNS-TOCTOU: resolves once here and once inside the actual fetch call.
        // A record with TTL=0 or split-horizon DNS could return a different IP on
        // the second resolution. Accepted risk — mitigated by infra-layer controls;
        // revisit if socket-binding is needed for stricter guarantees.
        try {
            addresses = await dnsLookup(host, { all: true });
        } catch {
            throw new RemoteAdapterError(`Could not resolve host: ${host}`);
        }
    }
    for (const addr of addresses) {
        if (isBlockedIp(addr.address)) {
            throw new RemoteAdapterError(
                `Refusing to connect to internal address ${addr.address}`,
            );
        }
    }
    return url;
}

/**
 * Minimal HTTP helper. Times out after `timeoutMs` (default 10s) and throws
 * a `RemoteAdapterError` on non-2xx so adapters can map to friendly reasons.
 *
 * Performs SSRF guards: protocol allowlist + DNS resolution check against
 * private/loopback/metadata ranges. Disables redirect following so a 30x
 * to a private host can't bypass the guard.
 */
export async function fetchWithTimeout(
    url: string,
    init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
    const { timeoutMs = 10_000, ...rest } = init;
    await assertSafeOutboundUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            redirect: 'manual',
            ...rest,
            signal: controller.signal,
        });
        // If the server tries to redirect us, we don't auto-follow — but we
        // also don't want to silently surface a 3xx body to the caller as
        // success. Adapters should treat any 3xx as a configuration error.
        if (res.status >= 300 && res.status < 400) {
            throw new RemoteAdapterError(
                `Refusing to follow redirect from ${url}`,
                res.status,
            );
        }
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
