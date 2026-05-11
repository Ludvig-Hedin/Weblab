import type Stripe from 'stripe';

import type { Price } from './types';
import { createStripeClient } from './client';

export const createCustomer = async ({ name, email }: { name: string; email: string }) => {
    const stripe = createStripeClient();
    return stripe.customers.create({ name, email });
};

export const isTierUpgrade = (currentPrice: Price, newPrice: Price) => {
    return newPrice.monthlyMessageLimit > currentPrice.monthlyMessageLimit;
};

export const createCheckoutSession = async ({
    priceId,
    userId,
    stripeCustomerId,
    successUrl,
    cancelUrl,
    existing,
    promotionCodeId,
}: {
    priceId: string;
    userId: string;
    stripeCustomerId: string;
    existing?: {
        subscriptionId: string;
        customerId: string;
    };
    successUrl: string;
    cancelUrl: string;
    /**
     * Pre-applied Stripe promotion code ID (e.g. `promo_...`). When set, the
     * discount is locked on the session and `allow_promotion_codes` is
     * disabled so the user cannot replace it with a different code in the
     * Stripe-hosted UI.
     */
    promotionCodeId?: string;
}) => {
    const stripe = createStripeClient();
    let session: Stripe.Checkout.Session;
    // Stripe rejects `allow_promotion_codes` and `discounts` set together.
    const promoFields: Pick<
        Stripe.Checkout.SessionCreateParams,
        'allow_promotion_codes' | 'discounts'
    > = promotionCodeId
        ? { discounts: [{ promotion_code: promotionCodeId }] }
        : { allow_promotion_codes: true };
    if (existing) {
        session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            payment_method_types: ['card'],
            metadata: {
                user_id: userId,
            },
            ...promoFields,
            success_url: successUrl,
            cancel_url: cancelUrl,
            subscription_data: {
                proration_behavior: 'create_prorations',
            },
        });
    } else {
        session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            payment_method_types: ['card'],
            metadata: {
                user_id: userId,
            },
            ...promoFields,
            success_url: successUrl,
            cancel_url: cancelUrl,
        });
    }
    return session;
};

/**
 * Resolve a human-readable Stripe promotion code (e.g. `PROMO60`) to its
 * internal `promo_...` ID. Cached per-process to avoid hitting the Stripe API
 * on every checkout request. Returns null when no active promotion code with
 * that code exists.
 */
const promotionCodeIdCache = new Map<string, string>();

export const getPromotionCodeIdByCode = async (code: string): Promise<string | null> => {
    const cached = promotionCodeIdCache.get(code);
    if (cached) return cached;

    const stripe = createStripeClient();
    const result = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    const promotionCode = result.data[0];
    if (!promotionCode) return null;

    promotionCodeIdCache.set(code, promotionCode.id);
    return promotionCode.id;
};

export const createBillingPortalSession = async ({
    customerId,
    returnUrl,
}: {
    customerId: string;
    returnUrl: string;
}) => {
    const stripe = createStripeClient();
    return await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });
};

export const updateSubscription = async ({
    subscriptionId,
    subscriptionItemId,
    priceId,
}: {
    subscriptionId: string;
    subscriptionItemId: string;
    priceId: string;
}) => {
    const stripe = createStripeClient();
    return stripe.subscriptions.update(subscriptionId, {
        items: [
            {
                id: subscriptionItemId,
                price: priceId,
            },
        ],
        proration_behavior: 'always_invoice',
    });
};

export const updateSubscriptionNextPeriod = async ({
    subscriptionId,
    priceId,
}: {
    subscriptionId: string;
    priceId: string;
}) => {
    const stripe = createStripeClient();

    // Step 1: Create a subscription schedule from the current subscription
    const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: subscriptionId,
    });

    const currentPhase = schedule.phases[0];
    if (!currentPhase) {
        throw new Error('No current phase found');
    }
    const currentItem = currentPhase.items[0];
    if (!currentItem) {
        throw new Error('No current item found');
    }

    const currentPrice = currentItem.price.toString();
    if (!currentPrice) {
        throw new Error('No current price found');
    }

    // Step 2: Add a new phase that updates the price starting next billing period
    const updatedSchedule = await stripe.subscriptionSchedules.update(schedule.id, {
        phases: [
            {
                items: [
                    {
                        price: currentPrice,
                        quantity: currentItem.quantity,
                    },
                ],
                start_date: currentPhase.start_date,
                end_date: currentPhase.end_date,
            },
            {
                items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                iterations: 1,
            },
        ],
    });

    return updatedSchedule;
};

export const releaseSubscriptionSchedule = async ({
    subscriptionScheduleId,
}: {
    subscriptionScheduleId: string;
}) => {
    const stripe = createStripeClient();
    return await stripe.subscriptionSchedules.release(subscriptionScheduleId);
};

export const getSubscriptionSchedule = async ({
    subscriptionScheduleId,
}: {
    subscriptionScheduleId: string;
}) => {
    const stripe = createStripeClient();
    return stripe.subscriptionSchedules.retrieve(subscriptionScheduleId);
};
