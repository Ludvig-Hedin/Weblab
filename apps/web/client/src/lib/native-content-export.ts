import { z } from 'zod';
import type { BlogConnection, BlogDraft } from './sanity-blog-api';

export const NATIVE_CONTENT_MAX_SELECTION = 8;
export const NATIVE_CONTENT_BODY_LIMIT = 16 * 1024;
export const NATIVE_CONTENT_RESPONSE_LIMIT = 10 * 1024 * 1024;

const id = z.string().min(1).max(160);
const revision = z.number().int().positive().safe();
export const nativeContentSelectionSchema = z.object({
    draftId: id,
    expectedRevision: revision,
    providerRevision: z.string().min(1).max(256).nullable(),
    archived: z.boolean(),
}).strict();
export const nativeContentRequestSchema = z.object({
    projectId: id,
    branchId: id,
    connectionId: id,
    connectionRevision: revision,
    selections: z.array(nativeContentSelectionSchema).max(NATIVE_CONTENT_MAX_SELECTION),
}).strict().refine((value) => new Set(value.selections.map((pin) => pin.draftId)).size === value.selections.length,
    'Duplicate draft selection');

export type NativeContentRequest = z.infer<typeof nativeContentRequestSchema>;

/** Bound bytes while reading, rather than allocating an arbitrary body first. */
export async function readNativeContentRequest(request: Request): Promise<NativeContentRequest> {
    if (!request.body) throw new Error('BAD_REQUEST');
    const contentLength = request.headers.get('Content-Length');
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > NATIVE_CONTENT_BODY_LIMIT)) {
        throw new Error('BAD_REQUEST');
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            expired = true;
            reject(new Error('BAD_REQUEST'));
            void reader.cancel().catch(() => undefined);
        }, 5_000);
    });
    try {
        while (true) {
            const next = await Promise.race([reader.read(), timeout]);
            if (expired) throw new Error('BAD_REQUEST');
            if (next.done) break;
            size += next.value.byteLength;
            if (size > NATIVE_CONTENT_BODY_LIMIT) throw new Error('BAD_REQUEST');
            chunks.push(next.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return nativeContentRequestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    } finally {
        clearTimeout(timer);
        void reader.cancel().catch(() => undefined);
    }
}

export interface NativeContentExport {
    version: 1;
    userId: string;
    connection: BlogConnection;
    drafts: BlogDraft[];
}
interface NativeContentAuth {
    userId: string;
    getToken(options: { template: 'convex' }): Promise<string | null>;
}

/** The real HTTP boundary is injectable so its token isolation can be checked. */
export function createNativeContentExportHandler({ authenticate, exportContent }: {
    authenticate(request: Request): Promise<NativeContentAuth | null>;
    exportContent(body: NativeContentRequest, token: string): Promise<NativeContentExport>;
}) {
    return async function POST(request: Request): Promise<Response> {
        const headers = { 'Cache-Control': 'no-store' };
        const authorization = request.headers.get('Authorization');
        if (!authorization || !/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(authorization)) {
            return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
        }
        try {
            // A browser cookie can never replace the native caller's bearer.
            const tokenRequest = new Request(request.url, { method: 'POST', headers: { Authorization: authorization } });
            const auth = await authenticate(tokenRequest);
            if (!auth?.userId) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
            let body: NativeContentRequest;
            try { body = await readNativeContentRequest(request); }
            catch { return Response.json({ error: 'BAD_REQUEST' }, { status: 400, headers }); }
            const token = await auth.getToken({ template: 'convex' });
            if (!token) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
            const result = await exportContent(body, token);
            if (result.userId !== auth.userId) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
            const json = JSON.stringify(result);
            if (new TextEncoder().encode(json).byteLength > NATIVE_CONTENT_RESPONSE_LIMIT) throw new Error('EXPORT_TOO_LARGE');
            return new Response(json, { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
        } catch {
            return Response.json({ error: 'Selected website content could not be verified. Review it again.' }, { status: 403, headers });
        }
    };
}
