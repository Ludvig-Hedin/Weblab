/**
 * In-memory cache for AI-generated images. Keeps the heavy base64 payload
 * out of the AI SDK message thread (which would otherwise be re-sent to the
 * LLM on every step) by giving each generated image a server-side id. The
 * tool output carries only the id + a relative URL the UI fetches from.
 *
 * Stored on globalThis to survive Next.js dev hot-reload module re-imports
 * and to share state between the chat route (writer) and the chat-images
 * route handler (reader).
 *
 * Per-user isolation: each entry records the owning userId. `getImage`
 * returns null when the requesting userId does not match — even if the id
 * is valid — so the route handler must authenticate and pass the user id.
 *
 * Single-instance assumption: TTL is short (30 min) and entries are
 * write-once / read-a-few-times, so multi-instance autoscaling will only
 * cause an occasional miss the user can retry. If horizontal scaling lands,
 * swap the Map for Vercel Blob / Supabase storage.
 */

interface CacheEntry {
    b64: string;
    mimeType: string;
    userId: string;
    expiresAt: number;
}

declare global {
    var __weblabImageCache: Map<string, CacheEntry> | undefined;
}

const TTL_MS = 30 * 60 * 1000;
// Per-user cap (instead of a global cap). A noisy user generating many images
// in rapid succession can no longer evict another user's freshly-cached
// images. Map insertion order is preserved, so the first key encountered for
// a given user is also that user's oldest live entry.
const MAX_ENTRIES_PER_USER = 50;

const cache: Map<string, CacheEntry> = (() => {
    if (globalThis.__weblabImageCache) return globalThis.__weblabImageCache;
    const fresh = new Map<string, CacheEntry>();
    globalThis.__weblabImageCache = fresh;
    return fresh;
})();

function evictExpired() {
    const now = Date.now();
    for (const [id, entry] of cache) {
        if (entry.expiresAt < now) cache.delete(id);
    }
}

function evictForUser(userId: string) {
    const userEntryIds: string[] = [];
    for (const [id, entry] of cache) {
        if (entry.userId === userId) userEntryIds.push(id);
    }
    const toDelete = userEntryIds.length - MAX_ENTRIES_PER_USER;
    for (let i = 0; i < toDelete; i++) {
        cache.delete(userEntryIds[i]!);
    }
}

export function putImage(b64: string, mimeType: string, userId: string): string {
    if (!userId) {
        throw new Error('putImage requires a non-empty userId for ownership tracking.');
    }
    evictExpired();
    const stripped = b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const id = cryptoRandomId();
    cache.set(id, {
        b64: stripped,
        mimeType,
        userId,
        expiresAt: Date.now() + TTL_MS,
    });
    evictForUser(userId);
    return id;
}

/**
 * Return the cached image only if it exists, hasn't expired, and the
 * provided userId matches the entry's owner. Returns null in any other
 * case so the caller cannot distinguish "not found" from "not yours" —
 * the route handler should always 404 on null.
 */
export function getImage(id: string, userId: string): { b64: string; mimeType: string } | null {
    if (!id || !userId) return null;
    evictExpired();
    const entry = cache.get(id);
    if (!entry) return null;
    if (entry.userId !== userId) return null;
    return { b64: entry.b64, mimeType: entry.mimeType };
}

export function deleteImage(id: string): boolean {
    return cache.delete(id);
}

function cryptoRandomId(): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (!c?.randomUUID) {
        throw new Error(
            'crypto.randomUUID() is required for image cache ids (Node 19+ / modern browser).',
        );
    }
    return c.randomUUID();
}
