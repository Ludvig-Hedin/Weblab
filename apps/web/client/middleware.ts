import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { updateSession } from '@/utils/supabase/middleware';

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

// Public root assets that must never trigger a session refresh.
// Without this, the SW (`/sw.js`) and PWA manifest install in prod each
// burned a full middleware Supabase round-trip (and on slow Railway →
// Supabase egress, hit the 8s refresh timeout) before the browser could
// even mount, polluting logs and slowing page loads.
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

// Phase 5: the shared inner handler. Runs after the appropriate auth wrapper
// (Clerk or none) has set up its context. Under Supabase mode the wrapper is
// a plain pass-through so we don't pay Clerk's per-request cost (and don't
// crash when CLERK_SECRET_KEY is not configured).
const handler = async (request: NextRequest) => {
    const { pathname } = request.nextUrl;

    if (
        SKIP_EXACT.has(pathname) ||
        SKIP_EXT.test(pathname) ||
        SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
    ) {
        return NextResponse.next();
    }

    // Desktop Electron shell tags its WebContents UA with `WeblabDesktop/<v>`
    // (apps/desktop/main.js). When that shell lands on `/` — the marketing
    // landing — bounce it to the active sign-in page so it feels like an
    // app, not a browser bookmark. `/login` already routes authed users to
    // `/projects`, so a single hop covers both states.
    if (pathname === '/' && request.headers.get('user-agent')?.includes('WeblabDesktop')) {
        const target = process.env.WEBLAB_AUTH_PROVIDER === 'clerk' ? '/sign-in' : '/login';
        const redirectUrl = new URL(target, request.url);
        redirectUrl.searchParams.set('native', '1');
        return NextResponse.redirect(redirectUrl);
    }

    const provider = process.env.WEBLAB_AUTH_PROVIDER === 'clerk' ? 'clerk' : 'supabase';

    if (provider === 'clerk') {
        // Clerk owns the session. Don't touch Supabase cookies — they're
        // either absent or stale. Still forward `x-pathname` so server
        // components like `projects/layout.tsx` can build a correct
        // `returnUrl` after the sign-in redirect (without this every
        // anon visit was bounced back to `/projects` instead of the
        // path the user originally requested).
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-pathname', pathname);
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // /api/auth/* is intentionally NOT skipped — the cookie refresh completes
    // the Supabase sign-in handshake. tRPC/chat/AI run their own auth via
    // createTRPCContext and don't need middleware-level refresh.
    return updateSession(request);
};

// Only wrap with `clerkMiddleware` when Clerk is the active provider. Wrapping
// unconditionally requires `CLERK_SECRET_KEY` at runtime — without it, Clerk
// throws "Missing publishable/secret key" on every request before the inner
// handler can run, which used to brick every supabase-mode deploy that hadn't
// also been provisioned with Clerk credentials.
export default process.env.WEBLAB_AUTH_PROVIDER === 'clerk'
    ? clerkMiddleware(async (_auth, request) => handler(request))
    : handler;

export const config = {
    matcher: ['/:path*'],
};
