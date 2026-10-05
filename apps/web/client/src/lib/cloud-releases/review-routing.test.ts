import { describe, expect, spyOn, test } from 'bun:test';
import { NextRequest, NextResponse } from 'next/server';
import { isReleaseReviewHost, releaseReviewPath, resolveReleaseReviewRequest, secureReleaseReviewResponse } from './review-routing';
import { proxyReleaseReview } from './review-proxy';

describe('review headers before route dispatch', () => {
    test('overrides marketing cache and app CSP without losing the internal rewrite', () => {
        const target = 'https://app.example.com/api/cloud-releases/review/release123/';
        const response = NextResponse.rewrite(target, { headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
            'Content-Security-Policy': "default-src 'self'; worker-src 'self' blob:; frame-ancestors 'self'",
        } });
        expect(secureReleaseReviewResponse(response)).toBe(response);
        expect(response.headers.get('x-middleware-rewrite')).toBe(target);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('x-frame-options')).toBe('DENY');
        const policy = response.headers.get('content-security-policy')!;
        for (const directive of ["worker-src 'none'", "frame-src 'none'", "frame-ancestors 'none'", "form-action 'none'", "connect-src 'self'"]) expect(policy).toContain(directive);
        expect(policy).not.toContain('blob:');
        expect(policy).not.toContain('https:');
        expect(response.headers.has('set-cookie')).toBe(false);
    });
    test('rejected review hosts cannot inherit public caching or executable content policy', () => {
        const response = secureReleaseReviewResponse(new NextResponse(null, { status: 404 }), true);
        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    });
});

describe('isolated release host routing', () => {
    test('routes the root, Next assets and application-looking paths through the same release', () => {
        for (const path of ['/', '/journal/story', '/_next/static/chunk.js', '/api/health', '/sign-in']) {
            expect(releaseReviewPath('release123.review.example.com', path, 'review.example.com'))
                .toBe(`/api/cloud-releases/review/release123${path}`);
        }
    });
    test('keeps malformed review hosts out of app authentication too', () => {
        expect(isReleaseReviewHost('review.example.com', 'review.example.com')).toBe(true);
        expect(isReleaseReviewHost('nested.release.review.example.com', 'review.example.com')).toBe(true);
        expect(releaseReviewPath('nested.release.review.example.com', '/', 'review.example.com')).toBeNull();
        expect(isReleaseReviewHost('app.example.com', 'review.example.com')).toBe(false);
    });
    test('does not catch the app host, lookalikes, nested releases or an unset suffix', () => {
        for (const host of ['example.com', 'review.example.com', 'release.review.example.com.evil.com', 'a.b.review.example.com'])
            expect(releaseReviewPath(host, '/', 'review.example.com')).toBeNull();
        expect(releaseReviewPath('release.review.example.com', '/', undefined)).toBeNull();
    });
});

describe('review authority behind the app proxy', () => {
    const suffix = 'review.example.com';
    function request(host?: string, forwarded = 'forged.example.com') {
        return new NextRequest('http://0.0.0.0:8080/journal/story?preview=1', {
            headers: { ...(host === undefined ? {} : { host }), 'x-forwarded-host': forwarded },
        });
    }
    test('uses actual public Host while the rewrite stays on the internal app server', () => {
        const incoming = request('release123.review.example.com');
        const route = resolveReleaseReviewRequest(incoming, suffix);
        expect(route.kind).toBe('review');
        if (route.kind !== 'review') throw new Error('Expected isolated review');
        expect(route.pathname).toBe('/api/cloud-releases/review/release123/journal/story');
        const target = incoming.nextUrl.clone(); target.pathname = route.pathname;
        expect(target.origin).toBe('http://0.0.0.0:8080');
        expect(target.search).toBe('?preview=1');
        const publicRequest = new Request(route.publicUrl, incoming);
        expect(publicRequest.url).toBe('https://release123.review.example.com/journal/story?preview=1');
        expect(publicRequest.headers.get('host')).toBe('release123.review.example.com');
    });
    test('does not let a forged forwarded host send app traffic into a review', () => {
        expect(resolveReleaseReviewRequest(request('app.example.com', 'release123.review.example.com'), suffix).kind).toBe('app');
        expect(resolveReleaseReviewRequest(request('release123.review.example.com', 'app.example.com'), suffix).kind).toBe('review');
        expect(resolveReleaseReviewRequest(request(undefined, 'release123.review.example.com'), suffix).kind).toBe('reject');
    });
    test('keeps provider redirects on the validated public review origin', async () => {
        const incoming = request('release123.review.example.com');
        const route = resolveReleaseReviewRequest(incoming, suffix);
        if (route.kind !== 'review') throw new Error('Expected isolated review');
        const target = { deploymentUrl: 'https://frozen-site.vercel.app', deploymentId: 'deployment', hash: 'hash' };
        const originalFetch = globalThis.fetch;
        const mocked = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(async () =>
            new Response(null, { status: 302, headers: { Location: '/next?more=1' } }), { preconnect: originalFetch.preconnect }));
        try {
            const response = await proxyReleaseReview(new Request(route.publicUrl, incoming), {
                target, path: [], bypass: 'test-bypass', reauthorize: async () => target,
                verifyProvider: async () => undefined,
            });
            expect(response.status).toBe(302);
            expect(response.headers.get('location')).toBe('https://release123.review.example.com/next?more=1');
        } finally { mocked.mockRestore(); }
    });
    test('accepts canonical HTTPS review authority and ordinary local app ports', () => {
        for (const host of ['release123.review.example.com', 'RELEASE123.REVIEW.EXAMPLE.COM:443']) {
            const result = resolveReleaseReviewRequest(request(host), suffix);
            expect(result.kind).toBe('review');
            if (result.kind === 'review') expect(result.publicUrl.origin).toBe('https://release123.review.example.com');
        }
        for (const host of ['localhost:3000', '127.0.0.1:8080', '[::1]:3000', 'app.example.com:8443'])
            expect(resolveReleaseReviewRequest(request(host), suffix).kind).toBe('app');
    });
    test('rejects malformed or ambiguous authority before falling through to app authentication', () => {
        for (const host of [undefined, '', 'release123.review.example.com, app.example.com',
            'release123.review.example.com:443:443', 'user@release123.review.example.com',
            'release123.review.example.com/path', 'release123.review.example.com?app',
            'release123.review.example.com#app', 'release123.review.example.com\\app',
            'release123.review.example.com.', 'release123..review.example.com',
            'release123%2ereview.example.com', 'release123.review.example.com:0',
            'release123.review.example.com:0443', 'release123.review.example.com:65536']) {
            expect(resolveReleaseReviewRequest(request(host), suffix).kind).toBe('reject');
        }
    });
    test('rejects review apex, nested releases and non-HTTPS ports instead of serving the app', () => {
        for (const host of ['review.example.com', 'a.b.review.example.com',
            'release123.review.example.com:80', 'release123.review.example.com:8080'])
            expect(resolveReleaseReviewRequest(request(host), suffix).kind).toBe('reject');
    });
});
