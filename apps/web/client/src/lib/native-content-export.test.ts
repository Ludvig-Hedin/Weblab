import { describe, expect, test } from 'bun:test';
import { createNativeContentExportHandler, NATIVE_CONTENT_BODY_LIMIT, nativeContentRequestSchema, readNativeContentRequest } from './native-content-export';
import type { NativeContentExport } from './native-content-export';
import type { BlogConnection } from './sanity-blog-api';

const request = {
    projectId: 'project', branchId: 'branch', connectionId: 'connection', connectionRevision: 1,
    selections: [{ draftId: 'draft', expectedRevision: 2, providerRevision: 'provider-1', archived: false }],
};
function post(body: BodyInit, headers: Record<string, string> = {}) {
    return new Request('https://private-beta.example/api/native/publishing/content', { method: 'POST', body, headers });
}
describe('bounded native content export input', () => {
    test('retains exact selected pins and allows an explicitly unchanged website', async () => {
        expect(await readNativeContentRequest(post(JSON.stringify(request)))).toEqual(request);
        expect(nativeContentRequestSchema.parse({ ...request, selections: [] }).selections).toEqual([]);
    });
    test('rejects renderer documents, duplicate identity and malformed revision or archive intent', () => {
        expect(nativeContentRequestSchema.safeParse({ ...request, documentJson: '{}' }).success).toBe(false);
        expect(nativeContentRequestSchema.safeParse({ ...request, selections: [request.selections[0], request.selections[0]] }).success).toBe(false);
        for (const change of [{ expectedRevision: 0 }, { expectedRevision: 1.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { archived: undefined }, { documentJson: '{}' }]) {
            expect(nativeContentRequestSchema.safeParse({ ...request, selections: [{ ...request.selections[0], ...change }] }).success).toBe(false);
        }
        expect(nativeContentRequestSchema.safeParse({ ...request, selections: Array.from({ length: 9 }, (_, i) => ({ ...request.selections[0], draftId: `draft-${i}` })) }).success).toBe(false);
    });
    test('rejects oversized declared and streamed bytes and cancels the stream', async () => {
        await expect(readNativeContentRequest(post('{}', { 'Content-Length': String(NATIVE_CONTENT_BODY_LIMIT + 1) }))).rejects.toThrow();
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array(NATIVE_CONTENT_BODY_LIMIT)); controller.enqueue(new Uint8Array(1)); },
            cancel() { cancelled = true; },
        });
        await expect(readNativeContentRequest(post(stream))).rejects.toThrow();
        expect(cancelled).toBe(true);
    });
    test('requires valid UTF-8 and complete JSON, including multi-chunk boundaries', async () => {
        await expect(readNativeContentRequest(post(new Uint8Array([0xff])))).rejects.toThrow();
        await expect(readNativeContentRequest(post('{'))).rejects.toThrow();
        const bytes = new TextEncoder().encode(JSON.stringify({ ...request, selections: [{ ...request.selections[0], providerRevision: 'åäö' }] }));
        const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
        expect((await readNativeContentRequest(post(stream))).selections[0]?.providerRevision).toBe('åäö');
    });
    test('a valid JSON body that stalls without closing is refused at the deadline and cancelled', async () => {
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(request))); },
            cancel() { cancelled = true; },
        });
        await expect(readNativeContentRequest(post(stream))).rejects.toThrow('BAD_REQUEST');
        expect(cancelled).toBe(true);
    }, 10_000);
});

const exported: NativeContentExport = {
    version: 1, userId: 'actor', drafts: [],
    connection: { id: 'connection' as BlogConnection['id'], projectId: 'project' as BlogConnection['projectId'], branchId: 'branch' as BlogConnection['branchId'], profile: 'sanity-blog-v1', sanityProjectId: 'exampleid', dataset: 'production', revision: 1 },
};
const bearer = 'Bearer aaaaaaaaaaaaaaaaaaaaaaaa';
describe('native content HTTP authentication boundary', () => {
    test('cookie-only calls never authenticate or export, and valid bearer strips cookies before auth', async () => {
        const events: string[] = [];
        const handler = createNativeContentExportHandler({
            authenticate: async (received) => {
                events.push('auth');
                expect(received.headers.get('Authorization')).toBe(bearer);
                expect(received.headers.get('Cookie')).toBeNull();
                expect(received.body).toBeNull();
                return { userId: 'actor', getToken: async (options) => { expect(options).toEqual({ template: 'convex' }); events.push('token'); return 'current-convex-token'; } };
            },
            exportContent: async (body, token) => { expect(body).toEqual(request); expect(token).toBe('current-convex-token'); events.push('export'); return exported; },
        });
        const cookieOnly = await handler(post(JSON.stringify(request), { Cookie: 'session=other-actor' }));
        expect(cookieOnly.status).toBe(401);
        expect(events).toEqual([]);
        const valid = await handler(post(JSON.stringify(request), { Authorization: bearer, Cookie: 'session=other-actor' }));
        expect(valid.status).toBe(200);
        expect(valid.headers.get('Cache-Control')).toBe('no-store');
        expect(await valid.json()).toEqual(exported);
        expect(events).toEqual(['auth', 'token', 'export']);
    });
    test('invalid session or absent convex token never exports, and a returned actor mismatch reveals no data', async () => {
        let exports = 0;
        for (const auth of [null, { userId: 'actor', getToken: async () => null }]) {
            const handler = createNativeContentExportHandler({ authenticate: async () => auth, exportContent: async () => { exports++; return exported; } });
            expect((await handler(post(JSON.stringify(request), { Authorization: bearer }))).status).toBe(401);
        }
        expect(exports).toBe(0);
        const mismatched = createNativeContentExportHandler({
            authenticate: async () => ({ userId: 'actor', getToken: async () => 'current-token' }),
            exportContent: async () => ({ ...exported, userId: 'different-actor' }),
        });
        const result = await mismatched(post(JSON.stringify(request), { Authorization: bearer }));
        expect(result.status).toBe(401);
        expect(await result.json()).toEqual({ error: 'UNAUTHORIZED' });
    });
});
