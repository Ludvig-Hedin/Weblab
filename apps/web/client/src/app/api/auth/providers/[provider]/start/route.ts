import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';
import { getOAuthConfig, isProviderConfigured, parseProvider } from '../../_lib/oauth-config';
import { deriveChallenge, generateState, generateVerifier } from '../../_lib/pkce';

/**
 * True iff `value` is a same-origin path safe to use as a post-OAuth redirect.
 * Rejects absolute URLs (`https://…`), protocol-relative URLs (`//evil.com`),
 * and anything that doesn't start with a single `/`. A raw `/` is allowed
 * because that's the project root.
 */
function isSameOriginPath(value: string | null): boolean {
    if (!value) return false;
    if (!value.startsWith('/')) return false;
    if (value.startsWith('//')) return false;
    return true;
}

/**
 * Begin an OAuth flow with one of the supported CLI providers. Generates a
 * PKCE verifier, drops it (plus the original `redirectTo`) in HTTP-only
 * cookies, then redirects to the provider's authorization endpoint. The
 * callback route below picks up the verifier from the cookie jar and
 * exchanges the code.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
    const { provider: rawProvider } = await params;
    const provider = parseProvider(rawProvider);
    if (!provider) {
        return NextResponse.json({ error: 'unknown_provider' }, { status: 404 });
    }

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
        // This route is reached via top-level navigation (e.g. settings link),
        // so a JSON 401 leaves the user staring at a raw error page with no
        // way back. Redirect to login with a returnUrl so they can recover.
        const loginUrl = new URL('/login', request.nextUrl.origin);
        loginUrl.searchParams.set('returnUrl', request.nextUrl.pathname + request.nextUrl.search);
        return NextResponse.redirect(loginUrl.toString());
    }

    if (!isProviderConfigured(provider)) {
        return NextResponse.json(
            {
                error: 'provider_not_configured',
                detail: `Set ${provider.toUpperCase()}_OAUTH_CLIENT_ID and ${provider.toUpperCase()}_OAUTH_CLIENT_SECRET in env.`,
            },
            { status: 503 },
        );
    }

    const config = getOAuthConfig(provider);
    if (!config) {
        return NextResponse.json({ error: 'unknown_provider' }, { status: 404 });
    }

    const verifier = generateVerifier();
    const challenge = deriveChallenge(verifier);
    const state = generateState();
    // SECURITY: only accept same-origin paths. An attacker who can lure the
    // user to /api/auth/providers/<p>/start?redirectTo=https://evil.com would
    // otherwise plant the value in a httpOnly cookie that the callback then
    // resolves with `new URL(redirectTo, origin)`. `new URL('https://evil',
    // origin)` returns the absolute URL — the callback's redirect would
    // happily 302 cross-origin. Restrict to root-relative paths.
    const rawRedirect = request.nextUrl.searchParams.get('redirectTo');
    const redirectTo = isSameOriginPath(rawRedirect) ? rawRedirect! : '/projects';

    const callbackUrl = new URL(`/api/auth/providers/${provider}/callback`, request.nextUrl.origin);

    const authUrl = new URL(config.authorizationUrl);
    authUrl.searchParams.set('client_id', config.clientId!);
    authUrl.searchParams.set('redirect_uri', callbackUrl.toString());
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    if (config.offline) {
        // Google uses access_type=offline + prompt=consent to ensure a refresh
        // token comes back even on repeat consent. The other providers will
        // need their own analogue once we wire them up.
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
    }

    const response = NextResponse.redirect(authUrl.toString());
    const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: request.nextUrl.protocol === 'https:',
        path: '/api/auth/providers',
        maxAge: 600,
    };
    response.cookies.set(`provider_oauth_verifier_${provider}`, verifier, cookieOptions);
    response.cookies.set(`provider_oauth_state_${provider}`, state, cookieOptions);
    response.cookies.set(`provider_oauth_redirect_${provider}`, redirectTo, cookieOptions);
    return response;
}
