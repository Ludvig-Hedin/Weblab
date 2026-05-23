'use server';

import { redirect } from 'next/navigation';

import type { SignInMethod } from '@weblab/models';
import { SEED_USER, users } from '@weblab/db';
import { db } from '@weblab/db/src/client';

import { env } from '@/env';
import { trackEvent } from '@/utils/analytics/server';
import { Routes } from '@/utils/constants';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { sanitizeReturnUrl } from '@/utils/url';

export async function login(
    provider: SignInMethod.GITHUB | SignInMethod.GOOGLE,
    returnUrl?: string | null,
    // Desktop shell: when true, the provider URL is returned to the renderer
    // instead of being redirected to in place, so it can be opened in the
    // user's real browser. See the `isDesktop` branches below.
    isDesktop = false,
): Promise<{ url: string } | void> {
    const supabase = await createClient();
    // Always use the configured site URL — request headers (Origin / Host) can
    // be wrong behind Railway/Docker proxies and have caused redirects to
    // 0.0.0.0:3000.
    const origin = env.NEXT_PUBLIC_SITE_URL;
    const sanitizedReturnUrl = sanitizeReturnUrl(returnUrl ?? null, { origin });
    // Encode returnUrl in OAuth redirectTo so it survives the provider round-trip
    // and is available in the auth callback route.
    //
    // Desktop: Supabase must redirect back through the `weblab://` custom
    // protocol. The OAuth provider screens run in the user's system browser;
    // the OS then hands `weblab://auth/callback?code=…` to the Electron shell,
    // which re-loads the canonical https `/auth/callback` inside the
    // BrowserWindow — the one cookie jar that holds the PKCE code_verifier set
    // by this server action. Keeping start + exchange in the same context is
    // what makes PKCE work. Web keeps the plain https callback.
    const callbackUrl = isDesktop
        ? new URL('weblab://auth/callback')
        : new URL(`${origin}${Routes.AUTH_CALLBACK}`);
    if (sanitizedReturnUrl !== Routes.HOME) {
        callbackUrl.searchParams.set('returnUrl', sanitizedReturnUrl);
    }
    const redirectTo = callbackUrl.toString();

    // If the user is already signed in, skip the OAuth round-trip and redirect.
    // Use getUser() (verified via Supabase Auth) rather than getSession() which
    // decodes a forgeable cookie.
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (user) {
        redirect(
            sanitizedReturnUrl !== Routes.HOME
                ? `${Routes.AUTH_REDIRECT}?returnUrl=${encodeURIComponent(sanitizedReturnUrl)}`
                : Routes.AUTH_REDIRECT,
        );
    }

    // Start OAuth flow
    // Note: User object will be created in the auth callback route if it doesn't exist
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo,
        },
    });

    if (error) {
        // Server-side log retained intentionally — debugging OAuth failures requires
        // visibility into the underlying error, and this runs on the server, not the browser.
        console.error('signInWithOAuth failed', {
            provider,
            code: error.code,
            message: error.message,
        });
        const code = error.code ?? 'unknown';
        redirect(`${Routes.AUTH_CODE_ERROR}?code=${encodeURIComponent(code)}`);
    }

    // Desktop: hand the provider URL back to the renderer, which opens it in
    // the system browser via the Electron preload bridge. Web: redirect in
    // place as before.
    if (isDesktop) {
        return { url: data.url };
    }

    redirect(data.url);
}

export async function devLogin(returnUrl?: string | null) {
    if (env.NODE_ENV === 'production') {
        throw new Error('Dev login is disabled in production');
    }
    if (!env.NEXT_PUBLIC_SHOW_DEV_LOGIN) {
        throw new Error('Dev login is disabled in this environment');
    }

    const fetchFailedHint =
        'Supabase backend is unavailable. Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct and the project is reachable.';

    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (session) {
        redirect(Routes.AUTH_REDIRECT);
    }

    const adminSupabase = createAdminClient();

    // Ensure the seed user exists. If not found by UUID, create it.
    // If creation fails because the email is already taken by a different
    // user, proceed anyway — generateLink works on the email regardless of UUID.
    const { data: existingUser } = await adminSupabase.auth.admin.getUserById(SEED_USER.ID);
    if (!existingUser.user) {
        const { error: createUserError } = await adminSupabase.auth.admin.createUser({
            id: SEED_USER.ID,
            email: SEED_USER.EMAIL,
            email_confirm: true,
            user_metadata: {
                name: SEED_USER.DISPLAY_NAME,
                display_name: SEED_USER.DISPLAY_NAME,
                first_name: SEED_USER.FIRST_NAME,
                last_name: SEED_USER.LAST_NAME,
                avatar_url: SEED_USER.AVATAR_URL,
            },
        });
        if (createUserError?.message === 'fetch failed') {
            throw new Error(fetchFailedHint);
        }
        // Ignore "User already registered" — email exists with a different UUID;
        // generateLink below will still work.
    }

    const origin = env.NEXT_PUBLIC_SITE_URL;
    const sanitizedReturnUrl = sanitizeReturnUrl(returnUrl ?? null, { origin });

    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: 'magiclink',
        email: SEED_USER.EMAIL,
    });

    if (linkError) {
        console.error('devLogin: generateLink failed', linkError);
        if (linkError.message === 'fetch failed') {
            throw new Error(fetchFailedHint);
        }
        throw new Error(`Demo sign-in failed: ${linkError.message}`);
    }

    const tokenHash =
        linkData?.properties && 'hashed_token' in linkData.properties
            ? linkData.properties.hashed_token
            : undefined;
    if (!tokenHash) {
        throw new Error('Demo sign-in failed: no token returned.');
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
    });
    if (verifyError) {
        console.error('devLogin: verifyOtp failed', verifyError);
        throw new Error(`Demo sign-in failed: ${verifyError.message}`);
    }

    const user = verifyData.user;
    if (!user?.email) {
        await supabase.auth.signOut();
        throw new Error('Demo sign-in failed: no user email returned.');
    }

    await db
        .insert(users)
        .values({
            id: user.id,
            firstName: SEED_USER.FIRST_NAME,
            lastName: SEED_USER.LAST_NAME,
            displayName: SEED_USER.DISPLAY_NAME,
            email: user.email,
            avatarUrl: SEED_USER.AVATAR_URL,
        })
        .onConflictDoUpdate({
            target: [users.id],
            set: {
                email: user.email,
                updatedAt: new Date(),
            },
        });

    const redirectTarget =
        sanitizedReturnUrl !== Routes.HOME
            ? `${Routes.AUTH_REDIRECT}?returnUrl=${encodeURIComponent(sanitizedReturnUrl)}`
            : Routes.AUTH_REDIRECT;
    redirect(redirectTarget);
}

export async function sendEmailOtp(email: string): Promise<{ error?: string }> {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
    });
    if (error) return { error: error.message };
    return {};
}

export async function verifyEmailOtp(
    email: string,
    token: string,
): Promise<{ redirectTo?: string; error?: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) return { error: error.message };

    const user = data.user;
    if (!user) {
        return { error: 'Verification succeeded but no user data was returned.' };
    }

    try {
        await db
            .insert(users)
            .values({
                id: user.id,
                firstName: '',
                lastName: '',
                displayName: user.email ?? '',
                email: user.email ?? '',
                avatarUrl: null,
            })
            .onConflictDoUpdate({
                target: [users.id],
                set: {
                    email: user.email ?? '',
                    updatedAt: new Date(),
                },
            });
    } catch (dbError) {
        // Mirror the OAuth callback route: if we can't persist the user row,
        // don't leave the auth cookie behind — that would let them past gates
        // whose tRPC procedures then 500 on the missing FK. Returning an error
        // (instead of throwing) keeps the verify page from rendering a 500.
        console.error('Error upserting user row in email OTP verify', {
            userId: user.id,
            error: dbError instanceof Error ? dbError.message : String(dbError),
        });
        await supabase.auth.signOut();
        return { error: "We couldn't sign you in. Please try again in a moment." };
    }

    trackEvent({
        distinctId: user.id,
        event: 'user_signed_in',
        properties: {
            $set_once: { signup_date: new Date().toISOString() },
        },
    });

    // Land on the projects dashboard directly for OTP signups. The previous
    // `Routes.AUTH_REDIRECT` chain went through `/auth/redirect`, which reads
    // a stale `returnUrl` from localforage left by an unrelated earlier
    // session — that produced unexpected destinations for first-time
    // signups arriving from an email link.
    return { redirectTo: Routes.PROJECTS };
}
