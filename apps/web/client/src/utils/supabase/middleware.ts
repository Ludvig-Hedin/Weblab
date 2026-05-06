import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { env } from '@/env';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
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
                    cookiesToSet.forEach(({ name, value, options }) =>
                        request.cookies.set(name, value),
                    );
                    supabaseResponse = NextResponse.next({
                        request,
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
                setTimeout(() => reject(new Error('Supabase auth refresh timed out')), 5000),
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
