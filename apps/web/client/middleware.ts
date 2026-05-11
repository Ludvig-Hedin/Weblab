import { type NextRequest, NextResponse } from 'next/server';

import { updateSession } from '@/utils/supabase/middleware';

// path-to-regexp v8 (Next.js 15.2+) forbids lookaheads and capturing groups in
// matcher config, so exclusions are handled here instead.
const SKIP_PREFIXES = [
    '/api/trpc',
    '/api/chat',
    '/api/ai',
    '/api/chat-images',
    '/_next/static',
    '/_next/image',
];

// Public root assets that must never trigger a Supabase session refresh.
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

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (
        SKIP_EXACT.has(pathname) ||
        SKIP_EXT.test(pathname) ||
        SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
    ) {
        return NextResponse.next();
    }

    // /api/auth/* is intentionally NOT skipped — the cookie refresh completes
    // the Supabase sign-in handshake. tRPC/chat/AI run their own auth via
    // createTRPCContext and don't need middleware-level refresh.
    return updateSession(request);
}

export const config = {
    matcher: ['/:path*'],
};
