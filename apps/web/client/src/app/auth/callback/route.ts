import { trackEvent } from '@/utils/analytics/server';
import { Routes } from '@/utils/constants';
import { createClient } from '@/utils/supabase/server';
import { users } from '@weblab/db';
import { db } from '@weblab/db/src/client';
import { extractNames } from '@weblab/utility';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
        try {
            const supabase = await createClient();
            const { error, data } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
                const displayName = data.user.user_metadata.name
                    ?? data.user.user_metadata.display_name
                    ?? data.user.user_metadata.full_name
                    ?? data.user.user_metadata.first_name
                    ?? data.user.user_metadata.last_name
                    ?? data.user.user_metadata.given_name
                    ?? data.user.user_metadata.family_name
                    ?? '';
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

                return NextResponse.redirect(`${origin}${Routes.AUTH_REDIRECT}`);
            }
            console.error(`Error exchanging code for session: ${error}`);
        } catch (error) {
            console.error('Error handling auth callback:', error);
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
