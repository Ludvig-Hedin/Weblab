import { NextResponse } from 'next/server';

import { users } from '@weblab/db';
import { db } from '@weblab/db/src/client';
import { extractNames } from '@weblab/utility';

import { trackEvent } from '@/utils/analytics/server';
import { Routes } from '@/utils/constants';
import { createClient } from '@/utils/supabase/server';
import { sanitizeReturnUrl } from '@/utils/url';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    // returnUrl is propagated through the OAuth provider via redirectTo query.
    // Sanitize before re-emitting so we never trust a foreign origin / open redirect.
    const rawReturnUrl = searchParams.get('returnUrl');
    const safeReturnUrl = sanitizeReturnUrl(rawReturnUrl, { origin });
    const returnUrlParam = rawReturnUrl ? `?returnUrl=${encodeURIComponent(safeReturnUrl)}` : '';

    if (code) {
        try {
            const supabase = await createClient();
            const { error, data } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
                const displayName =
                    data.user.user_metadata.name ??
                    data.user.user_metadata.display_name ??
                    data.user.user_metadata.full_name ??
                    data.user.user_metadata.first_name ??
                    data.user.user_metadata.last_name ??
                    data.user.user_metadata.given_name ??
                    data.user.user_metadata.family_name ??
                    '';
                const { firstName, lastName } = extractNames(displayName);

                await db
                    .insert(users)
                    .values({
                        id: data.user.id,
                        firstName,
                        lastName,
                        displayName,
                        email: data.user.email,
                        avatarUrl: data.user.user_metadata.avatar_url,
                    })
                    .onConflictDoUpdate({
                        target: [users.id],
                        set: {
                            firstName,
                            lastName,
                            displayName,
                            email: data.user.email,
                            avatarUrl: data.user.user_metadata.avatar_url,
                            updatedAt: new Date(),
                        },
                    });

                trackEvent({
                    distinctId: data.user.id,
                    event: 'user_signed_in',
                    properties: {
                        name: data.user.user_metadata.name,
                        email: data.user.email,
                        avatar_url: data.user.user_metadata.avatar_url,
                        $set_once: {
                            signup_date: new Date().toISOString(),
                        },
                    },
                });

                return NextResponse.redirect(`${origin}${Routes.AUTH_REDIRECT}${returnUrlParam}`);
            }
            console.error('Error exchanging code for session', {
                message: error.message,
                status: error.status,
                name: error.name,
            });
        } catch (error) {
            console.error('Error handling auth callback', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
