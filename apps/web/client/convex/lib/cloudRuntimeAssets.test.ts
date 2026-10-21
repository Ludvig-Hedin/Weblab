import { describe, expect, it } from 'bun:test';
import { loadCloudRuntimeAssets } from './cloudRuntimeAssets';
const preload = '// Weblab stale domId lookup blocked:\n' + 'x'.repeat(120);
const ix = 'x'.repeat(120);

describe('bounded deployment bootstrap reads', () => {
    it('reads exact trusted HTTPS paths with no redirects and retains UTF-8', async () => {
        const requests: string[] = [];
        const files = await loadCloudRuntimeAssets('https://app.example', async (url, init) => {
            requests.push(String(url)); expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
            return new Response(requests.length === 1 ? preload + 'å' : ix);
        });
        expect(files.map(file => file.path)).toEqual(['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js']);
        expect(files[0]?.content).toBe(preload + 'å'); expect(requests.every(url => new URL(url).origin === 'https://app.example')).toBe(true);
    });
    it('refuses oversized streamed bytes before reading the remaining body', async () => {
        let pulls = 0; let cancelled = false;
        const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(400_000)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
        await expect(loadCloudRuntimeAssets('https://app.example', async () => new Response(body))).rejects.toThrow('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE');
        expect(pulls).toBe(2); expect(cancelled).toBe(true);
    });
    it('refuses unsafe origin, invalid UTF-8, stale bundles and HTML', async () => {
        for (const origin of [undefined, 'http://app.example', 'https://app.example/path', 'https://user@app.example']) {
            await expect(loadCloudRuntimeAssets(origin, async () => { throw new Error('No fetch'); })).rejects.toThrow('CLOUD_RUNTIME_NOT_CONFIGURED');
        }
        for (const body of [new Uint8Array([255]), '<html>' + 'x'.repeat(120), 'stale'.repeat(40)]) {
            await expect(loadCloudRuntimeAssets('https://app.example', async () => new Response(body))).rejects.toThrow('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE');
        }
    });
});
