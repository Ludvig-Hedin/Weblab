import 'server-only';

import { cache } from 'react';
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

import type { BridgedUser } from '@/utils/auth/types';

// Convex surfaces token-rejection errors with this shape when the JWT can't
// be verified — usually a Clerk dashboard / Convex JWT-template mismatch,
// a rotated signing key, or a token that expired mid-render. We catch
// these and return null from `loadBridgedUser` so pages treat the request
// as signed-out (and the user can re-authenticate) instead of bubbling to
// the root error boundary as a generic crash.
function isConvexUnauthenticated(err: unknown): boolean {
    if (!err) return false;
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    // Convex throws `ConvexError` with `code: 'Unauthenticated'`, but in many
    // call paths the SDK re-wraps it as a plain Error whose `.message` is the
    // serialized payload. Match either shape.
    if (/Unauthenticated|verify OIDC token claim|OIDC token/i.test(message)) {
        return true;
    }
    const code = (err as { code?: unknown })?.code;
    return code === 'Unauthenticated';
}

/**
 * Post-migration bridge: Clerk → Convex `users` row, returned in the legacy
 * Supabase `User` shape so existing call sites keep compiling. Anything
 * reading `user.id` now gets the Convex `_id` string (was Postgres UUID).
 *
 * Flow:
 *   1. Read Clerk identity via `auth()` (no Clerk session = null).
 *   2. Read Convex user row by clerkUserId (Clerk webhook keeps it in sync).
 *   3. If missing: call `users.ensureCurrent` to JIT-create, then re-read.
 *   4. Wrap in a synthetic Supabase `User` shape.
 */
async function loadBridgedUser(): Promise<BridgedUser | null> {
    const { userId, getToken } = await clerkAuth();
    if (!userId) return null;

    const token = await getToken({ template: 'convex' });
    if (!token) {
        // Loud server log: the only way `getToken({ template: 'convex' })`
        // returns null for a signed-in user is a Clerk dashboard
        // misconfiguration — the JWT template is missing or named something
        // other than `convex`. Silently returning null here makes every
        // protected RSC redirect to `/sign-in`, which then redirects back to
        // the protected route once Clerk reports the user as signed in,
        // looping forever with no visible error.
        console.error(
            '[clerk-bridge] Clerk getToken({ template: "convex" }) returned null for signed-in user %s. ' +
                'Check Clerk dashboard → JWT Templates: a template named "convex" must exist with the Convex issuer URL. ' +
                'Every protected route will redirect-loop until this is fixed.',
            userId,
        );
        return null;
    }

    // The Clerk Backend API lookup is DECORATIVE — it only enriches the
    // synthetic user shape with name/avatar fallbacks. The authoritative
    // identity is the already-verified Convex JWT (claims include name, email,
    // picture) plus the Convex `users` row. A failure here (Clerk API blip,
    // rate limit, or a FAPI/env misconfig that yields an empty body →
    // "JSON Parse error: Unexpected EOF") must NOT sign the user out: doing so
    // also short-circuits the JIT `users`-row creation below, which bricks
    // every downstream `requireUser` query (usage:get, etc.) with UNAUTHORIZED
    // and bounces a signed-in user back to the landing page. Degrade to using
    // the Convex row instead of failing the whole request.
    const client = await clerkClient();
    let clerkUser: Awaited<ReturnType<typeof client.users.getUser>> | null = null;
    try {
        clerkUser = await client.users.getUser(userId);
    } catch (err) {
        console.error(
            '[clerk-bridge] clerkClient.users.getUser failed for %s (non-fatal; falling back to Convex row + JWT claims)',
            userId,
            err,
        );
    }
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress;

    let convexUser;
    try {
        convexUser = await fetchQuery(api.users.getByClerkId, { clerkUserId: userId }, { token });
    } catch (err) {
        if (isConvexUnauthenticated(err)) {
            // JWT is present but Convex rejected it. The most common cause is
            // a Clerk dashboard misconfiguration ("convex" JWT template
            // missing / wrong issuer URL) or a signing-key rotation that hasn't
            // propagated. Falling through would crash every protected RSC with
            // "Unauthenticated"; instead, treat the request as signed-out so
            // the user lands on /sign-in and can re-authenticate to get a
            // fresh token.
            console.error(
                '[clerk-bridge] Convex rejected Clerk JWT for user %s. ' +
                    'Check Clerk dashboard → JWT Templates ("convex" template issuer must match the Convex deployment URL). ' +
                    'Falling back to signed-out.',
                userId,
                err,
            );
            return null;
        }
        // Any other error (network blip, Convex outage) is also non-recoverable
        // here — return null and let the protected-route guard redirect.
        console.error('[clerk-bridge] fetchQuery(users.getByClerkId) failed', err);
        return null;
    }

    if (!convexUser) {
        // Webhook lag fallback: run the JIT mutation once, then re-read.
        try {
            await fetchMutation(api.users.ensureCurrent, {}, { token });
            convexUser = await fetchQuery(
                api.users.getByClerkId,
                { clerkUserId: userId },
                { token },
            );
        } catch (err) {
            if (isConvexUnauthenticated(err)) {
                console.error(
                    '[clerk-bridge] Convex rejected JWT during JIT user create (Clerk template/issuer mismatch)',
                    err,
                );
            } else {
                console.error('[clerk-bridge] JIT users.ensureCurrent failed', err);
            }
            return null;
        }
    }
    if (!convexUser) return null;

    // Synthetic Supabase User shape — only the fields the codebase reads.
    const synthetic: BridgedUser = {
        id: convexUser._id,
        aud: 'authenticated',
        role: 'authenticated',
        email: convexUser.email ?? primaryEmail ?? '',
        app_metadata: { provider: 'clerk', providers: ['clerk'] },
        user_metadata: {
            first_name: convexUser.firstName ?? clerkUser?.firstName ?? undefined,
            last_name: convexUser.lastName ?? clerkUser?.lastName ?? undefined,
            full_name:
                convexUser.displayName ??
                ([clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') ||
                    undefined),
            avatar_url: convexUser.avatarUrl ?? clerkUser?.imageUrl ?? undefined,
        },
        identities: [],
        created_at: new Date(convexUser._creationTime).toISOString(),
        updated_at: new Date(convexUser.updatedAt).toISOString(),
    };
    return synthetic;
}

// Dedupe across calls within a single render pass / RSC request.
export const getClerkBridgedUser = cache(loadBridgedUser);

export async function getClerkUserId(): Promise<string | null> {
    const { userId } = await clerkAuth();
    return userId ?? null;
}

// Always active post-migration.
export const isClerkActive = (): boolean => true;
