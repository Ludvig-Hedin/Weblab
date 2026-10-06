import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { CloudReleaseVercel } from '../../../convex/lib/cloudReleaseVercel';
import type { ReleaseReviewTarget } from '../../../convex/lib/cloudReleaseReviewTarget';
import type { RetainedReviewMedia } from '../../../convex/lib/cloudReleaseReviewMedia';
import { proxyReleaseReview, reviewOriginAllowed, type ReviewFailure } from './review-proxy';

afterEach(() => { globalThis.fetch = originalFetch; });
const originalFetch = globalThis.fetch;
function mockFetch(handler: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>) {
    return spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect: originalFetch.preconnect }));
}
const target: ReleaseReviewTarget = {
    deploymentUrl: 'https://frozen-site.vercel.app', deploymentId: 'dpl_frozen', hash: 'hash',
    destinationId: 'destination', generation: 1, credentialId: 'credential', credentialVersion: 1,
    credentialHash: 'a'.repeat(64), providerProof: 'b'.repeat(64),
    teamId: 'team_test', providerProjectId: 'prj_test', hostname: 'live-test.vercel.app',
};
const registrationChanges: Array<Partial<ReleaseReviewTarget>> = [
    { destinationId: 'other-destination' }, { generation: 2 }, { credentialId: 'other-credential' },
    { credentialVersion: 2 }, { credentialHash: 'c'.repeat(64) }, { providerProof: 'd'.repeat(64) },
    { teamId: 'team_other' }, { providerProjectId: 'prj_other' }, { hostname: 'other.vercel.app' },
];
describe('private retained movie streaming', () => {
    const movieTarget = { ...target, hash: 'a'.repeat(64) };
    const media: RetainedReviewMedia = { kind: 'imported-retained-media-v1', releaseHash: movieTarget.hash,
        path: 'public/videos/hero.mp4', hash: 'b'.repeat(64), bytes: 22_695_161, contentType: 'video/mp4' };
    const options = { target: movieTarget, media, path: ['videos', 'hero.mp4'], bypass: 'private',
        reauthorize: async () => movieTarget, verifyProvider: async () => undefined };
    const movieHeaders = (bytes = media.bytes) => ({ 'content-type': media.contentType, 'content-length': String(bytes) });
    const request = (range?: string, method = 'GET') => new Request('https://abc.review.example.test/videos/hero.mp4', {
        method, headers: range === undefined ? {} : { range },
    });
    function generatedBody(bytes: number, cancel?: () => void) {
        let remaining = bytes;
        return new ReadableStream<Uint8Array>({ pull(controller) {
            if (!remaining) { controller.close(); return; }
            const size = Math.min(remaining, 65_536); remaining -= size; controller.enqueue(new Uint8Array(size));
        }, cancel });
    }
    async function count(response: Response): Promise<number> {
        const reader = response.body!.getReader(); let bytes = 0;
        while (true) { const part = await reader.read(); if (part.done) return bytes; bytes += part.value.byteLength; }
    }
    it('streams the complete real-sized movie with bounded chunks and private headers', async () => {
        mockFetch(async (_url, init) => {
            expect(new Headers(init?.headers).get('accept-encoding')).toBe('identity');
            return new Response(generatedBody(media.bytes), { headers: { ...movieHeaders(), 'set-cookie': 'hidden=secret' } });
        });
        const response = await proxyReleaseReview(request(), options);
        expect(response.status).toBe(200); expect(await count(response)).toBe(media.bytes);
        expect(response.headers.get('content-length')).toBe(String(media.bytes));
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('set-cookie')).toBeNull();
    });
    it('normalizes closed, open-ended and suffix movie ranges', async () => {
        for (const [range, start, end] of [['bytes=10-19', 10, 19], ['bytes=22695150-', 22_695_150, media.bytes - 1], ['bytes=-8', media.bytes - 8, media.bytes - 1]] as const) {
            const bytes = end - start + 1;
            mockFetch(async (_url, init) => {
                expect(new Headers(init?.headers).get('range')).toBe(`bytes=${start}-${end}`);
                return new Response(generatedBody(bytes), { status: 206, headers: { ...movieHeaders(bytes), 'content-range': `bytes ${start}-${end}/${media.bytes}` } });
            });
            const response = await proxyReleaseReview(request(range), options);
            expect(response.status).toBe(206); expect(await count(response)).toBe(bytes);
        }
    });
    it('validates a full response when Range is ignored and strips Range for HEAD', async () => {
        mockFetch(async (_url, init) => {
            if (init?.method === 'HEAD') expect(new Headers(init.headers).has('range')).toBe(false);
            return new Response(init?.method === 'HEAD' ? null : generatedBody(media.bytes), { headers: movieHeaders() });
        });
        expect(await count(await proxyReleaseReview(request('bytes=0-9'), options))).toBe(media.bytes);
        const head = await proxyReleaseReview(request('invalid-range', 'HEAD'), options);
        expect(head.status).toBe(200); expect(head.body).toBeNull(); expect(head.headers.get('content-length')).toBe(String(media.bytes));
    });
    it('refuses malformed tuples and ranges before any provider fetch', async () => {
        let fetched = 0; mockFetch(async () => { fetched++; return new Response('forbidden'); });
        for (const range of ['bytes=0-1,3-4', 'bytes=bad-', 'bytes=1-0']) expect((await proxyReleaseReview(request(range), options)).status).toBe(400);
        const unsatisfied = await proxyReleaseReview(request('bytes=22695161-'), options);
        expect(unsatisfied.status).toBe(416); expect(unsatisfied.headers.get('content-range')).toBe(`bytes */${media.bytes}`);
        expect((await proxyReleaseReview(new Request(`${request().url}?x=1`), options)).status).toBe(403);
        expect((await proxyReleaseReview(request(), { ...options, media: { ...media, releaseHash: 'c'.repeat(64) } })).status).toBe(403);
        expect(fetched).toBe(0);
    });
    it('refuses inconsistent headers, redirects and missing bodies without exposing successful bytes', async () => {
        for (const headers of [ { ...movieHeaders(), 'content-encoding': 'gzip' }, { ...movieHeaders(), 'content-type': 'text/html' },
            { ...movieHeaders(), 'content-length': '9' }, { ...movieHeaders(), 'content-range': `bytes 0-9/${media.bytes}` }]) {
            let canceled = false;
            mockFetch(async () => new Response(generatedBody(10, () => { canceled = true; }), { headers }));
            expect((await proxyReleaseReview(request(), options)).status).toBe(502); expect(canceled).toBe(true);
        }
        mockFetch(async () => new Response(null, { headers: movieHeaders() }));
        expect((await proxyReleaseReview(request(), options)).status).toBe(502);
        mockFetch(async () => new Response(null, { status: 302, headers: { location: '/other.mp4' } }));
        expect((await proxyReleaseReview(request(), options)).status).toBe(502);
        mockFetch(async () => new Response(generatedBody(10), { status: 206, headers: { ...movieHeaders(10), 'content-range': `bytes 0-9/${media.bytes + 1}` } }));
        expect((await proxyReleaseReview(request('bytes=0-9'), options)).status).toBe(502);
    });
    it('refuses truncation and excess before forwarding excess bytes', async () => {
        for (const bytes of [9, 11]) {
            mockFetch(async () => new Response(generatedBody(bytes), { status: 206, headers: { ...movieHeaders(10), 'content-range': `bytes 0-9/${media.bytes}` } }));
            const response = await proxyReleaseReview(request('bytes=0-9'), options);
            await expect(count(response)).rejects.toThrow(bytes < 10 ? 'truncated' : 'too large');
        }
    });
    it('keeps ordinary HTML and media-error responses at the original limit', async () => {
        mockFetch(async () => new Response(generatedBody(8_000_001), { headers: { 'content-type': 'text/html' } }));
        await expect(count(await proxyReleaseReview(request(), { ...options, media: undefined }))).rejects.toThrow('too large');
        mockFetch(async () => new Response(generatedBody(8_000_001), { status: 404, headers: movieHeaders() }));
        await expect(count(await proxyReleaseReview(request(), options))).rejects.toThrow('too large');
        mockFetch(async () => new Response('missing', { status: 404, headers: { ...movieHeaders(), 'content-range': 'untrusted', 'accept-ranges': 'untrusted' } }));
        const missing = await proxyReleaseReview(request(), options);
        expect(missing.headers.has('content-range')).toBe(false); expect(missing.headers.has('content-length')).toBe(false);
        expect(missing.headers.has('accept-ranges')).toBe(false); expect(await missing.text()).toBe('missing');
    });
    it('cancels the upstream movie when the viewer cancels', async () => {
        let canceled = false;
        mockFetch(async () => new Response(generatedBody(media.bytes, () => { canceled = true; }), { headers: movieHeaders() }));
        const response = await proxyReleaseReview(request(), options);
        await response.body!.cancel(); expect(canceled).toBe(true);
    });
    it('checks revocation after a stalled movie read', async () => {
        let now = 0, authorizations = 0;
        const time = spyOn(Date, 'now').mockImplementation(() => now);
        let upstream: ReadableStreamDefaultController<Uint8Array> | undefined;
        mockFetch(async () => new Response(new ReadableStream({ start(controller) { upstream = controller; } }), { headers: movieHeaders() }));
        try {
            const response = await proxyReleaseReview(request(), { ...options,
                reauthorize: async () => ++authorizations <= 2 ? movieTarget : { ...movieTarget, generation: 2 } });
            now = 5001; const body = count(response); upstream!.enqueue(new Uint8Array(10));
            await expect(body).rejects.toThrow('Review changed');
        } finally { time.mockRestore(); }
    });
});
describe('private release review proxy', () => {
    it('requires an exact isolated review origin', () => {
        expect(reviewOriginAllowed('abc.review.example.test', 'abc', 'review.example.test')).toBe(true);
        expect(reviewOriginAllowed('app.example.test', 'abc', 'review.example.test')).toBe(false);
        expect(reviewOriginAllowed('abc.review.example.test.evil.test', 'abc', 'review.example.test')).toBe(false);
    });
    it('does not forward session cookies or return provider cookies and bypass credentials', async () => {
        let sent: RequestInit | undefined;
        mockFetch(async (_url, init) => {
            sent = init; return new Response('<h1>Frozen site</h1>', { headers: { 'content-type': 'text/html', 'set-cookie': 'provider-secret=value' } });
        });
        const response = await proxyReleaseReview(new Request('https://abc.review.example.test/', { headers: { Cookie: 'session=secret', Authorization: 'Bearer session' } }),
            { target, path: [], bypass: 'private-bypass', reauthorize: async () => target, verifyProvider: async () => undefined });
        const headers = new Headers(sent?.headers);
        expect(headers.get('cookie')).toBeNull(); expect(headers.get('authorization')).toBeNull();
        expect(headers.get('x-vercel-protection-bypass')).toBe('private-bypass');
        expect(response.headers.get('set-cookie')).toBeNull(); expect(response.headers.get('cache-control')).toContain('no-store');
        expect(response.headers.get('content-security-policy')).toContain("worker-src 'none'");
        expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
        expect(await response.text()).toBe('<h1>Frozen site</h1>');
    });
    it('refuses external provider redirects and changed authorization', async () => {
        mockFetch(async () => new Response(null, { status: 302, headers: { location: 'https://outside.test/' } }));
        const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), { target, path: [], bypass: 'private', reauthorize: async () => target, verifyProvider: async () => undefined });
        expect(response.status).toBe(502);
    });
    it('rechecks current membership before returning any provider body', async () => {
        let authorizations = 0;
        mockFetch(async () => new Response('private body'));
        const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
            target, path: [], bypass: 'private', reauthorize: async () => { if (++authorizations > 1) throw new Error('Membership revoked'); return target; },
            verifyProvider: async () => undefined,
        });
        expect(response.status).toBe(502); expect(await response.text()).not.toContain('private body');
    });
    it('does not send the bypass credential when live provider isolation cannot be verified', async () => {
        let requests = 0;
        mockFetch(async () => { requests++; return new Response('must not be requested'); });
        const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
            target, path: [], bypass: 'private', reauthorize: async () => target,
            verifyProvider: async () => { throw new Error('CDN rule missing'); },
        });
        expect(response.status).toBe(502); expect(requests).toBe(0);
    });
    it('checks isolation before every upstream request, including assets', async () => {
        const order: string[] = [];
        mockFetch(async () => { order.push('site'); return new Response('safe'); });
        for (const path of [[], ['_next', 'static', 'app.js']]) {
            const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
                target, path, bypass: 'private', reauthorize: async () => target,
                verifyProvider: async signal => { expect(signal.aborted).toBe(false); order.push('verify'); },
            });
            await response.text();
        }
        expect(order).toEqual(['verify', 'site', 'verify', 'site']);
    });
    it('refuses changed registration pins before sending the bypass credential even for the same deployment and hash', async () => {
        for (const change of registrationChanges) {
            let requests = 0;
            mockFetch(async () => { requests++; return new Response('private body'); });
            const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
                target, path: [], bypass: 'private', reauthorize: async () => ({ ...target, ...change }), verifyProvider: async () => undefined,
            });
            expect(response.status).toBe(502); expect(requests).toBe(0);
            expect(await response.text()).toBe('');
        }
    });
    it('refuses changed registration pins after fetching before exposing any body', async () => {
        for (const change of registrationChanges) {
            let requests = 0, authorizations = 0;
            mockFetch(async () => { requests++; return new Response('private body'); });
            const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
                target, path: [], bypass: 'private',
                reauthorize: async () => ++authorizations === 1 ? target : ({ ...target, ...change }),
                verifyProvider: async () => undefined,
            });
            expect(response.status).toBe(502); expect(requests).toBe(1);
            expect(await response.text()).toBe('');
        }
    });
    it('rechecks registration pins after a stalled read before forwarding the next stream chunk', async () => {
        for (const change of registrationChanges) {
            const initialTime = Date.now();
            let now = initialTime, authorizations = 0;
            const time = spyOn(Date, 'now').mockImplementation(() => now);
            let upstream: ReadableStreamDefaultController<Uint8Array> | undefined;
            let canceled = false;
            const failures: ReviewFailure[] = [];
            mockFetch(async () => new Response(new ReadableStream<Uint8Array>({
                start(controller) { upstream = controller; },
                cancel() { canceled = true; },
            })));
            try {
                const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
                    target, path: [], bypass: 'private',
                    reauthorize: async () => ++authorizations <= 2 ? target : ({ ...target, ...change }),
                    verifyProvider: async () => undefined, onFailure: failure => failures.push(failure),
                });
                expect(response.status).toBe(200);
                now = initialTime + 5001;
                const body = response.text();
                upstream!.enqueue(new TextEncoder().encode('private delayed body'));
                await expect(body).rejects.toThrow('Review changed');
                expect(authorizations).toBe(3); expect(canceled).toBe(true);
                expect(failures).toEqual([{ stage: 'stream', reason: 'unknown' }]);
            } finally { time.mockRestore(); }
        }
    });
    it('fails closed when either server omits any registration pin during a mixed rollout', async () => {
        const pins = ['destinationId', 'generation', 'credentialId', 'credentialVersion', 'credentialHash', 'providerProof', 'teamId', 'providerProjectId', 'hostname'] as const;
        for (const pin of pins) {
            const legacy: Partial<ReleaseReviewTarget> = { ...target };
            delete legacy[pin];
            for (const phase of ['initial', 'before-fetch', 'after-fetch']) {
                let requests = 0, authorizations = 0;
                mockFetch(async () => { requests++; return new Response('private body'); });
                const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
                    target: phase === 'initial' ? legacy as ReleaseReviewTarget : target, path: [], bypass: 'private',
                    reauthorize: async () => {
                        authorizations++;
                        return phase === 'before-fetch' || (phase === 'after-fetch' && authorizations > 1) ? legacy as ReleaseReviewTarget : target;
                    },
                    verifyProvider: async () => undefined,
                });
                expect(response.status).toBe(phase === 'initial' ? 403 : 502);
                expect(requests).toBe(phase === 'after-fetch' ? 1 : 0);
                expect(await response.text()).toBe('');
            }
        }
    });
});

// Route payload captured during the short pass. IDs are provider metadata, not credentials.
const recordedRoutes = {
    routes: [{ id: 'a32a7b2e-c572-4e17-a783-c9875363879e', name: 'Weblab review credential isolation',
        enabled: true, staged: false,
        route: { src: '^/.*$', transforms: [{ type: 'request.headers', op: 'delete', target: { key: 'x-vercel-protection-bypass' } }] },
        srcSyntax: 'regex', routeType: 'transform' }],
    version: { id: 'b7a05599-c408-4f6f-a66a-a635ff83b67e', s3Key: '4bdcfdfd21b1de06', createdBy: 'Ludvig', lastModified: 1791021803022, ruleCount: 1 },
    limit: { maxRoutes: 100, currentRoutes: 1 },
};

describe('review proxy with the real provider guard', () => {
    it('verifies the deployment and live policy before serving private bytes without forwarding either session', async () => {
        // Other responses are synthetic fixtures derived from the saved diagnostic fields.
        const options = { token: 'synthetic-api-token', bypass: 'synthetic-bypass', teamId: 'team_test', projectId: 'prj_test', hostname: 'live-test.vercel.app' };
        const paths: string[] = [];
        mockFetch(async (url, init) => {
            const parsed = new URL(String(url));
            const headers = new Headers(init?.headers);
            paths.push(parsed.pathname);
            expect(headers.get('cookie')).toBeNull();
            if (parsed.origin === target.deploymentUrl && parsed.pathname === '/') {
                expect(headers.get('authorization')).toBeNull();
                expect(headers.get('x-vercel-protection-bypass')).toBe(options.bypass);
                return new Response('<h1>Synthetic frozen fixture</h1>', { headers: { 'content-type': 'text/html', 'set-cookie': 'provider=hidden' } });
            }
            if (parsed.origin !== 'https://api.vercel.com' || parsed.searchParams.get('teamId') !== options.teamId) throw new Error('Unexpected network request');
            expect(headers.get('authorization')).toBe(`Bearer ${options.token}`);
            expect(headers.get('x-vercel-protection-bypass')).toBeNull();
            if (parsed.pathname === '/v13/deployments/dpl_frozen') return Response.json({ id: target.deploymentId, projectId: options.projectId, target: 'production', readyState: 'READY', url: 'frozen-site.vercel.app', meta: { weblabCloudReleaseId: 'release', weblabCloudReleaseHash: target.hash } });
            if (parsed.pathname === '/v9/projects/prj_test') return Response.json({ id: options.projectId, accountId: options.teamId, autoExposeSystemEnvs: false, ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' } });
            if (parsed.pathname === '/v10/projects/prj_test/env' && parsed.searchParams.get('decrypt') === 'false') return Response.json({ envs: [] });
            if (parsed.pathname === '/v1/projects/prj_test/routes/versions') return Response.json({ versions: [{ ...recordedRoutes.version, isLive: true }] });
            if (parsed.pathname === '/v1/projects/prj_test/routes' && parsed.searchParams.get('versionId') === recordedRoutes.version.id) return Response.json(recordedRoutes);
            throw new Error('Unexpected network request');
        });
        const failures: ReviewFailure[] = [];
        let authorizations = 0;
        const reauthorize = async () => { authorizations++; return target; };
        const initial = await reauthorize();
        const response = await proxyReleaseReview(new Request('https://release.review.example.test/', { headers: { cookie: 'customer-session=hidden' } }), {
            target: initial, path: [], bypass: options.bypass, reauthorize, onFailure: failure => failures.push(failure),
            verifyProvider: async signal => {
                const provider = new CloudReleaseVercel(options, signal);
                const deployment = await provider.deployment(target.deploymentId, 'release', target.hash);
                if (!deployment.ready || deployment.url !== target.deploymentUrl) throw new Error('Deployment changed');
                await provider.verifyProject();
            },
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('<h1>Synthetic frozen fixture</h1>');
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(authorizations).toBe(3);
        expect(failures).toEqual([]);
        expect(paths).toEqual(['/v13/deployments/dpl_frozen', '/v9/projects/prj_test', '/v10/projects/prj_test/env', '/v1/projects/prj_test/routes/versions', '/v1/projects/prj_test/routes', '/v1/projects/prj_test/routes/versions', '/']);
    });
});

describe('safe review failure diagnostics', () => {
    for (const stage of ['provider-verification', 'upstream-fetch', 'authorization-recheck', 'redirect'] as const) {
        it(`reports only the fixed ${stage} stage and a sanitized reason`, async () => {
            const failures: ReviewFailure[] = [];
            let authorizations = 0;
            const secretError = new Error('Sensitive cookie=secret token=secret https://private.test/?ticket=secret');
            mockFetch(async () => {
                if (stage === 'upstream-fetch') throw secretError;
                return stage === 'redirect'
                    ? new Response(null, { status: 302, headers: { location: 'https://private.test/?ticket=secret' } })
                    : new Response('private body');
            });
            const response = await proxyReleaseReview(new Request('https://release.review.example.test/'), {
                target, path: [], bypass: 'secret',
                verifyProvider: async () => { if (stage === 'provider-verification') throw secretError; },
                reauthorize: async () => { if (++authorizations > 1 && stage === 'authorization-recheck') throw secretError; return target; },
                onFailure: failure => failures.push(failure),
            });
            expect(response.status).toBe(502);
            expect(await response.text()).toBe('');
            expect(response.headers.get('cache-control')).toBe('private, no-store');
            expect(failures).toEqual([{ stage, reason: 'unknown' }]);
        });
    }
    it('distinguishes response construction failures from later stream failures', async () => {
        const failures: ReviewFailure[] = [];
        const locked = new Response('private body');
        const reader = locked.body!.getReader();
        mockFetch(async () => locked);
        const input = { target, path: [], bypass: 'secret', reauthorize: async () => target,
            verifyProvider: async () => undefined, onFailure: (failure: ReviewFailure) => failures.push(failure) };
        const failedResponse = await proxyReleaseReview(new Request('https://release.review.example.test/'), input);
        expect(failedResponse.status).toBe(502);
        expect(await failedResponse.text()).toBe('');
        await reader.cancel();
        mockFetch(async () => new Response(new ReadableStream<Uint8Array>({
            start(controller) { controller.error(new Error('Sensitive stream token=secret')); },
        })));
        const failedStream = await proxyReleaseReview(new Request('https://release.review.example.test/'), input);
        expect(failedStream.status).toBe(200);
        await expect(failedStream.text()).rejects.toThrow();
        expect(failures).toEqual([
            { stage: 'response', reason: 'unknown' },
            { stage: 'stream', reason: 'unknown' },
        ]);
    });
    it('reports an aborted request without logging the abort error message', async () => {
        const failures: ReviewFailure[] = [];
        const controller = new AbortController();
        const response = await proxyReleaseReview(new Request('https://release.review.example.test/', { signal: controller.signal }), {
            target, path: [], bypass: 'secret', reauthorize: async () => target,
            verifyProvider: async () => { controller.abort(); throw new Error('Sensitive abort token=secret'); },
            onFailure: failure => failures.push(failure),
        });
        expect(response.status).toBe(502);
        expect(await response.text()).toBe('');
        expect(failures).toEqual([{ stage: 'provider-verification', reason: 'aborted' }]);
    });
    it('allows only exact known provider errors and survives a throwing diagnostic callback', async () => {
        mockFetch(async () => { throw new Error('No upstream request expected'); });
        const failures: ReviewFailure[] = [];
        for (const message of ['CLOUD_RELEASE_PROVIDER_403', 'CLOUD_RELEASE_PROVIDER_403 token=secret']) {
            const response = await proxyReleaseReview(new Request('https://release.review.example.test/'), {
                target, path: [], bypass: 'secret', reauthorize: async () => target,
                verifyProvider: async () => { throw new Error(message); },
                onFailure: failure => { failures.push(failure); throw new Error('Diagnostic failed'); },
            });
            expect(response.status).toBe(502);
            expect(await response.text()).toBe('');
        }
        expect(failures).toEqual([
            { stage: 'provider-verification', reason: 'CLOUD_RELEASE_PROVIDER_403' },
            { stage: 'provider-verification', reason: 'unknown' },
        ]);
    });
});
