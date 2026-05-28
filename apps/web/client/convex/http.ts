import { httpRouter } from 'convex/server';
import { Webhook } from 'svix';

import type { WebhookEvent } from '@clerk/backend';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

// Convex HTTP endpoints. Configure the Clerk dashboard webhook to point at
// `https://<deployment>.convex.site/clerk-webhook`.
//
// Stripe webhook stub lives here as a placeholder for a future slice — it's
// disabled until subscriptions.ts ships its internal mutations.

const http = httpRouter();

// ─── Clerk webhook ───────────────────────────────────────────────────────────
http.route({
    path: '/clerk-webhook',
    method: 'POST',
    handler: httpAction(async (ctx, request) => {
        const secret = process.env.CLERK_WEBHOOK_SECRET;
        if (!secret) {
            // Fail loud so Clerk's retry queue surfaces the misconfig
            // instead of silently dropping events.
            return new Response('webhook not configured: CLERK_WEBHOOK_SECRET missing', {
                status: 500,
            });
        }

        const svixId = request.headers.get('svix-id');
        const svixTimestamp = request.headers.get('svix-timestamp');
        const svixSignature = request.headers.get('svix-signature');
        if (!svixId || !svixTimestamp || !svixSignature) {
            return new Response('missing svix headers', { status: 400 });
        }

        const body = await request.text();
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
                    if (!primaryEmail?.email_address) {
                        // user.created can fire pre-verification; user.updated
                        // will arrive with the verified email — accept-ignore.
                        return new Response('skipped: no email yet', { status: 202 });
                    }
                    await ctx.runMutation(internal.clerkWebhooks.upsertUser, {
                        clerkUserId: data.id,
                        email: primaryEmail.email_address,
                        firstName: data.first_name ?? undefined,
                        lastName: data.last_name ?? undefined,
                        displayName:
                            [data.first_name, data.last_name].filter(Boolean).join(' ') ||
                            primaryEmail.email_address,
                        avatarUrl: data.image_url ?? undefined,
                    });
                    break;
                }
                case 'user.deleted': {
                    const id = evt.data.id;
                    if (!id) break;
                    await ctx.runMutation(internal.clerkWebhooks.deleteUser, {
                        clerkUserId: id,
                    });
                    break;
                }
                default:
                    // session.created, organization.*, etc. unused — accept-ignore
                    break;
            }
        } catch (err) {
            console.error('[clerk-webhook] handler error', err);
            return new Response('handler error', { status: 500 });
        }

        return new Response('ok', { status: 200 });
    }),
});

// ─── Stripe webhook ─────────────────────────────────────────────────────────
//
// Stripe dashboard endpoint URL: `https://<deployment>.convex.site/webhooks/stripe`.
//
// Signature verification: Stripe sends `Stripe-Signature: t=<ts>,v1=<sig>` where
// sig is HMAC-SHA256(secret, `${ts}.${rawPayload}`) hex-digested. We verify with
// Web Crypto (Convex's default runtime) so the Stripe SDK isn't required at the
// HTTP layer — that keeps this entry point edge-runtime compatible and lets the
// Node-only Stripe SDK live exclusively in subscriptionActions.ts.

const STRIPE_SIG_TOLERANCE_SECONDS = 5 * 60;

async function verifyStripeSignature(
    rawPayload: string,
    headerValue: string,
    secret: string,
): Promise<boolean> {
    // Stripe sends multiple `v1=` entries during signing-secret rotation
    // (e.g. `t=…,v1=oldSig,v1=newSig`). Collect every key/value pair into
    // a list and accept the request if ANY `v1` signature matches the
    // current secret — otherwise rotation would brick the webhook for any
    // request whose matching signature happens to be listed second.
    const pairs = headerValue
        .split(',')
        .map((p) => p.trim().split('='))
        .filter((kv): kv is [string, string] => kv.length === 2);

    const timestamp = pairs.find((kv) => kv[0] === 't')?.[1];
    const signatures = pairs.filter((kv) => kv[0] === 'v1').map((kv) => kv[1]);
    if (!timestamp || signatures.length === 0) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const driftSeconds = Math.abs(Date.now() / 1000 - ts);
    if (driftSeconds > STRIPE_SIG_TOLERANCE_SECONDS) return false;

    const signedPayload = `${timestamp}.${rawPayload}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const macBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const macHex = Array.from(new Uint8Array(macBytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    // Constant-time compare against EVERY supplied `v1` signature. Stripe sends
    // both old + new during secret rotation; accept the first that matches.
    for (const signature of signatures) {
        if (macHex.length !== signature.length) continue;
        let diff = 0;
        for (let i = 0; i < macHex.length; i++) {
            diff |= macHex.charCodeAt(i) ^ signature.charCodeAt(i);
        }
        if (diff === 0) return true;
    }
    return false;
}

http.route({
    path: '/webhooks/stripe',
    method: 'POST',
    handler: httpAction(async (ctx, request) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
            return new Response('webhook not configured: STRIPE_WEBHOOK_SECRET missing', {
                status: 500,
            });
        }

        const signature = request.headers.get('stripe-signature');
        if (!signature) {
            return new Response('missing stripe-signature header', { status: 400 });
        }

        const rawPayload = await request.text();
        const ok = await verifyStripeSignature(rawPayload, signature, secret);
        if (!ok) {
            return new Response('signature invalid', { status: 400 });
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(rawPayload);
        } catch {
            return new Response('payload not JSON', { status: 400 });
        }
        const event = parsed as {
            id?: string;
            type?: string;
            data?: {
                object?: {
                    id?: string;
                    status?: string;
                    schedule?: string | { id?: string } | null;
                    cancel_at?: number | null;
                    customer?: string | { id?: string };
                    items?: {
                        data?: Array<{
                            id?: string;
                            price?: { id?: string } | string;
                            current_period_start?: number;
                            current_period_end?: number;
                        }>;
                    };
                };
            };
        };

        const sub = event.data?.object;
        if (!sub) {
            return new Response('payload missing data.object', { status: 400 });
        }
        const item = sub.items?.data?.[0];
        const price = item?.price;
        const priceId = typeof price === 'string' ? price : price?.id;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const scheduleId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id;

        if (
            !event.id ||
            !sub.id ||
            !item?.id ||
            !priceId ||
            !customerId ||
            !item.current_period_start ||
            !item.current_period_end
        ) {
            // Event missing its id or required subscription ids — accept-ignore
            // so Stripe doesn't retry forever on a malformed event we cannot act
            // on. (`event.id` is required for idempotency; real Stripe events
            // always carry it.)
            return new Response('event payload missing required fields', {
                status: 202,
            });
        }

        const eventInput = {
            eventId: event.id,
            subscriptionId: sub.id,
            subscriptionItemId: item.id,
            subscriptionScheduleId: scheduleId ?? undefined,
            priceId,
            customerId,
            currentPeriodStart: item.current_period_start,
            currentPeriodEnd: item.current_period_end,
            stripeStatus: sub.status ?? '',
            cancelAt: sub.cancel_at ?? undefined,
        };

        // Idempotency: each `_handleSub*` mutation records `event.id` in the
        // `stripeEventLog` table (indexed by_event_id) inside its own
        // transaction and early-returns if the id was already processed — so
        // Stripe retries / double-deliveries don't grant duplicate credits.
        // See `alreadyProcessed` in convex/lib/stripeWebhook.ts.
        try {
            switch (event.type) {
                case 'customer.subscription.created':
                    await ctx.runMutation(internal.lib.stripeWebhook._handleSubCreated, {
                        event: eventInput,
                    });
                    break;
                case 'customer.subscription.updated':
                    await ctx.runMutation(internal.lib.stripeWebhook._handleSubUpdated, {
                        event: eventInput,
                    });
                    break;
                case 'customer.subscription.deleted':
                    await ctx.runMutation(internal.lib.stripeWebhook._handleSubDeleted, {
                        event: eventInput,
                    });
                    break;
                case 'customer.subscription.paused':
                    await ctx.runMutation(internal.lib.stripeWebhook._handleSubPaused, {
                        event: eventInput,
                    });
                    break;
                case 'customer.subscription.resumed':
                    await ctx.runMutation(internal.lib.stripeWebhook._handleSubResumed, {
                        event: eventInput,
                    });
                    break;
                default:
                    // Other event types accept-ignored — Stripe webhook
                    // endpoints get many event types we don't subscribe to.
                    break;
            }
        } catch (err) {
            console.error('[stripe-webhook]', err);
            return new Response('handler error', { status: 500 });
        }

        return new Response('ok', { status: 200 });
    }),
});

export default http;
