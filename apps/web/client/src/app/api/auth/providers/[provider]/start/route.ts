import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';
import { getOAuthConfig, isProviderConfigured, parseProvider } from '../../_lib/oauth-config';
import { deriveChallenge, generateState, generateVerifier } from '../../_lib/pkce';

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
        return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
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
    const redirectTo = request.nextUrl.searchParams.get('redirectTo') ?? '/projects';

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
