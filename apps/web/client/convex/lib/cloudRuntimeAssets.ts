'use node';

import { cloudError } from './cloudEditor';

const MAX_BUNDLE_BYTES = 750_000;
type FetchBundle = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Only deployment-owned bundles, bounded while reading rather than after allocation. */
export async function loadCloudRuntimeAssets(origin: string | undefined, fetchBundle: FetchBundle = fetch): Promise<Array<{ path: string; content: string }>> {
    let base: URL;
    try {
        base = new URL(origin ?? '');
        if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error();
    } catch { return cloudError('CLOUD_RUNTIME_NOT_CONFIGURED'); }
    const files: Array<{ path: string; content: string }> = [];
    for (const name of ['weblab-preload-script.js', 'weblab-ix-runtime.js']) {
        const signal = AbortSignal.timeout(15_000);
        const response = await fetchBundle(new URL(`/${name}?cloudRuntime=20261002-inline-newlines`, base), { signal, redirect: 'error', cache: 'no-store' });
        if (!response.ok || !response.body) {
            await response.body?.cancel();
            return cloudError('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE');
        }
        const reader = response.body.getReader();
        const output = new Uint8Array(MAX_BUNDLE_BYTES);
        let size = 0;
        const abort = () => { void reader.cancel().catch(() => {}); };
        signal.addEventListener('abort', abort, { once: true });
        try {
            while (true) {
                signal.throwIfAborted();
                const part = await reader.read();
                signal.throwIfAborted();
                if (part.done) break;
                if (part.value.byteLength > MAX_BUNDLE_BYTES - size) return cloudError('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE');
                output.set(part.value, size); size += part.value.byteLength;
            }
        } finally {
            signal.removeEventListener('abort', abort);
            await reader.cancel().catch(() => {});
        }
        let content: string;
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(output.subarray(0, size)); }
        catch { return cloudError('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE'); }
        if (size < 100 || /^\s*</.test(content) ||
            (name === 'weblab-preload-script.js' && !content.includes('Weblab stale domId lookup blocked:'))) return cloudError('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE');
        files.push({ path: `public/${name}`, content });
    }
    return files;
}
