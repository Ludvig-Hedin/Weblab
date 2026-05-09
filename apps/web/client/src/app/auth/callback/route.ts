import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { users } from '@weblab/db';
import { db } from '@weblab/db/src/client';
import { extractNames } from '@weblab/utility';

import { env } from '@/env';
import { trackEvent } from '@/utils/analytics/server';
import { Routes } from '@/utils/constants';
import { createClient } from '@/utils/supabase/server';
import { sanitizeReturnUrl } from '@/utils/url';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    // Use the configured site URL — request.url's host can resolve to the
    // internal container hostname (0.0.0.0:3000) behind proxies.
    const origin = env.NEXT_PUBLIC_SITE_URL;
    const code = searchParams.get('code');
    // returnUrl is propagated through the OAuth provider via redirectTo query.
    // Sanitize before re-emitting so we never trust a foreign origin / open redirect.
    const rawReturnUrl = searchParams.get('returnUrl');
    const safeReturnUrl = sanitizeReturnUrl(rawReturnUrl, { origin });
    const returnUrlParam = rawReturnUrl ? `?returnUrl=${encodeURIComponent(safeReturnUrl)}` : '';

    if (code) {
        const supabase = await createClient();
        try {
            const { error, data } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
                // Some OAuth providers (e.g. GitHub with private email enabled)
                // return a user without an email. The `users.email` column is
                // NOT NULL, so an upsert without one will throw and leave the
                // session in a split-brain state (Supabase auth row exists, but
                // no matching public.users row). Sign the user out and bounce
                // them to the error page with an explicit reason.
                if (!data.user.email) {
                    await supabase.auth.signOut();
                    return NextResponse.redirect(
                        `${origin}/auth/auth-code-error?reason=missing_email`,
                    );
                }
                if (!data.user.id) {
                    // Defensive: Supabase contracts guarantee an id when an
                    // email is present, but a stale or partial response would
                    // otherwise break the upsert below with a NOT NULL violation.
                    await supabase.auth.signOut();
                    return NextResponse.redirect(
                        `${origin}/auth/auth-code-error?reason=missing_user_id`,
                    );
                }

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

                try {
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
                                // Preserve user-edited values: only fall back to the
                                // OAuth-provided value when the existing column is
                                // NULL or an empty string. EXCLUDED refers to the
                                // values from the failed INSERT above.
                                firstName: sql`COALESCE(NULLIF(${users.firstName}, ''), EXCLUDED.first_name)`,
                                lastName: sql`COALESCE(NULLIF(${users.lastName}, ''), EXCLUDED.last_name)`,
                                displayName: sql`COALESCE(NULLIF(${users.displayName}, ''), EXCLUDED.display_name)`,
                                avatarUrl: sql`COALESCE(NULLIF(${users.avatarUrl}, ''), EXCLUDED.avatar_url)`,
                                email: data.user.email,
                                updatedAt: new Date(),
                            },
                        });
                } catch (dbError) {
                    // If we can't persist the user row, do not leave the auth
                    // cookie behind — that would let them through gates whose
                    // tRPC procedures will then 500 on the missing FK.
                    console.error('Error upserting user row in auth callback', {
                        userId: data.user.id,
                        error: dbError instanceof Error ? dbError.message : String(dbError),
                    });
                    await supabase.auth.signOut();
                    return NextResponse.redirect(
                        `${origin}/auth/auth-code-error?reason=db_upsert_failed`,
                    );
                }

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
            // Best-effort cleanup so a failed callback never leaves a
            // session cookie attached to a half-created account.
            try {
                await supabase.auth.signOut();
            } catch {
                /* swallow — already in the error path */
            }
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
