import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { readImportedAsset } from './client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const scope = { projectId: 'project_123', branchId: 'branch_123' };
const payload = new TextEncoder().encode('actual saved asset');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const file = { path: 'public/media/movie with spaces.mp4', bytes: payload.byteLength, hash: hash(payload) };
function mockFetch(handler: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>) {
    return spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect: originalFetch.preconnect }));
}

describe('imported asset browser reads', () => {
    it('reads authenticated same-origin streamed bytes and verifies the saved hash', async () => {
        const controller = new AbortController();
        mockFetch(async (url, init) => {
            const request = new URL(String(url), 'https://weblab.example');
            expect(request.origin).toBe('https://weblab.example');
            expect(request.pathname).toBe('/api/cloud-imports/asset');
            expect(Object.fromEntries(request.searchParams)).toEqual({ ...scope, path: file.path, expectedHash: file.hash });
            expect(init).toEqual({ credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
            return new Response(new ReadableStream<Uint8Array>({ start(stream) {
                stream.enqueue(payload.slice(0, 5)); stream.enqueue(payload.slice(5)); stream.close();
            } }), { headers: { 'content-length': String(file.bytes) } });
        });
        expect(await readImportedAsset(scope, file, controller.signal)).toEqual(payload);
    });
    it('rejects a same-length corrupted body even when its header claims the expected hash', async () => {
        const corrupt = payload.slice(); corrupt[0] = corrupt[0]! ^ 1;
        mockFetch(async () => new Response(corrupt, { headers: { 'x-weblab-content-sha256': file.hash } }));
        await expect(readImportedAsset(scope, file, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_INVALID');
    });
    it('cancels as soon as a streamed chunk exceeds the expected byte count', async () => {
        let reads = 0; let canceled = false;
        mockFetch(async () => new Response(new ReadableStream<Uint8Array>({
            pull(stream) { reads++; stream.enqueue(new Uint8Array(file.bytes + 1)); },
            cancel() { canceled = true; },
        }, { highWaterMark: 0 })));
        await expect(readImportedAsset(scope, file, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_INVALID');
        expect(reads).toBe(1); expect(canceled).toBe(true);
    });
    it('rejects a truncated body and a missing body for a nonempty file', async () => {
        mockFetch(async () => new Response(payload.slice(0, -1)));
        await expect(readImportedAsset(scope, file, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_INVALID');
        mockFetch(async () => new Response(null));
        await expect(readImportedAsset(scope, file, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_INVALID');
    });
    it('accepts an empty file only when its digest matches', async () => {
        mockFetch(async () => new Response(null));
        expect(await readImportedAsset(scope, { ...file, bytes: 0, hash: hash(new Uint8Array()) }, new AbortController().signal)).toEqual(new Uint8Array());
    });
    for (const length of ['1', '999999999', '-1', 'not-a-number']) {
        it(`cancels an invalid content length ${length} before reading`, async () => {
            let read = false; let canceled = false;
            mockFetch(async () => new Response(new ReadableStream<Uint8Array>({
                pull() { read = true; }, cancel() { canceled = true; },
            }, { highWaterMark: 0 }), { headers: { 'content-length': length } }));
            await expect(readImportedAsset(scope, file, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_INVALID');
            expect(read).toBe(false); expect(canceled).toBe(true);
        });
    }
    it('rejects invalid manifest sizes and hashes without requesting bytes', async () => {
        const fetch = mockFetch(async () => { throw new Error('Unexpected request'); });
        for (const bytes of [-1, NaN, Infinity, 1.5, 32 * 1024 * 1024 + 1]) {
            await expect(readImportedAsset(scope, { ...file, bytes }, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_INVALID');
        }
        await expect(readImportedAsset(scope, { ...file, hash: `${file.hash}\n` }, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_INVALID');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('cancels an unsuccessful HTTP response rather than reading its body', async () => {
        let canceled = false;
        mockFetch(async () => new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }, { highWaterMark: 0 }), { status: 403 }));
        await expect(readImportedAsset(scope, file, new AbortController().signal)).rejects.toThrow('CLOUD_IMPORT_ASSET_UNAVAILABLE');
        expect(canceled).toBe(true);
    });
    it('propagates an existing abort before making any request', async () => {
        const fetch = mockFetch(async () => { throw new Error('Unexpected request'); });
        const controller = new AbortController(); const reason = new Error('Stopped by caller'); controller.abort(reason);
        await expect(readImportedAsset(scope, file, controller.signal)).rejects.toBe(reason);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('unblocks and cancels a pending stream read on abort', async () => {
        const controller = new AbortController(); const reason = new Error('Stopped during read');
        let canceled = false;
        mockFetch(async () => new Response(new ReadableStream<Uint8Array>({
            pull() { queueMicrotask(() => controller.abort(reason)); },
            cancel() { canceled = true; },
        }, { highWaterMark: 0 })));
        await expect(readImportedAsset(scope, file, controller.signal)).rejects.toBe(reason);
        expect(canceled).toBe(true);
    });
});
