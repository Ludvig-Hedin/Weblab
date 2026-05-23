import { headers } from 'next/headers';
import { eq, sql } from 'drizzle-orm';
import { Webhook } from 'svix';

import { authUsers, users } from '@weblab/db';
import { db } from '@weblab/db/src/client';

import type { WebhookEvent } from '@clerk/nextjs/server';
import { env } from '@/env';
import { createAdminClient } from '@/utils/supabase/admin';

interface ClerkUserShape {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    avatarUrl: string | null;
}

/**
 * Mirror the Clerk user into the Drizzle `users` table so the auth bridge
 * (which reads by email) and downstream tRPC routers stay in sync.
 *
 * On `user.created`: if no Drizzle row exists for the email, JIT-create the
 * Supabase auth.users row via the admin client (the existing trigger then
 * writes the public.users row) and patch metadata afterward.
 *
 * On `user.updated`: patch the existing row's profile fields. No-op if the
 * row is missing — the next sign-in's bridge call will JIT-create it.
 */
async function upsertDrizzleUser(user: ClerkUserShape): Promise<void> {
    const normalizedEmail = user.email.toLowerCase();
    const existing = await db.query.users.findFirst({
        where: sql`lower(${users.email}) = ${normalizedEmail}`,
    });
    const profile = {
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        displayName: user.displayName ?? undefined,
        avatarUrl: user.avatarUrl ?? undefined,
        updatedAt: new Date(),
    } satisfies Partial<typeof users.$inferInsert>;

    if (existing) {
        await db
            .update(users)
            .set(profile)
            .where(sql`lower(${users.email}) = ${normalizedEmail}`);
        return;
    }
    // Create Supabase auth row → trigger writes public.users → patch profile.
    // Stash `clerk_user_id` so the `user.deleted` webhook can recover the
    // Drizzle row by Clerk userId even after Clerk has purged the user.
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: {
            first_name: user.firstName ?? undefined,
            last_name: user.lastName ?? undefined,
            full_name: user.displayName ?? undefined,
            avatar_url: user.avatarUrl ?? undefined,
            clerk_user_id: user.id,
        },
    });
    if (error || !data.user) {
        // The trigger AND the bridge can both create the row. If the
        // create races with another path, fall back to a patch keyed by
        // email so the profile still lands.
        await db
            .update(users)
            .set(profile)
            .where(sql`lower(${users.email}) = ${normalizedEmail}`);
    }
}

async function findSupabaseUserIdByClerkUserId(clerkUserId: string): Promise<string | null> {
    // Bridge + webhook both stash `clerk_user_id` in `user_metadata` at
    // JIT-create time. Walk pages of auth.users (small user base — owner +
    // teammates) and match. This is the recovery path when Clerk has already
    // purged the user (user.deleted event payload omits email).
    const admin = createAdminClient();
    let page = 1;
    const perPage = 200;
    // Cap iteration so a corrupt user_metadata can't loop indefinitely.
    for (let i = 0; i < 25; i++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return null;
        const hit = data.users.find(
            (u) =>
                (u.user_metadata as { clerk_user_id?: string } | null)?.clerk_user_id ===
                clerkUserId,
        );
        if (hit) return hit.id;
        if (data.users.length < perPage) return null;
        page += 1;
    }
    return null;
}

async function deleteDrizzleUserByClerkUserId(clerkUserId: string): Promise<void> {
    // Try the easy path first: ask Clerk Backend API for the email. Works
    // when the webhook arrives before Clerk fully purges the user record,
    // which is the common case.
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    let email: string | null = null;
    try {
        const clerkUser = await client.users.getUser(clerkUserId);
        email = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
    } catch {
        // Clerk already purged — fall through to the metadata-stash recovery.
    }

    let targetSupabaseId: string | null = null;
    if (email) {
        const target = await db.query.users.findFirst({
            where: sql`lower(${users.email}) = ${email}`,
        });
        targetSupabaseId = target?.id ?? null;
    }
    if (!targetSupabaseId) {
        targetSupabaseId = await findSupabaseUserIdByClerkUserId(clerkUserId);
    }
    if (!targetSupabaseId) {
        console.warn(
            '[clerk/webhook] user.deleted: no Drizzle row found for clerkUserId=' + clerkUserId,
        );
        return;
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(targetSupabaseId);
    if (error) {
        // Last-resort fallback: drop the auth.users row via Drizzle so the
        // FK cascade still nukes public.users. Surface the error so Clerk
        // retries — Supabase's internal auth indexes may lag and a half-
        // deleted user is worse than a retried full delete.
        await db.delete(authUsers).where(eq(authUsers.id, targetSupabaseId));
        throw new Error(`Supabase admin delete failed: ${error.message}`);
    }
}

// Clerk → Convex user sync.
//
// Configure in Clerk Dashboard → Webhooks → Add Endpoint:
//   URL: https://<your-domain>/api/clerk/webhook
//   Events: user.created, user.updated, user.deleted
// Then set the signing secret as `CLERK_WEBHOOK_SECRET` (Railway + .env.local).
//
// Locally, this handler is inert until you forward webhooks via ngrok or
// equivalent. Phase 3/4 user provisioning runs through Convex JIT instead.

export async function POST(req: Request): Promise<Response> {
    const secret = env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        // Production must always have the secret configured; failing loud
        // surfaces misconfiguration to Clerk's retry queue instead of
        // silently swallowing events. In dev we accept-and-ignore so the
        // webhook surface doesn't accumulate noise when not yet wired.
        const status = env.NODE_ENV === 'production' ? 500 : 200;
        return new Response('webhook not configured', { status });
    }

    const headerPayload = await headers();
    const svixId = headerPayload.get('svix-id');
    const svixTimestamp = headerPayload.get('svix-timestamp');
    const svixSignature = headerPayload.get('svix-signature');
    if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response('missing svix headers', { status: 400 });
    }

    const body = await req.text();
    let evt: WebhookEvent;
    try {
        evt = new Webhook(secret).verify(body, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
        }) as WebhookEvent;
    } catch {
        return new Response('invalid signature', { status: 400 });
    }

    try {
        switch (evt.type) {
            case 'user.created':
            case 'user.updated': {
                const data = evt.data;
                const primaryEmail =
                    data.email_addresses?.find((e) => e.id === data.primary_email_address_id) ??
                    data.email_addresses?.[0];
                // `user.created` can fire before the user finishes email
                // verification. Without an email the row would be unfindable
                // later. Defer to the next `user.updated` event, which fires
                // once Clerk has the verified email.
                if (!primaryEmail?.email_address) {
                    return new Response('skipped: no email yet', { status: 202 });
                }
                const clerkProfile: ClerkUserShape = {
                    id: data.id,
                    email: primaryEmail.email_address,
                    firstName: data.first_name ?? null,
                    lastName: data.last_name ?? null,
                    displayName:
                        [data.first_name, data.last_name].filter(Boolean).join(' ') ||
                        primaryEmail.email_address,
                    avatarUrl: data.image_url ?? null,
                };
                // Sync the canonical Drizzle row. Convex `users` is dormant
                // during Phase 5 — Phase 4 wires Convex consumers and we'll
                // mirror there via a proper Convex `httpAction` then.
                await upsertDrizzleUser(clerkProfile);
                break;
            }
            case 'user.deleted': {
                const id = evt.data.id;
                if (!id) break;
                await deleteDrizzleUserByClerkUserId(id);
                break;
            }
            default:
                // Other event types (session.created, organization.*, etc.)
                // are unused today; accept-and-ignore so Clerk doesn't retry.
                break;
        }
    } catch (err) {
        console.error('[clerk/webhook] handler error', err);
        return new Response('handler error', { status: 500 });
    }

    return new Response('ok', { status: 200 });
}
