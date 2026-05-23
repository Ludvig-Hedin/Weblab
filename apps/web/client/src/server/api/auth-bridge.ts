import 'server-only';

import { cache } from 'react';
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';

import { users } from '@weblab/db';
import { db } from '@weblab/db/src/client';

import type { User } from '@supabase/supabase-js';
import { env } from '@/env';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Bridges a Clerk-authenticated request to the existing Supabase-backed `users`
 * row so the rest of the app (routers, layouts, capability checks) keeps using
 * the same `User`-shaped object and the same Postgres UUID it always has.
 *
 * Strategy (single real user — the project owner):
 *   1. Read Clerk identity via `auth()`.
 *   2. Look up the matching `users` row by `email` (case-insensitive).
 *   3. If found: return a synthetic `User` populated from the Drizzle row.
 *   4. If not found: JIT-provision via the Supabase admin client (creates the
 *      `auth.users` row → trigger creates `public.users` row), then re-read.
 *
 * The returned shape mirrors `@supabase/supabase-js` `User` so existing
 * `protectedProcedure` consumers continue working unchanged.
 */
async function lookupUserByEmail(email: string) {
    // Case-insensitive lookup so legacy rows with mixed-case email don't lock
    // out otherwise-valid Clerk identities.
    return db.query.users.findFirst({
        where: sql`lower(${users.email}) = ${email}`,
    });
}

async function loadBridgedUser(): Promise<User | null> {
    const { userId } = await clerkAuth();
    if (!userId) return null;

    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress;
    if (!primaryEmail) return null;

    const normalizedEmail = primaryEmail.toLowerCase();
    let drizzleUser = await lookupUserByEmail(normalizedEmail);

    if (!drizzleUser) {
        // JIT provision: create the Supabase auth user with a matching email.
        // The `0025_auth_user_trigger.sql` trigger then writes the public.users
        // row. We re-read after to capture the generated UUID.
        //
        // We also stash `clerk_user_id` in `user_metadata` so the Clerk
        // user.deleted webhook can recover the Supabase UUID even after Clerk
        // has purged the user (the webhook payload is only `{ id, deleted }`
        // — no email — so without this stash, dashboard-initiated deletes
        // would orphan Drizzle rows).
        const admin = createAdminClient();
        const { data, error } = await admin.auth.admin.createUser({
            email: normalizedEmail,
            email_confirm: true,
            user_metadata: {
                first_name: clerkUser.firstName ?? undefined,
                last_name: clerkUser.lastName ?? undefined,
                full_name:
                    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
                    undefined,
                avatar_url: clerkUser.imageUrl ?? undefined,
                clerk_user_id: userId,
            },
        });
        if (error || !data.user) {
            // Distinguish "concurrent request beat us" (race-safe, recoverable)
            // from "Supabase admin API is down" (real failure). The unique-
            // constraint code shows up as a 422 with `code: 'email_exists'`
            // or a Postgres 23505. Anything else: bail loud so we don't
            // pretend a sign-in succeeded when the upstream is broken.
            const code = error && 'code' in error ? (error as { code?: string }).code : undefined;
            const status =
                error && 'status' in error ? (error as { status?: number }).status : undefined;
            const isRace = code === 'email_exists' || code === '23505' || status === 422;
            if (!isRace) {
                console.error('[auth-bridge] JIT create failed (non-race)', error);
                return null;
            }
            drizzleUser = await lookupUserByEmail(normalizedEmail);
            if (!drizzleUser) {
                console.error('[auth-bridge] race recovery lookup empty', { error });
                return null;
            }
        } else {
            drizzleUser = await db.query.users.findFirst({
                where: eq(users.id, data.user.id),
            });
            if (!drizzleUser) return null;
        }
    }

    // Construct a synthetic Supabase User. Only the fields the codebase
    // actually reads are populated. Extras default to safe values.
    const synthetic: User = {
        id: drizzleUser.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: drizzleUser.email ?? normalizedEmail,
        app_metadata: {
            provider: 'clerk',
            providers: ['clerk'],
        },
        user_metadata: {
            first_name: drizzleUser.firstName ?? clerkUser.firstName ?? undefined,
            last_name: drizzleUser.lastName ?? clerkUser.lastName ?? undefined,
            full_name:
                drizzleUser.displayName ??
                ([clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || undefined),
            avatar_url: drizzleUser.avatarUrl ?? clerkUser.imageUrl ?? undefined,
        },
        identities: [],
        created_at: drizzleUser.createdAt.toISOString(),
        updated_at: drizzleUser.updatedAt.toISOString(),
    };
    return synthetic;
}

// `cache()` dedupes the bridge result across calls within a single React
// render pass / RSC request. Nested layouts and the tRPC context creator both
// reach for the bridged user; without dedupe each call hits Clerk's API +
// Drizzle separately.
export const getClerkBridgedUser = cache(loadBridgedUser);

// Also re-exported so the user.delete mutation can call the Clerk Backend
// API directly when it needs to delete the Clerk identity in lockstep with
// the Drizzle row.
export async function getClerkUserId(): Promise<string | null> {
    const { userId } = await clerkAuth();
    return userId ?? null;
}

export const isClerkActive = (): boolean => env.WEBLAB_AUTH_PROVIDER === 'clerk';
