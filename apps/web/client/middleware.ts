import { resolveReleaseReviewRequest, secureReleaseReviewResponse } from './src/lib/cloud-releases/review-routing';
import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Post-migration middleware: Clerk-only. Supabase session-refresh path is
// gone. WEBLAB_AUTH_PROVIDER env flag is retained in env.ts for emergency
// rollback only; this file no longer reads it.
//
// Lives at the package root rather than `src/` because Next.js resolves
// middleware from the project root first; keeping both files in sync via a
// re-export tripped Clerk's "clerkMiddleware was not run" check because the
// transitive default import doesn't satisfy Clerk's module-identity probe.
// Inlining here is the safest pattern until we collapse on a single location.

// path-to-regexp v8 (Next.js 15.2+) forbids lookaheads and capturing groups in
// matcher config, so exclusions are handled here instead.
const SKIP_PREFIXES = [
    '/api/trpc',
    '/api/chat',
    '/api/ai',
    '/api/chat-images',
    '/api/health',
    '/_next/static',
    '/_next/image',
];

const SKIP_EXACT = new Set([
    '/favicon.ico',
    '/sw.js',
    '/manifest.webmanifest',
    '/manifest.json',
    '/robots.txt',
    '/sitemap.xml',
    '/weblab-preload-script.js',
]);

const SKIP_EXT = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json|webmanifest|map|txt|woff|woff2|ttf)$/i;

const appMiddleware = clerkMiddleware(async (_auth, request: NextRequest) => {
    const { pathname } = request.nextUrl;


    if (
        SKIP_EXACT.has(pathname) ||
        SKIP_EXT.test(pathname) ||
        SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
    ) {
        return NextResponse.next();
    }

    if (pathname === '/' && request.headers.get('user-agent')?.includes('WeblabDesktop')) {
        const redirectUrl = new URL('/sign-in', request.url);
        redirectUrl.searchParams.set('native', '1');
        return NextResponse.redirect(redirectUrl);
    }

    const requestHeaders = new Headers(request.headers);
    // Include the query string — layouts build sign-in returnUrls from this
    // header, and pathname alone drops e.g. `?tab=members` deep-link state.
    requestHeaders.set('x-pathname', pathname + request.nextUrl.search);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (pathname === '/cloud-review' || pathname.startsWith('/cloud-review/')) {
        response.headers.set('Cache-Control', 'private, no-store');
        // Preserve the app Origin on the cross-origin POST ticket exchange.
        response.headers.set('Referrer-Policy', 'strict-origin');
    }
    return response;
});

/** Designer code is served without a general app/Clerk session on the isolated review origin. */
export default function middleware(request: NextRequest, event: NextFetchEvent) {
    const suffix = process.env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX;
    const review = resolveReleaseReviewRequest(request, suffix);
    if (review.kind === 'reject') return secureReleaseReviewResponse(new NextResponse(null, { status: 404 }), true);
    if (review.kind === 'review') {
        const target = request.nextUrl.clone(); target.pathname = review.pathname;
        return secureReleaseReviewResponse(NextResponse.rewrite(target));
    }
    return appMiddleware(request, event);
}

export const config = {
    matcher: ['/:path*'],
};
