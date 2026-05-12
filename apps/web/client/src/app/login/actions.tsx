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
) {
    const supabase = await createClient();
    // Always use the configured site URL — request headers (Origin / Host) can
    // be wrong behind Railway/Docker proxies and have caused redirects to
    // 0.0.0.0:3000.
    const origin = env.NEXT_PUBLIC_SITE_URL;
    const sanitizedReturnUrl = sanitizeReturnUrl(returnUrl ?? null, { origin });
    // Encode returnUrl in OAuth redirectTo so it survives the provider round-trip
    // and is available in the auth callback route.
    const callbackUrl = new URL(`${origin}${Routes.AUTH_CALLBACK}`);
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

    redirect(data.url);
}

export async function devLogin() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Dev login is disabled in production');
    }
    if (!env.NEXT_PUBLIC_SHOW_DEV_LOGIN) {
        throw new Error('Dev login is disabled in this environment');
    }

    const localBackendHint =
        'Local Supabase backend is unavailable. Start it with `bun backend:start` and wait for ports 54321 and 54322 to be ready.';

    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (session) {
        redirect(Routes.AUTH_REDIRECT);
    }

    const adminSupabase = createAdminClient();
    const { data: existingUser } = await adminSupabase.auth.admin.getUserById(SEED_USER.ID);

    if (!existingUser.user) {
        const { error: createUserError } = await adminSupabase.auth.admin.createUser({
            id: SEED_USER.ID,
            email: SEED_USER.EMAIL,
            password: SEED_USER.PASSWORD,
            email_confirm: true,
            user_metadata: {
                first_name: SEED_USER.FIRST_NAME,
                last_name: SEED_USER.LAST_NAME,
                display_name: SEED_USER.DISPLAY_NAME,
                avatar_url: SEED_USER.AVATAR_URL,
            },
        });

        if (createUserError) {
            if (createUserError.message === 'fetch failed') {
                throw new Error(localBackendHint);
            }
            throw new Error(`Failed to create demo user: ${createUserError.message}`);
        }
    } else {
        // Reset password to known value — user may exist from a previous seed
        // with a different or corrupted password, causing signInWithPassword to fail.
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
            SEED_USER.ID,
            { password: SEED_USER.PASSWORD },
        );
        if (updateError) {
            throw new Error(`Failed to reset demo user password: ${updateError.message}`);
        }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: SEED_USER.EMAIL,
        password: SEED_USER.PASSWORD,
    });

    if (error) {
        // devLogin guards `NODE_ENV === 'production'` at the top; this branch
        // only runs in non-prod environments so logging is always safe.
        console.error('Error signing in with password:', error);
        if (error.message === 'fetch failed') {
            throw new Error(localBackendHint);
        }
        throw new Error(error.message);
    }

    const signedInUser = data.user;
    if (!signedInUser) {
        throw new Error('Demo user sign-in succeeded without a user payload.');
    }

    await db
        .insert(users)
        .values({
            id: signedInUser.id,
            email: signedInUser.email ?? SEED_USER.EMAIL,
            firstName: SEED_USER.FIRST_NAME,
            lastName: SEED_USER.LAST_NAME,
            displayName: SEED_USER.DISPLAY_NAME,
            avatarUrl: signedInUser.user_metadata.avatar_url ?? SEED_USER.AVATAR_URL,
        })
        .onConflictDoUpdate({
            target: [users.id],
            set: {
                email: signedInUser.email ?? SEED_USER.EMAIL,
                firstName: SEED_USER.FIRST_NAME,
                lastName: SEED_USER.LAST_NAME,
                displayName: SEED_USER.DISPLAY_NAME,
                avatarUrl: signedInUser.user_metadata.avatar_url ?? SEED_USER.AVATAR_URL,
                updatedAt: new Date(),
            },
        });

    return {
        redirectTo: Routes.AUTH_REDIRECT,
    };
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

    trackEvent({
        distinctId: user.id,
        event: 'user_signed_in',
        properties: {
            $set_once: { signup_date: new Date().toISOString() },
        },
    });

    return { redirectTo: Routes.AUTH_REDIRECT };
}
