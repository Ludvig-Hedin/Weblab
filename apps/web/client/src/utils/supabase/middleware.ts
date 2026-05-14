import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import type { SetAllCookies } from '@supabase/ssr';
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
                setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
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

    // Fast path: a request carrying no Supabase auth cookie is definitively
    // signed out — there is no session to refresh, so skip the getUser()
    // network round-trip entirely. Without this, public pages (/, /login,
    // /privacy-policy) pay the full auth latency on every hit and hang for the
    // whole timeout window whenever the auth backend is slow or unreachable.
    const hasAuthCookie = request.cookies
        .getAll()
        .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'));
    if (!hasAuthCookie) {
        return supabaseResponse;
    }

    // Refresh the session. This MUST run to completion — it cannot be raced
    // against a timeout.
    //
    // When `getUser()` sees an expiring access token it refreshes it: Supabase
    // consumes the old refresh token server-side and issues a new pair, and the
    // `setAll` callback above writes those new cookies onto `supabaseResponse`.
    // A previous version raced this against an 8s timeout — but `Promise.race`
    // does not cancel the loser. On a slow (e.g. cold-starting) auth backend the
    // timeout would fire while the refresh was still in flight: the refresh then
    // *still completed at Supabase* (old refresh token consumed) but the rotated
    // cookies never reached the browser. Every subsequent request then presented
    // a dead refresh token and a stale access token → `getUser()` returns null →
    // 401 on every tRPC call and a bounce back to /login, even though sign-in
    // "worked". The session was permanently corrupted by the timeout itself.
    //
    // Slow-but-correct beats fast-but-broken. The no-auth-cookie fast path above
    // already keeps unauthenticated/public traffic off this round-trip, so only
    // signed-in requests pay the latency — and a genuinely cold auth backend is
    // an infra problem to fix at the source, not something to paper over here.
    try {
        await supabase.auth.getUser();
    } catch (error) {
        // A genuine failure (network refused, DNS, 5xx) does not run `setAll`,
        // so cookies are left untouched and the existing refresh token stays
        // valid for the next attempt — no corruption. Just log it.
        console.warn('[middleware] Supabase session refresh failed', {
            pathname: request.nextUrl.pathname,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return supabaseResponse;
}
