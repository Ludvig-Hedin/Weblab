import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
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

export default clerkMiddleware(async (_auth, request: NextRequest) => {
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
    requestHeaders.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
    matcher: ['/:path*'],
};
