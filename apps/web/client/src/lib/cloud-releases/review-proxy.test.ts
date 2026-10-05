import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { CloudReleaseVercel } from '../../../convex/lib/cloudReleaseVercel';
import { proxyReleaseReview, reviewOriginAllowed, type ReviewFailure } from './review-proxy';

afterEach(() => { globalThis.fetch = originalFetch; });
const originalFetch = globalThis.fetch;
function mockFetch(handler: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>) {
    return spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect: originalFetch.preconnect }));
}
const target = { deploymentUrl: 'https://frozen-site.vercel.app', deploymentId: 'dpl_frozen', hash: 'hash' };
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
        mockFetch(async () => new Response('private body'));
        const response = await proxyReleaseReview(new Request('https://abc.review.example.test/'), {
            target, path: [], bypass: 'private', reauthorize: async () => { throw new Error('Membership revoked'); },
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
        expect(authorizations).toBe(2);
        expect(failures).toEqual([]);
        expect(paths).toEqual(['/v13/deployments/dpl_frozen', '/v9/projects/prj_test', '/v10/projects/prj_test/env', '/v1/projects/prj_test/routes/versions', '/v1/projects/prj_test/routes', '/v1/projects/prj_test/routes/versions', '/']);
    });
});

describe('safe review failure diagnostics', () => {
    for (const stage of ['provider-verification', 'upstream-fetch', 'authorization-recheck', 'redirect'] as const) {
        it(`reports only the fixed ${stage} stage and a sanitized reason`, async () => {
            const failures: ReviewFailure[] = [];
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
                reauthorize: async () => { if (stage === 'authorization-recheck') throw secretError; return target; },
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
