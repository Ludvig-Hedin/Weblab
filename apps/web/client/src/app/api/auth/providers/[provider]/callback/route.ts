import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { userProviderConnections } from '@weblab/db';
import { db } from '@weblab/db/src/client';

import { encryptProviderToken } from '@/server/utils/provider-tokens';
import { createClient } from '@/utils/supabase/server';
import { getOAuthConfig, parseProvider } from '../../_lib/oauth-config';

/**
 * OAuth callback for a CLI provider sign-in. Verifies state, exchanges the
 * authorization code for tokens (PKCE verifier from the cookie jar), then
 * upserts an encrypted `user_provider_connections` row keyed on (user, provider).
 *
 * Redirects back to the `redirectTo` saved at the start of the flow on
 * success. On failure the same redirect is used with `?provider_oauth_error=…`.
 */

type TokenResponse = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
};

function decodeJwtEmail(idToken: string | undefined): string | null {
    if (!idToken) return null;
    const parts = idToken.split('.');
    if (parts.length < 2 || !parts[1]) return null;
    try {
        const payload = Buffer.from(
            parts[1].replace(/-/g, '+').replace(/_/g, '/'),
            'base64',
        ).toString('utf8');
        const parsed = JSON.parse(payload) as { email?: string };
        return parsed.email ?? null;
    } catch {
        return null;
    }
}

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

    const code = request.nextUrl.searchParams.get('code');
    const stateFromQuery = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');
    const cookieJar = request.cookies;
    const verifier = cookieJar.get(`provider_oauth_verifier_${provider}`)?.value;
    const stateCookie = cookieJar.get(`provider_oauth_state_${provider}`)?.value;
    // Defense in depth: the start route only sets same-origin paths, but a
    // tampered cookie or a future regression must not become an open redirect.
    const cookieRedirect = cookieJar.get(`provider_oauth_redirect_${provider}`)?.value;
    const redirectTo =
        cookieRedirect && cookieRedirect.startsWith('/') && !cookieRedirect.startsWith('//')
            ? cookieRedirect
            : '/projects';

    const finalRedirect = (queryError?: string) => {
        const target = new URL(redirectTo, request.nextUrl.origin);
        if (queryError) target.searchParams.set('provider_oauth_error', queryError);
        const response = NextResponse.redirect(target.toString());
        // Clear short-lived cookies regardless of outcome.
        for (const name of [
            `provider_oauth_verifier_${provider}`,
            `provider_oauth_state_${provider}`,
            `provider_oauth_redirect_${provider}`,
        ]) {
            response.cookies.set(name, '', {
                path: '/api/auth/providers',
                maxAge: 0,
            });
        }
        return response;
    };

    if (error) return finalRedirect(error);
    if (!code || !verifier || !stateFromQuery || stateFromQuery !== stateCookie) {
        return finalRedirect('invalid_callback');
    }

    const config = getOAuthConfig(provider);
    if (!config?.clientId || !config.clientSecret) {
        return finalRedirect('provider_not_configured');
    }

    const callbackUrl = new URL(`/api/auth/providers/${provider}/callback`, request.nextUrl.origin);
    const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl.toString(),
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: verifier,
    });

    let tokenResponse: TokenResponse;
    try {
        const res = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/json',
            },
            body: tokenBody.toString(),
        });
        if (!res.ok) return finalRedirect('token_exchange_failed');
        tokenResponse = (await res.json()) as TokenResponse;
    } catch {
        return finalRedirect('token_exchange_failed');
    }

    if (!tokenResponse.access_token) return finalRedirect('token_exchange_failed');

    const accessTokenEncrypted = encryptProviderToken(tokenResponse.access_token);
    const refreshTokenEncrypted = tokenResponse.refresh_token
        ? encryptProviderToken(tokenResponse.refresh_token)
        : null;
    const expiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null;
    const accountEmail = decodeJwtEmail(tokenResponse.id_token);

    const existing = await db
        .select({ id: userProviderConnections.id })
        .from(userProviderConnections)
        .where(
            and(
                eq(userProviderConnections.userId, userData.user.id),
                eq(userProviderConnections.provider, provider),
            ),
        )
        .limit(1);

    const existingId = existing[0]?.id;
    if (existingId) {
        await db
            .update(userProviderConnections)
            .set({
                accessTokenEncrypted,
                refreshTokenEncrypted,
                expiresAt,
                scopes: tokenResponse.scope ?? null,
                accountEmail,
                updatedAt: new Date(),
            })
            .where(eq(userProviderConnections.id, existingId));
    } else {
        await db.insert(userProviderConnections).values({
            userId: userData.user.id,
            provider,
            accessTokenEncrypted,
            refreshTokenEncrypted,
            expiresAt,
            scopes: tokenResponse.scope ?? null,
            accountEmail,
        });
    }

    return finalRedirect();
}
