'use node';

import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
// Use the installed implementation, including in Bun where the compatibility
// alias/global fetch does not provide Undici's pinned dispatcher contract.
import { Agent, fetch as undiciFetch } from 'undici/index.js';
import { isPublicAddress } from './sanityAdapter';
import { SANITY_BLOG_MAX_BYTES, blogSummary, parseBlogDocument, sanitizeSanityCoordinates, type BlogSummary } from './sanityBlogContract';

type Coordinates = { projectId: string; dataset: string };
type Address = { address: string; family: number };
class BlogReadError extends Error {}
export type SanityBlogFetch = (url: URL, options: RequestInit & { method: 'GET'; dispatcher: Agent }) => Promise<Response>;
export type SanityBlogReaderDependencies = {
    fetch?: SanityBlogFetch;
    resolveHost?: (hostname: string) => Promise<Address[]>;
};
function failed(message = 'Sanity blog content could not be read.'): never {
    throw new BlogReadError(`REMOTE_FAILED: ${message}`);
}
function publishedId(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value) || /^(drafts|versions)\./.test(value)) throw new Error('BAD_REQUEST: Expected a published blog document identity.');
    return value;
}
function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) failed('Sanity returned an invalid blog response.');
    return value as Record<string, unknown>;
}
function remoteBlog(value: unknown, expectedId?: string): string {
    try {
        const doc = record(value);
        if (typeof doc._rev !== 'string' || !doc._rev || (expectedId !== undefined && doc._id !== expectedId)) failed();
        const json = JSON.stringify(doc);
        parseBlogDocument(json);
        return json;
    } catch { failed('Sanity returned an invalid published blog document.'); }
}
function beforeAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new Error('timeout'));
    return new Promise<T>((resolve, reject) => {
        const abort = () => reject(new Error('timeout'));
        signal.addEventListener('abort', abort, { once: true });
        pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}

/** Public, GET-only access to the explicit customer blog schema. No tokens or writes. */
export class SanityBlogReader {
    readonly coordinates: Readonly<Coordinates>;
    private readonly fetchResponse: SanityBlogFetch;
    private readonly resolveHost: (hostname: string) => Promise<Address[]>;
    constructor(coordinates: Coordinates, dependencies: SanityBlogReaderDependencies = {}) {
        this.coordinates = Object.freeze(sanitizeSanityCoordinates(coordinates.projectId, coordinates.dataset));
        this.fetchResponse = dependencies.fetch ?? (async (url, options) => await undiciFetch(url, options) as unknown as Response);
        this.resolveHost = dependencies.resolveHost ?? ((hostname) => lookup(hostname, { all: true }));
    }
    private async request(path: string, parameters: Record<string, string> = {}, maxBytes = SANITY_BLOG_MAX_BYTES + 16 * 1024): Promise<Record<string, unknown>> {
        const url = new URL(`https://${this.coordinates.projectId}.api.sanity.io/v2025-02-19/data/${path}/${this.coordinates.dataset}`);
        for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        let dispatcher: Agent | undefined;
        try {
            const addresses = await beforeAbort(this.resolveHost(url.hostname), controller.signal);
            if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address) || (entry.family !== 4 && entry.family !== 6))) failed('Sanity resolved to an unsupported network address.');
            const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
                const family = typeof options === 'number' ? options : options.family;
                const selected = family ? addresses.find((entry) => entry.family === family) : addresses[0];
                if (!selected) { callback(new Error('Unsupported address family'), '', 0); return; }
                callback(null, selected.address, selected.family);
            };
            // Undici6 drops a false top-level autoSelectFamily option. Keep it
            // on the socket options so lookup never switches to array mode.
            dispatcher = new Agent({ connect: { autoSelectFamily: false, lookup: pinnedLookup } });
            const response = await beforeAbort(this.fetchResponse(url, {
                method: 'GET', headers: { Accept: 'application/json' }, redirect: 'manual', signal: controller.signal, dispatcher,
            }), controller.signal);
            if (!response.ok || response.redirected) {
                if (response.body) await beforeAbort(response.body.cancel(), controller.signal);
                failed('Sanity did not return public blog content.');
            }
            const declaredLength = response.headers.get('content-length');
            if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
                if (response.body) await beforeAbort(response.body.cancel(), controller.signal);
                failed('Sanity blog response is too large.');
            }
            if (!response.body) failed('Sanity returned an empty blog response.');
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                while (true) {
                    const next = await beforeAbort(reader.read(), controller.signal);
                    if (next.done) break;
                    size += next.value.byteLength;
                    if (size > maxBytes) failed('Sanity blog response is too large.');
                    chunks.push(next.value);
                }
            } catch (error) {
                void reader.cancel().catch(() => {});
                throw error;
            } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
        } catch (error) {
            if (error instanceof BlogReadError) throw error;
            failed();
        } finally {
            clearTimeout(timer);
            if (dispatcher) {
                try { await dispatcher.destroy(); }
                catch { failed('Sanity connection could not be closed safely.'); }
            }
        }
    }
    async list(cursor?: string): Promise<{ items: BlogSummary[]; cursor: string | null }> {
        const after = cursor === undefined ? '' : publishedId(cursor);
        const response = await this.request('query', {
            query: '*[_type == "blogPost" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && _id > $after] | order(_id asc)[0...20]{_id,_type,_rev,title,slug,excerpt,publishedAt}',
            '$after': JSON.stringify(after), perspective: 'published',
        }, 512 * 1024);
        if (!Array.isArray(response.result) || response.result.length > 20) failed('Sanity returned an invalid blog page.');
        let previousId = after;
        const items = response.result.map((value) => {
            const summary = blogSummary(remoteBlog(value));
            if (summary.documentId <= previousId) failed('Sanity returned an invalid blog page order.');
            previousId = summary.documentId;
            return summary;
        });
        return { items, cursor: items.length === 20 ? previousId : null };
    }
    async get(documentId: string): Promise<string> {
        const id = publishedId(documentId);
        const response = await this.request('query', {
            query: '*[_type == "blogPost" && _id == $id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]',
            '$id': JSON.stringify(id), perspective: 'published',
        });
        if (response.result === null) throw new Error('NOT_FOUND: Published blog document was not found.');
        return remoteBlog(response.result, id);
    }
}
