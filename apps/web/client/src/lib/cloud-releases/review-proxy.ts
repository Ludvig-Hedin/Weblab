export type ReviewFailureStage = 'provider-verification' | 'upstream-fetch' | 'authorization-recheck' | 'redirect' | 'response' | 'stream';
const providerFailureReasons = [
    'CLOUD_RELEASE_PROVIDER_RESPONSE', 'CLOUD_RELEASE_PROVIDER_ID', 'CLOUD_RELEASE_PROVIDER_URL',
    'CLOUD_RELEASE_PROVIDER_SETUP', 'CLOUD_RELEASE_PROVIDER_ENV_UNSUPPORTED',
    'CLOUD_RELEASE_CREDENTIAL_ISOLATION', 'CLOUD_RELEASE_BUILD_CHANGED',
    'CLOUD_RELEASE_PROVIDER_401', 'CLOUD_RELEASE_PROVIDER_403', 'CLOUD_RELEASE_PROVIDER_404',
    'CLOUD_RELEASE_PROVIDER_429', 'CLOUD_RELEASE_PROVIDER_500', 'CLOUD_RELEASE_PROVIDER_502',
    'CLOUD_RELEASE_PROVIDER_503', 'CLOUD_RELEASE_PROVIDER_504',
] as const;
export type ReviewFailure = {
    stage: ReviewFailureStage;
    reason: 'timeout' | 'aborted' | 'unknown' | typeof providerFailureReasons[number];
};

function failureReason(error: unknown, timedOut: boolean, aborted: boolean): ReviewFailure['reason'] {
    if (timedOut) return 'timeout';
    if (aborted || (error instanceof Error && error.name === 'AbortError')) return 'aborted';
    if (error instanceof Error) {
        const known = providerFailureReasons.find(reason => reason === error.message);
        if (known) return known;
    }
    return 'unknown';
}

type ReviewTarget = { deploymentUrl: string; deploymentId: string; hash: string };

export function reviewOriginAllowed(hostname: string, releaseId: string, suffix: string): boolean {
    return /^[a-z0-9-]+$/.test(releaseId) && /^[a-z0-9.-]+$/.test(suffix) && hostname === `${releaseId}.${suffix}`;
}

/** The browser receives only same-origin site bytes, never the provider bypass credential. */
export async function proxyReleaseReview(request: Request, input: {
    target: ReviewTarget; path: string[]; bypass: string;
    reauthorize: () => Promise<ReviewTarget>;
    verifyProvider: (signal: AbortSignal) => Promise<void>;
    onFailure?: (failure: ReviewFailure) => void;
}): Promise<Response> {
    const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
    if (!['GET', 'HEAD'].includes(request.method) || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(input.target.deploymentUrl)) {
        return new Response(null, { status: 403, headers: noStore });
    }
    if (input.path.some(segment => !segment || segment === '.' || segment === '..' || /[\\/\u0000-\u001f]/.test(segment))) return new Response(null, { status: 400, headers: noStore });
    const original = new URL(request.url);
    if (original.search.length > 16_384 || [...original.searchParams.keys()].some(key => key.startsWith('x-vercel-'))) return new Response(null, { status: 400, headers: noStore });
    const target = new URL(`/${input.path.map(encodeURIComponent).join('/')}`, input.target.deploymentUrl);
    target.search = original.search;
    const headers = new Headers({ 'x-vercel-protection-bypass': input.bypass });
    for (const key of ['accept', 'range', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-url']) {
        const value = request.headers.get(key);
        if (value && value.length <= 16_384) headers.set(key, value);
    }
    const controller = new AbortController();
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    const abort = () => controller.abort(); request.signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => { clearTimeout(deadline); request.signal.removeEventListener('abort', abort); };
    const reportFailure = (stage: ReviewFailureStage, error: unknown) => {
        try { input.onFailure?.({ stage, reason: failureReason(error, timedOut, controller.signal.aborted) }); }
        catch { /* Diagnostics must never alter access control or cleanup. */ }
    };
    let stage: ReviewFailureStage = 'provider-verification';
    try {
        await input.verifyProvider(controller.signal);
        stage = 'upstream-fetch';
        const upstream = await fetch(target, { method: request.method, headers, redirect: 'manual', cache: 'no-store', signal: controller.signal });
        stage = 'authorization-recheck';
        const current = await input.reauthorize();
        if (current.deploymentId !== input.target.deploymentId || current.hash !== input.target.hash) throw new Error('Review changed');
        stage = 'response';
        const output = new Headers(noStore);
        for (const key of ['content-type', 'content-range', 'accept-ranges']) {
            const value = upstream.headers.get(key); if (value) output.set(key, value);
        }
        output.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none'");
        stage = 'redirect';
        const location = upstream.headers.get('location');
        if (location) {
            const next = new URL(location, target);
            if (next.origin !== target.origin) throw new Error('External redirect refused');
            output.set('location', `${original.origin}${next.pathname}${next.search}${next.hash}`);
        }
        stage = 'response';
        if (!upstream.body || request.method === 'HEAD') {
            await upstream.body?.cancel(); cleanup();
            return new Response(null, { status: upstream.status, headers: output });
        }
        const reader = upstream.body.getReader(); let total = 0; let checkedAt = Date.now();
        const body = new ReadableStream<Uint8Array>({
            async pull(stream) {
                try {
                    const part = await reader.read();
                    if (part.done) { cleanup(); stream.close(); return; }
                    // A read can stall. Recheck after it resolves, before forwarding
                    // any new bytes, rather than authorizing before a long wait.
                    if (Date.now() - checkedAt > 5000) {
                        const current = await input.reauthorize();
                        if (current.deploymentId !== input.target.deploymentId || current.hash !== input.target.hash) throw new Error('Review changed');
                        checkedAt = Date.now();
                    }
                    total += part.value.byteLength;
                    if (total > 8_000_000) throw new Error('Review response too large');
                    stream.enqueue(part.value);
                } catch (error) { reportFailure('stream', error); controller.abort(); cleanup(); await reader.cancel().catch(() => undefined); stream.error(error); }
            },
            async cancel() { controller.abort(); cleanup(); await reader.cancel(); },
        });
        return new Response(body, { status: upstream.status, headers: output });
    } catch (error) {
        reportFailure(stage, error);
        controller.abort(); cleanup();
        return new Response(null, { status: 502, headers: noStore });
    }
}
