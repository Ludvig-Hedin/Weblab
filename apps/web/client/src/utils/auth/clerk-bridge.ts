import 'server-only';

import { cache } from 'react';
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

import type { BridgedUser } from '@/utils/auth/types';

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
    if (!token) return null;

    // Reuse Clerk's primary email for the synthetic user shape — Convex stores
    // the same value but Clerk is the canonical source of truth.
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress;

    let convexUser = await fetchQuery(api.users.getByClerkId, { clerkUserId: userId }, { token });

    if (!convexUser) {
        // Webhook lag fallback: run the JIT mutation once, then re-read.
        await fetchMutation(api.users.ensureCurrent, {}, { token });
        convexUser = await fetchQuery(api.users.getByClerkId, { clerkUserId: userId }, { token });
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
            first_name: convexUser.firstName ?? clerkUser.firstName ?? undefined,
            last_name: convexUser.lastName ?? clerkUser.lastName ?? undefined,
            full_name:
                convexUser.displayName ??
                ([clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || undefined),
            avatar_url: convexUser.avatarUrl ?? clerkUser.imageUrl ?? undefined,
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
