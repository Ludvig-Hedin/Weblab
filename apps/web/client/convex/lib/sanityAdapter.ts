'use node';

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent } from 'undici';
import {
    SANITY_PILOT_PROFILE, SANITY_DOCUMENT_BYTES, documentId, draftChanges,
    newPost, object, remoteDocument, revision,
    type SanityDocument, type SanityPilotType,
} from './sanityPilotContract';

export type SanityCredentials = {
    projectId: string;
    dataset: string;
    token: string;
    profile: typeof SANITY_PILOT_PROFILE;
};
export class SanityError extends Error {
    constructor(public readonly code: 'BAD_REQUEST' | 'CONFLICT' | 'FORBIDDEN' | 'REMOTE_FAILED' | 'UNKNOWN', message: string) {
        super(`${code}: ${message}`);
        this.name = 'SanityError';
    }
}
export function sanityCredentials(value: unknown): SanityCredentials {
    const input = object(value);
    if (typeof input.projectId !== 'string' || !/^[a-z0-9]{1,32}$/.test(input.projectId) ||
        typeof input.dataset !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.dataset) ||
        typeof input.token !== 'string' || !input.token || input.token.length > 4096 || /\s/.test(input.token) ||
        input.profile !== SANITY_PILOT_PROFILE) {
        throw new SanityError('BAD_REQUEST', 'Use a valid Sanity project, dataset, server token and supported pilot profile.');
    }
    return input as SanityCredentials;
}

export function isPublicAddress(address: string): boolean {
    if (net.isIPv4(address)) {
        const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
            (a === 192 && b === 0) || (a === 192 && b === 2) ||
            (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
            (a === 203 && b === 0 && c === 113));
    }
    // Only ordinary global unicast. Refuse mapped IPv4, transition and documentation ranges.
    if (!net.isIPv6(address) || !/^[23]/i.test(address)) return false;
    const blocked = new net.BlockList();
    blocked.addSubnet('2001:db8::', 32, 'ipv6');
    blocked.addSubnet('2001::', 32, 'ipv6');
    blocked.addSubnet('2001:10::', 28, 'ipv6');
    blocked.addSubnet('2001:20::', 28, 'ipv6');
    blocked.addSubnet('2002::', 16, 'ipv6');
    return !blocked.check(address, 'ipv6');
}

type Request = { method: 'GET' | 'POST'; body?: string };
export type SanityTransport = (url: URL, request: Request, credentials: SanityCredentials, beforeSend?: () => Promise<void>) => Promise<unknown>;

async function requestJSON(url: URL, request: Request, credentials: SanityCredentials, beforeSend?: () => Promise<void>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let dispatcher: Agent | undefined;
    try {
        const addresses = await Promise.race([
            lookup(url.hostname, { all: true }),
            new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })),
        ]);
        if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
            throw new SanityError('REMOTE_FAILED', 'Sanity resolved to an unsupported network address.');
        }
        const pinnedLookup: LookupFunction = (_host, options, callback) => {
            const family = typeof options === 'number' ? options : options.family;
            const selected = (family ? addresses.find((entry) => entry.family === family) : addresses[0]);
            if (!selected) { callback(new Error('Unsupported address family'), '', 0); return; }
            callback(null, selected.address, selected.family);
        };
        // Node's automatic family selection asks lookup for an address array.
        // Our pinned single-address callback deliberately disables that mode.
        dispatcher = new Agent({ autoSelectFamily: false, connect: { lookup: pinnedLookup } });
        // DNS validation must not leave a stale authorization decision between
        // preflight and the actual credential-bearing provider request.
        await beforeSend?.();
        const response = await fetch(url, {
            method: request.method, ...(request.body !== undefined ? { body: request.body } : {}),
            headers: { Authorization: `Bearer ${credentials.token}`, Accept: 'application/json', ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
            redirect: 'manual', signal: controller.signal, ...({ dispatcher } as { dispatcher: Agent }),
        });
        if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 409) throw new SanityError('CONFLICT', 'Sanity changed this document. Reload before saving.');
            if (response.status === 401 || response.status === 403) throw new SanityError('FORBIDDEN', 'Sanity refused this operation. Check the server token permissions.');
            // A write could have committed despite a server/redirect/network error.
            const rejectedRequest = [400, 404, 405, 413, 422, 429].includes(response.status);
            throw new SanityError(request.method === 'POST' && !rejectedRequest ? 'UNKNOWN' : 'REMOTE_FAILED', 'Sanity did not confirm this operation.');
        }
        if (!response.body) throw new SanityError('UNKNOWN', 'Sanity returned an empty response.');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > 768 * 1024) {
                await reader.cancel();
                throw new SanityError('UNKNOWN', 'Sanity response exceeds the supported size.');
            }
            chunks.push(next.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { throw new SanityError('UNKNOWN', 'Sanity returned an invalid response.'); }
    } catch (error) {
        if (error instanceof SanityError) throw error;
        // Never echo provider bodies, URLs or credentials to a client/log.
        throw new SanityError(request.method === 'POST' ? 'UNKNOWN' : 'REMOTE_FAILED', 'Sanity could not confirm this operation.');
    } finally {
        clearTimeout(timer);
        await dispatcher?.destroy().catch(() => undefined);
    }
}

export function comparable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(comparable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${comparable(entry)}`).join(',')}}`;
    return JSON.stringify(value) ?? 'null';
}
export function documentContent(doc: Record<string, unknown>): Record<string, unknown> {
    const { _rev: _revision, _createdAt: _created, _updatedAt: _updated, ...rest } = doc;
    return rest;
}

export class SanityPilotAdapter {
    readonly credentials: SanityCredentials;
    constructor(credentials: unknown, private readonly transport: SanityTransport = requestJSON, private readonly assertAccess: () => Promise<void> = async () => {}) {
        this.credentials = sanityCredentials(credentials);
    }
    private async request(path: string, request: Request, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
        const url = new URL(`https://${this.credentials.projectId}.api.sanity.io/v2025-02-19/${path}`);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        await this.assertAccess();
        let response: unknown;
        try { response = await this.transport(url, request, this.credentials, this.assertAccess); }
        catch (error) {
            if (error instanceof SanityError) throw error;
            throw new SanityError('UNKNOWN', 'Sanity returned an invalid response.');
        }
        await this.assertAccess();
        try { return object(response); }
        catch { throw new SanityError('UNKNOWN', 'Sanity returned an invalid response.'); }
    }
    async get(id: string): Promise<SanityDocument | null> {
        const base = id.startsWith('drafts.') ? id.slice(7) : id;
        documentId(base);
        const response = await this.request(`data/doc/${this.credentials.dataset}/${encodeURIComponent(id)}`, { method: 'GET' });
        if (!Array.isArray(response.documents) || response.documents.length > 1) throw new SanityError('UNKNOWN', 'Sanity returned an invalid document response.');
        return response.documents.length ? remoteDocument(response.documents[0], id) : null;
    }
    async list(type: SanityPilotType): Promise<SanityDocument[]> {
        if (type !== 'pilotHome' && type !== 'pilotPost') throw new SanityError('BAD_REQUEST', 'Unsupported document type.');
        const response = await this.request(`data/query/${this.credentials.dataset}`, { method: 'GET' }, {
            query: '*[_type == $type && !(_id in path("versions.**"))] | order(_id)[0...101]',
            '$type': JSON.stringify(type), perspective: 'raw',
        });
        if (!Array.isArray(response.result) || response.result.length > 100) throw new SanityError('REMOTE_FAILED', 'This profile supports at most 100 raw documents per type.');
        return response.result.map((doc) => {
            const parsed = remoteDocument(doc);
            if (parsed._type !== type) throw new SanityError('UNKNOWN', 'Unexpected document type.');
            if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > SANITY_DOCUMENT_BYTES) throw new SanityError('REMOTE_FAILED', 'A document is too large.');
            return parsed;
        });
    }
    private async mutate(mutations: unknown[], transactionId: string, id: string, expected: Record<string, unknown> | null): Promise<SanityDocument | null> {
        revision(transactionId);
        const response = await this.request(`data/mutate/${this.credentials.dataset}`, { method: 'POST', body: JSON.stringify({ mutations, transactionId }) }, {
            visibility: 'sync', returnDocuments: 'true', returnIds: 'true',
        });
        if (response.transactionId !== transactionId || !Array.isArray(response.results)) throw new SanityError('UNKNOWN', 'Sanity did not confirm the requested transaction.');
        const results = response.results.map(object);
        if (expected === null) {
            if (!results.some((result) => result.operation === 'delete' && (result.id === id || result.documentId === id))) throw new SanityError('UNKNOWN', 'Sanity did not confirm draft deletion.');
            return null;
        }
        const result = results.find((entry) => entry.document !== undefined);
        if (!result) throw new SanityError('UNKNOWN', 'Sanity did not return the saved document.');
        const saved = remoteDocument(result.document, id);
        if (comparable(documentContent(saved)) !== comparable(documentContent(expected))) throw new SanityError('UNKNOWN', 'Sanity returned different content from the saved draft.');
        return saved;
    }
    async create(id: string, values: Record<string, unknown>, transactionId: string): Promise<SanityDocument> {
        const expected = newPost(id, values);
        return (await this.mutate([{ create: expected }], transactionId, `drafts.${id}`, expected))!;
    }
    async update(current: SanityDocument, expectedRevision: string, changes: Record<string, unknown>, transactionId: string): Promise<SanityDocument> {
        remoteDocument(current);
        if (current._rev !== revision(expectedRevision)) throw new SanityError('CONFLICT', 'Sanity changed this document. Reload before saving.');
        const patch = draftChanges(current, changes);
        const baseId = current._id.startsWith('drafts.') ? current._id.slice(7) : current._id;
        const id = `drafts.${baseId}`;
        if (current._id.startsWith('drafts.')) {
            return (await this.mutate([{ patch: { id, ifRevisionID: expectedRevision, set: patch.set, ...(patch.unset.length ? { unset: patch.unset } : {}) } }], transactionId, id, patch.expected))!;
        }
        // Official Sanity client createVersion(baseId, ifBaseRevisionId) produces
        // a draft when no releaseId is supplied. Both actions execute atomically.
        // Never fall back to unguarded createOrReplace or a local shadow edit.
        revision(transactionId);
        const response = await this.request(`data/actions/${this.credentials.dataset}`, { method: 'POST', body: JSON.stringify({ transactionId, actions: [
            { actionType: 'sanity.action.document.version.create', publishedId: baseId, baseId, versionId: id, ifBaseRevisionId: expectedRevision },
            { actionType: 'sanity.action.document.edit', publishedId: baseId, draftId: id, patch: { set: patch.set, ...(patch.unset.length ? { unset: patch.unset } : {}) } },
        ] }) });
        if (response.transactionId !== transactionId) throw new SanityError('UNKNOWN', 'Sanity did not confirm draft creation.');
        const saved = await this.get(id);
        if (!saved || comparable(documentContent(saved)) !== comparable(documentContent({ ...patch.expected, _id: id }))) {
            throw new SanityError('UNKNOWN', 'The created draft changed before it could be confirmed. Reload the source.');
        }
        return saved;
    }
    async remove(current: SanityDocument, expectedRevision: string, transactionId: string): Promise<null> {
        remoteDocument(current);
        if (!current._id.startsWith('drafts.') || current._type === 'pilotHome') throw new SanityError('BAD_REQUEST', 'Only post drafts can be deleted. Published documents remain untouched.');
        if (current._rev !== revision(expectedRevision)) throw new SanityError('CONFLICT', 'Sanity changed this document. Reload before deleting.');
        if (typeof current.title !== 'string') throw new SanityError('BAD_REQUEST', 'This draft cannot be safely guarded for deletion.');
        await this.mutate([
            { patch: { id: current._id, ifRevisionID: expectedRevision, set: { title: current.title } } },
            { delete: { id: current._id } },
        ], transactionId, current._id, null);
        return null;
    }
}
