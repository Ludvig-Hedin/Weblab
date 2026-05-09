import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { env } from '@/env';

export async function updateSession(request: NextRequest) {
    // Clone request headers (NextRequest.headers is read-only; mutating it
    // directly throws at runtime). Forward x-pathname so downstream Server
    // Components can preserve deep-link returnUrls after redirects.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', request.nextUrl.pathname);

    let supabaseResponse = NextResponse.next({
        request: { headers: requestHeaders },
    });

    const supabase = createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value),
                    );
                    // Re-create with our modified headers so x-pathname is
                    // preserved even when Supabase refreshes the session.
                    supabaseResponse = NextResponse.next({
                        request: { headers: requestHeaders },
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // Refresh the auth token, but never let a stalled auth provider block the whole request.
    try {
        await Promise.race([
            supabase.auth.getUser(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Supabase auth refresh timed out')), 2000),
            ),
        ]);
    } catch (error) {
        console.warn('[middleware] Supabase session refresh failed', {
            pathname: request.nextUrl.pathname,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return supabaseResponse;
}
