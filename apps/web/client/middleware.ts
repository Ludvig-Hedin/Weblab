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

const SKIP_EXT = /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i;

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (
        pathname === '/favicon.ico' ||
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
