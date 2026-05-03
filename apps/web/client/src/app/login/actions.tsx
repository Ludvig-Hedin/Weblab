'use server';

import { env } from '@/env';
import { Routes } from '@/utils/constants';
import { trackEvent } from '@/utils/analytics/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { SEED_USER, users } from '@weblab/db';
import { db } from '@weblab/db/src/client';
import { SignInMethod } from '@weblab/models';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(provider: SignInMethod.GITHUB | SignInMethod.GOOGLE) {
    const supabase = await createClient();
    const origin = (await headers()).get('origin') ?? env.NEXT_PUBLIC_SITE_URL;
    const redirectTo = `${origin}${Routes.AUTH_CALLBACK}`;

    // If already session, redirect
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (session) {
        redirect(Routes.AUTH_REDIRECT);
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
        redirect('/error');
    }

    redirect(data.url);
}

export async function devLogin() {
    if (!env.NEXT_PUBLIC_SHOW_DEV_LOGIN) {
        throw new Error('Dev login is disabled in this environment');
    }

    const localBackendHint =
        'Local Supabase backend is unavailable. Start it with `bun backend:start` and wait for ports 54321 and 54322 to be ready.';

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

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
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: SEED_USER.EMAIL,
        password: SEED_USER.PASSWORD,
    });

    if (error) {
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
