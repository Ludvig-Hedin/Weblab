'use node';

import { v } from 'convex/values';
import Stripe from 'stripe';

import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { action } from './_generated/server';
import { vPriceKey } from './lib/enums';

// Convex billing actions. `"use node"` so we can call the Stripe SDK
// (Stripe-node depends on Node built-ins). Each action:
//   1. Authenticates the caller via internal.lib_stripeWebhook._resolveCallerUserId
//   2. Reads ancillary state via internalQueries
//   3. Hits Stripe
//   4. Persists results via internalMutations
//
// Routing: this file is imported as `convex/subscriptionActions.ts`. Functions
// in `convex/lib/` are accessed via the generated `internal["lib/stripeWebhook"]`
// proxy (Convex slug-cases dir/file). The api.d.ts after codegen will have
// the exact symbol path.

function getStripe(): Stripe {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
        throw new Error('STRIPE_SECRET_KEY is not configured for the Convex deployment');
    }
    return new Stripe(secret);
}

function getSiteUrl(): string {
    const url = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
    if (!url) {
        throw new Error('NEXT_PUBLIC_SITE_URL is not configured for the Convex deployment');
    }
    return url.replace(/\/$/, '');
}

const SUCCESS_PATH = '/auth/stripe/success';
const CANCEL_PATH = '/auth/stripe/cancel';

interface CheckoutSessionLike {
    id: string;
    url: string | null;
}

// ─── checkout ───────────────────────────────────────────────────────────────
//
// 1. Resolve caller → user record (with optional stripeCustomerId).
// 2. If no Stripe customer yet, create one and persist via internalMutation.
// 3. Create a Stripe Checkout Session for the requested price.
//
// TODO(bug-hunt 2026-05-28, F-491): no active-subscription guard. Double-click
// or two-tab race lets the same user complete two Checkout Sessions → two
// `customer.subscription.created` events → two `subscriptions` rows with
// status='active'. Downstream `_findActiveSubscriptionForCaller` then does
// `.unique()` on `by_user_status` and throws, locking the user out of the
// billing portal entirely. Fix: call `_findActiveSubscriptionForCaller` first
// and throw `ALREADY_SUBSCRIBED` if a row exists. Mirrors the guard already
// present in `startPromoCheckout`.
export const checkout = action({
    args: { priceId: v.string() },
    handler: async (ctx, { priceId }): Promise<CheckoutSessionLike> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');

        // Prevent the double-click race: if the caller already holds an active
        // subscription, refuse a second Checkout Session. Without this guard,
        // two near-simultaneous calls each create a Stripe Checkout Session →
        // two `customer.subscription.created` events → two `subscriptions`
        // rows with status='active'. Downstream `_findActiveSubscriptionForCaller`
        // uses `.unique()` on `by_user_status` and throws, locking the user
        // out of the billing portal. Mirrors `startPromoCheckout`.
        const existingActive = await ctx.runQuery(
            internal.lib.stripeWebhook._findActiveSubscriptionForCaller,
            { userId: caller.id as Id<'users'> },
        );
        if (existingActive) {
            throw new Error('ALREADY_SUBSCRIBED');
        }

        const stripe = getStripe();

        let stripeCustomerId = caller.stripeCustomerId;
        if (!stripeCustomerId) {
            const fullName =
                (caller.firstName
                    ? `${caller.firstName} ${caller.lastName ?? ''}`.trim()
                    : caller.displayName) ?? '';
            const customer = await stripe.customers.create({
                name: fullName,
                email: caller.email ?? '',
            });
            stripeCustomerId = customer.id;
            await ctx.runMutation(internal.lib.stripeWebhook._setStripeCustomerId, {
                userId: caller.id as Id<'users'>,
                stripeCustomerId,
            });
        }

        const origin = getSiteUrl();
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            payment_method_types: ['card'],
            metadata: { user_id: caller.id },
            allow_promotion_codes: true,
            success_url: `${origin}${SUCCESS_PATH}`,
            cancel_url: `${origin}${CANCEL_PATH}`,
        });

        return { id: session.id, url: session.url };
    },
});

// ─── manageSubscription ─────────────────────────────────────────────────────
//
// Create a Stripe Billing Portal session so the caller can edit their
// subscription / payment method. Errors if no active subscription.
export const manageSubscription = action({
    args: {},
    handler: async (ctx): Promise<{ id: string; url: string }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');

        const sub = await ctx.runQuery(
            internal.lib.stripeWebhook._findActiveSubscriptionForCaller,
            { userId: caller.id as Id<'users'> },
        );
        if (!sub) throw new Error('No active subscription found for user');

        const origin = getSiteUrl();
        const stripe = getStripe();
        const session = await stripe.billingPortal.sessions.create({
            customer: sub.stripeCustomerId,
            return_url: `${origin}/projects`,
        });
        return { id: session.id, url: session.url };
    },
});

// ─── update ─────────────────────────────────────────────────────────────────
//
// Change the price tier on an existing subscription.
//   - Upgrade (new tier has more credits) → invoice immediately.
//   - Downgrade → schedule the change for end-of-period via subscription
//     schedules; persist the scheduled change in our DB.
//   - Release any pre-existing schedule before applying a new change.
export const update = action({
    args: {
        stripeSubscriptionId: v.string(),
        stripeSubscriptionItemId: v.string(),
        stripePriceId: v.string(),
    },
    handler: async (
        ctx,
        { stripeSubscriptionId, stripeSubscriptionItemId, stripePriceId },
    ): Promise<{ ok: true }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');

        const owned = await ctx.runQuery(
            internal.lib.stripeWebhook._findOwnedSubscriptionForUpdate,
            {
                userId: caller.id as Id<'users'>,
                stripeSubscriptionId,
                stripeSubscriptionItemId,
            },
        );
        if (!owned) throw new Error('Subscription not found');

        const newPrice = await ctx.runQuery(internal.lib.stripeWebhook._findPriceForStripeId, {
            stripePriceId,
        });
        if (!newPrice) throw new Error(`Price not found for priceId: ${stripePriceId}`);

        const stripe = getStripe();

        // Releasing a schedule that Stripe already reports as `released` throws
        // `invalid_request_error`. Tolerate that — the next branches still apply
        // the upgrade/downgrade. Mirrors `releaseSubscriptionSchedule` at the
        // bottom of this file.
        if (owned.stripeSubscriptionScheduleId) {
            try {
                await stripe.subscriptionSchedules.release(
                    owned.stripeSubscriptionScheduleId,
                );
            } catch (err) {
                const code = (err as { code?: string } | null)?.code;
                if (code !== 'invalid_request_error') throw err;
                console.warn(
                    '[subscriptionActions.update] schedule already released',
                    owned.stripeSubscriptionScheduleId,
                );
            }
        }

        const isUpgrade =
            owned.currentPrice !== null &&
            newPrice.monthlyMessageLimit > owned.currentPrice.monthlyMessageLimit;

        if (isUpgrade) {
            await stripe.subscriptions.update(stripeSubscriptionId, {
                items: [{ id: stripeSubscriptionItemId, price: stripePriceId }],
                proration_behavior: 'always_invoice',
            });
            return { ok: true };
        }

        // Downgrade → create a schedule with a next-phase price change.
        const schedule = await stripe.subscriptionSchedules.create({
            from_subscription: stripeSubscriptionId,
        });
        const currentPhase = schedule.phases[0];
        if (!currentPhase) throw new Error('No current phase found');
        const currentItem = currentPhase.items[0];
        if (!currentItem) throw new Error('No current item found');
        const currentStripePrice =
            typeof currentItem.price === 'string'
                ? currentItem.price
                : currentItem.price.toString();

        const updatedSchedule = await stripe.subscriptionSchedules.update(schedule.id, {
            phases: [
                {
                    items: [{ price: currentStripePrice, quantity: currentItem.quantity }],
                    start_date: currentPhase.start_date,
                    end_date: currentPhase.end_date,
                },
                {
                    items: [{ price: stripePriceId, quantity: 1 }],
                    iterations: 1,
                },
            ],
        });

        const endDate = updatedSchedule.phases[0]?.end_date;
        const scheduledChangeAt = endDate ? endDate * 1000 : Date.now();

        await ctx.runMutation(internal.lib.stripeWebhook._applyScheduleChange, {
            stripeSubscriptionItemId,
            stripeSubscriptionScheduleId: updatedSchedule.id,
            scheduledPriceId: newPrice.id as Id<'prices'>,
            scheduledChangeAt,
        });

        return { ok: true };
    },
});

// ─── startPromoCheckout ─────────────────────────────────────────────────────
//
// Used by the marketing promo banner. Returns either an errorCode (for the
// client to render gracefully) or a redirect URL. NOT authenticated-only
// at the procedure level — the action mirrors the original `publicProcedure`
// by tolerating unauthenticated callers and returning a typed error code.
export const startPromoCheckout = action({
    args: {
        plan: v.literal('pro-monthly'),
        promotionCode: v.string(),
    },
    handler: async (
        ctx,
        { promotionCode },
    ): Promise<{ errorCode: string } | { redirectUrl: string }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        // TODO(bug-hunt 2026-05-28, F-491): conflates two states. If `caller`
        // is null, the user is genuinely unauthenticated; if `caller` is set
        // but `email` is missing, the user IS authenticated and just lacks an
        // email on their Clerk profile. Surface a `missing_email` error code
        // instead of the misleading `not_authenticated`.
        if (!caller?.email) {
            return { errorCode: 'not_authenticated' };
        }

        // Reject when caller already has an active Pro sub. Discounts on top
        // of a live subscription are either a no-op or a double-charge
        // depending on Stripe rules — neither is the experience we want.
        const alreadyPro = await ctx.runQuery(
            internal.lib.stripeWebhook._findActiveProSubscriptionForPromo,
            { userId: caller.id as Id<'users'> },
        );
        if (alreadyPro) return { errorCode: 'already_subscribed' };

        const stripePriceId = await ctx.runQuery(internal.lib.stripeWebhook._findPriceByKey, {
            priceKey: 'PRO_MONTHLY_TIER_1' as const,
        });
        if (!stripePriceId) return { errorCode: 'plan_not_found' };

        const stripe = getStripe();

        // Resolve human-readable promotion code → `promo_...` id.
        const promoSearch = await stripe.promotionCodes.list({
            code: promotionCode,
            active: true,
            limit: 1,
        });
        const promotionCodeId = promoSearch.data[0]?.id;
        if (!promotionCodeId) return { errorCode: 'promotion_code_not_found' };

        let stripeCustomerId = caller.stripeCustomerId;
        if (!stripeCustomerId) {
            const fullName =
                (caller.firstName
                    ? `${caller.firstName} ${caller.lastName ?? ''}`.trim()
                    : caller.displayName) ?? '';
            const customer = await stripe.customers.create({
                name: fullName,
                email: caller.email,
            });
            stripeCustomerId = customer.id;
            await ctx.runMutation(internal.lib.stripeWebhook._setStripeCustomerId, {
                userId: caller.id as Id<'users'>,
                stripeCustomerId,
            });
        }

        const origin = getSiteUrl();
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [{ price: stripePriceId, quantity: 1 }],
            payment_method_types: ['card'],
            metadata: { user_id: caller.id },
            discounts: [{ promotion_code: promotionCodeId }],
            success_url: `${origin}${SUCCESS_PATH}`,
            cancel_url: `${origin}${CANCEL_PATH}`,
        });

        if (!session.url) return { errorCode: 'session_url_missing' };
        return { redirectUrl: session.url };
    },
});

// ─── releaseSubscriptionSchedule ────────────────────────────────────────────
//
// User cancels a pending downgrade. We confirm ownership, ask Stripe to
// release the schedule, then clear the scheduled-change columns on our row.
// If Stripe returns "already released" we treat it as success — the
// idempotent path the original tRPC handler followed.
export const releaseSubscriptionSchedule = action({
    args: { subscriptionScheduleId: v.string() },
    handler: async (ctx, { subscriptionScheduleId }): Promise<{ subscriptionId: unknown }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');

        const owned = await ctx.runQuery(
            internal.lib.stripeWebhook._findOwnedSubscriptionBySchedule,
            {
                userId: caller.id as Id<'users'>,
                stripeSubscriptionScheduleId: subscriptionScheduleId,
            },
        );
        if (!owned) throw new Error('Subscription schedule not found');

        const stripe = getStripe();
        try {
            await stripe.subscriptionSchedules.release(subscriptionScheduleId);
        } catch (error: unknown) {
            const isInvalidRequest =
                typeof error === 'object' &&
                error !== null &&
                'type' in error &&
                (error as { type?: string }).type === 'invalid_request_error';
            if (!isInvalidRequest) throw error;
            // Already released — fall through to DB cleanup.
        }

        const updatedId = await ctx.runMutation(internal.lib.stripeWebhook._clearScheduleChange, {
            stripeSubscriptionScheduleId: subscriptionScheduleId,
        });
        return { subscriptionId: updatedId };
    },
});
