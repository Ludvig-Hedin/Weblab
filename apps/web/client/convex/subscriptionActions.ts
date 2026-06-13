'use node';

import { v } from 'convex/values';
import Stripe from 'stripe';

import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { action } from './_generated/server';

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
                await stripe.subscriptionSchedules.release(owned.stripeSubscriptionScheduleId);
            } catch (err) {
                // Stripe's `error.code` is the granular code (e.g. 'resource_missing'),
                // never the class 'invalid_request_error', so the old check never
                // matched and every error rethrew — bricking the upgrade path. Detect
                // the error class directly and tolerate an already-released schedule;
                // rethrow anything else.
                if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) throw err;
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
        // currentItem.price is string | Stripe.Price depending on expand opts.
        // When it's a Price object, .id is the stable price ID string.
        const currentStripePrice =
            typeof currentItem.price === 'string' ? currentItem.price : currentItem.price.id;

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
            // `error.type` is the JS class name ('StripeInvalidRequestError'),
            // not the raw API string 'invalid_request_error', so the old check
            // never matched and a stale schedule could never be cleaned up.
            // Detect the error class directly; rethrow anything else.
            if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
            // Already released — fall through to DB cleanup.
        }

        const updatedId = await ctx.runMutation(internal.lib.stripeWebhook._clearScheduleChange, {
            stripeSubscriptionScheduleId: subscriptionScheduleId,
        });
        return { subscriptionId: updatedId };
    },
});

// ─── Billing-details shapes ──────────────────────────────────────────────────
//
// Returned by `getBillingDetails` and consumed by the settings → Subscription
// tab. Plain JS objects (no Convex validator needed on action returns). All
// monetary amounts are Stripe minor units (cents); all timestamps are epoch ms.

interface BillingPaymentMethod {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
}

interface BillingInvoice {
    id: string;
    number: string | null;
    created: number; // epoch ms
    amountPaid: number; // minor units (cents)
    currency: string;
    status: string | null;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
}

interface BillingCustomerInfo {
    name: string | null;
    email: string | null;
    address: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        country: string | null;
    } | null;
}

interface BillingDetails {
    customer: BillingCustomerInfo | null;
    paymentMethods: BillingPaymentMethod[];
    invoices: BillingInvoice[];
}

// Resolve the default payment method id off a (possibly expanded) customer.
function resolveDefaultPaymentMethodId(customer: Stripe.Customer): string | null {
    const dpm = customer.invoice_settings?.default_payment_method;
    if (!dpm) return null;
    return typeof dpm === 'string' ? dpm : dpm.id;
}

// Confirm the caller's Stripe customer owns the payment method before any
// mutation. Stripe's detach/update endpoints don't scope by customer, so
// without this check a caller could pass any `pm_…` id. Throws FORBIDDEN.
async function assertPaymentMethodOwned(
    stripe: Stripe,
    paymentMethodId: string,
    customerId: string,
): Promise<Stripe.PaymentMethod> {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const pmCustomer = typeof pm.customer === 'string' ? pm.customer : (pm.customer?.id ?? null);
    if (pmCustomer !== customerId) {
        throw new Error('FORBIDDEN');
    }
    return pm;
}

// ─── getBillingDetails ───────────────────────────────────────────────────────
//
// Read-only fetch of the caller's Stripe customer, saved cards, and recent
// invoices for the in-app billing UI. Returns null when the caller has no
// Stripe customer yet (free user who never checked out) — the UI renders the
// Free/empty state without a Stripe round-trip.
export const getBillingDetails = action({
    args: {},
    handler: async (ctx): Promise<BillingDetails | null> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');
        const customerId = caller.stripeCustomerId;
        if (!customerId) return null;

        const stripe = getStripe();
        const [customer, paymentMethods, invoices] = await Promise.all([
            stripe.customers.retrieve(customerId),
            stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
            stripe.invoices.list({ customer: customerId, limit: 10 }),
        ]);

        let customerInfo: BillingCustomerInfo | null = null;
        let defaultPaymentMethodId: string | null = null;
        if (customer && !customer.deleted) {
            const addr = customer.address;
            customerInfo = {
                name: customer.name ?? null,
                email: customer.email ?? null,
                address: addr
                    ? {
                          line1: addr.line1 ?? null,
                          line2: addr.line2 ?? null,
                          city: addr.city ?? null,
                          state: addr.state ?? null,
                          postalCode: addr.postal_code ?? null,
                          country: addr.country ?? null,
                      }
                    : null,
            };
            defaultPaymentMethodId = resolveDefaultPaymentMethodId(customer);
        }

        const mappedPaymentMethods: BillingPaymentMethod[] = paymentMethods.data.map((pm) => ({
            id: pm.id,
            brand: pm.card?.brand ?? 'card',
            last4: pm.card?.last4 ?? '••••',
            expMonth: pm.card?.exp_month ?? 0,
            expYear: pm.card?.exp_year ?? 0,
            isDefault: pm.id === defaultPaymentMethodId,
        }));

        const mappedInvoices: BillingInvoice[] = invoices.data.map((inv) => ({
            id: inv.id ?? '',
            number: inv.number ?? null,
            created: inv.created * 1000,
            amountPaid: inv.amount_paid,
            currency: inv.currency,
            status: inv.status ?? null,
            hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
            invoicePdf: inv.invoice_pdf ?? null,
        }));

        return {
            customer: customerInfo,
            paymentMethods: mappedPaymentMethods,
            invoices: mappedInvoices,
        };
    },
});

// ─── updateBillingInfo ───────────────────────────────────────────────────────
//
// Update the Stripe customer's name + billing address from the in-app form.
export const updateBillingInfo = action({
    args: {
        name: v.optional(v.string()),
        address: v.object({
            line1: v.string(),
            line2: v.optional(v.string()),
            city: v.string(),
            state: v.optional(v.string()),
            postalCode: v.string(),
            country: v.string(),
        }),
    },
    handler: async (ctx, { name, address }): Promise<{ ok: true }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');
        const customerId = caller.stripeCustomerId;
        if (!customerId) throw new Error('NO_CUSTOMER');

        const stripe = getStripe();
        await stripe.customers.update(customerId, {
            ...(name !== undefined ? { name } : {}),
            address: {
                line1: address.line1,
                line2: address.line2,
                city: address.city,
                state: address.state,
                postal_code: address.postalCode,
                country: address.country,
            },
        });
        return { ok: true };
    },
});

// ─── setDefaultPaymentMethod ─────────────────────────────────────────────────
//
// Mark an owned card as the customer's default for future invoices.
export const setDefaultPaymentMethod = action({
    args: { paymentMethodId: v.string() },
    handler: async (ctx, { paymentMethodId }): Promise<{ ok: true }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');
        const customerId = caller.stripeCustomerId;
        if (!customerId) throw new Error('NO_CUSTOMER');

        const stripe = getStripe();
        await assertPaymentMethodOwned(stripe, paymentMethodId, customerId);
        await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
        });
        return { ok: true };
    },
});

// ─── deletePaymentMethod ─────────────────────────────────────────────────────
//
// Detach an owned card. Refuses to remove the current default (throws
// CANNOT_DELETE_DEFAULT) — leaving a customer with an active subscription and
// no default card silently breaks the next invoice. The UI prompts the user to
// pick another default first.
export const deletePaymentMethod = action({
    args: { paymentMethodId: v.string() },
    handler: async (ctx, { paymentMethodId }): Promise<{ ok: true }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');
        const customerId = caller.stripeCustomerId;
        if (!customerId) throw new Error('NO_CUSTOMER');

        const stripe = getStripe();
        await assertPaymentMethodOwned(stripe, paymentMethodId, customerId);

        const customer = await stripe.customers.retrieve(customerId);
        if (customer && !customer.deleted) {
            if (resolveDefaultPaymentMethodId(customer) === paymentMethodId) {
                throw new Error('CANNOT_DELETE_DEFAULT');
            }
        }

        await stripe.paymentMethods.detach(paymentMethodId);
        return { ok: true };
    },
});

// ─── addPaymentMethod ────────────────────────────────────────────────────────
//
// The one PCI-sensitive flow that leaves the app: deep-link straight into the
// Stripe Billing Portal's add/update-card flow. Requires the portal config to
// have the payment-method-update feature enabled (Stripe dashboard).
export const addPaymentMethod = action({
    args: {},
    handler: async (ctx): Promise<{ url: string }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');
        const customerId = caller.stripeCustomerId;
        if (!customerId) throw new Error('NO_CUSTOMER');

        const stripe = getStripe();
        const origin = getSiteUrl();
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}/projects`,
            flow_data: { type: 'payment_method_update' },
        });
        return { url: session.url };
    },
});

// ─── cancelSubscription ──────────────────────────────────────────────────────
//
// Native cancel: flag the Stripe subscription to cancel at period end. The
// `customer.subscription.updated` webhook carries the resulting `cancel_at`,
// and `_handleSubUpdated` records scheduledAction='cancellation' so the UI
// reflects the pending cancel via the reactive `subscriptions.get` query.
export const cancelSubscription = action({
    args: {},
    handler: async (ctx): Promise<{ ok: true }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');

        const sub = await ctx.runQuery(
            internal.lib.stripeWebhook._findActiveSubscriptionForCaller,
            { userId: caller.id as Id<'users'> },
        );
        if (!sub) throw new Error('No active subscription found for user');

        const stripe = getStripe();
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
        return { ok: true };
    },
});

// ─── reactivateSubscription ──────────────────────────────────────────────────
//
// Undo a pending cancel/downgrade. A pending downgrade lives as a Stripe
// subscription *schedule*; a pending cancellation is just cancel_at_period_end
// on the subscription itself. Release the schedule if present (and clear our
// scheduled-change columns), otherwise clear the cancel flag and let the
// webhook reconcile.
export const reactivateSubscription = action({
    args: {},
    handler: async (ctx): Promise<{ ok: true }> => {
        const caller = await ctx.runQuery(internal.lib.stripeWebhook._resolveCallerUserId, {});
        if (!caller) throw new Error('UNAUTHORIZED');

        const sub = await ctx.runQuery(
            internal.lib.stripeWebhook._findActiveSubscriptionForCaller,
            { userId: caller.id as Id<'users'> },
        );
        if (!sub) throw new Error('No active subscription found for user');

        const stripe = getStripe();
        if (sub.stripeSubscriptionScheduleId) {
            try {
                await stripe.subscriptionSchedules.release(sub.stripeSubscriptionScheduleId);
            } catch (err) {
                // `err.code` is the granular code (e.g. 'resource_missing'), never
                // 'invalid_request_error', so the old check never matched and an
                // already-released schedule rethrew instead of falling through to
                // DB cleanup. Detect the error class directly; rethrow anything else.
                if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) throw err;
            }
            await ctx.runMutation(internal.lib.stripeWebhook._clearScheduleChange, {
                stripeSubscriptionScheduleId: sub.stripeSubscriptionScheduleId,
            });
        } else {
            await stripe.subscriptions.update(sub.stripeSubscriptionId, {
                cancel_at_period_end: false,
            });
        }
        return { ok: true };
    },
});
