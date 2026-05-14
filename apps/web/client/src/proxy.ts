import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { Routes } from '@/utils/constants';
import { updateSession } from '@/utils/supabase/middleware';

export async function proxy(request: NextRequest) {
    // Supabase falls back to the project's Site URL ("/") when it can't honor
    // the requested `redirectTo` — e.g. a provider or Redirect-URL-allowlist
    // mismatch in the dashboard. That drops the OAuth `code` on the marketing
    // root, which has no exchange handler, so sign-in silently dead-ends on the
    // landing page. Bounce a root-path `?code=` to /auth/callback so the
    // exchange still runs. (This is a safety net — the underlying dashboard
    // misconfig should still be fixed.)
    if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.has('code')) {
        const callbackUrl = request.nextUrl.clone();
        callbackUrl.pathname = Routes.AUTH_CALLBACK;
        return NextResponse.redirect(callbackUrl);
    }

    // update user's auth session
    return await updateSession(request);
}

export const config = {
    matcher: [
        // Match every dynamic request except static assets and image files.
        // Wide matcher ensures session refresh runs everywhere a user can land.
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
