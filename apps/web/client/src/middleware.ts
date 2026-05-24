import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

// Post-migration middleware: Clerk-only. Supabase session-refresh path is
// gone. WEBLAB_AUTH_PROVIDER env flag is retained in env.ts for emergency
// rollback only; this file no longer reads it.

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

export default clerkMiddleware(async (_auth, request) => {
    const { pathname } = request.nextUrl;

    if (
        SKIP_EXACT.has(pathname) ||
        SKIP_EXT.test(pathname) ||
        SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
    ) {
        return NextResponse.next();
    }

    // Desktop Electron shell tags its WebContents UA with `WeblabDesktop/<v>`.
    // When that shell lands on `/` (marketing landing), bounce it to /sign-in
    // so it feels like an app, not a browser bookmark. /sign-in routes authed
    // users to /projects, so a single hop covers both states.
    if (pathname === '/' && request.headers.get('user-agent')?.includes('WeblabDesktop')) {
        const redirectUrl = new URL('/sign-in', request.url);
        redirectUrl.searchParams.set('native', '1');
        return NextResponse.redirect(redirectUrl);
    }

    // Forward x-pathname so server components like `projects/layout.tsx` can
    // build a correct `returnUrl` after the sign-in redirect.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
    matcher: ['/:path*'],
};
