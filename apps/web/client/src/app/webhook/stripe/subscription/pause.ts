import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';

import { subscriptions } from '@weblab/db';
import { db } from '@weblab/db/src/client';
import { SubscriptionStatus } from '@weblab/stripe';

import { trackEvent } from '@/utils/analytics/server';
import { extractIdsFromEvent } from './helpers';

/**
 * customer.subscription.paused — Stripe pauses billing.
 * Treat the subscription as inactive (CANCELED status in our two-state enum)
 * so the user loses pro entitlements until billing resumes.
 */
export const handleSubscriptionPaused = async (
    receivedEvent: Stripe.CustomerSubscriptionPausedEvent,
) => {
    const { stripeSubscriptionId } = extractIdsFromEvent(receivedEvent);

    const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
    });

    if (!subscription) {
        console.error('Subscription not found for pause event:', stripeSubscriptionId);
        return new Response(JSON.stringify({ error: 'Subscription not found' }), { status: 404 });
    }

    await db
        .update(subscriptions)
        .set({
            status: SubscriptionStatus.CANCELED,
            endedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

    try {
        await trackEvent({
            distinctId: subscription.userId,
            event: 'user_subscription_paused',
            properties: {
                $set: { subscription_paused_at: new Date() },
            },
        });
    } catch (error) {
        console.error('Error tracking subscription pause:', error);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

/**
 * customer.subscription.resumed — Stripe resumes billing after a pause.
 * Restore the subscription to ACTIVE so entitlements come back.
 */
export const handleSubscriptionResumed = async (
    receivedEvent: Stripe.CustomerSubscriptionResumedEvent,
) => {
    const { stripeSubscriptionId } = extractIdsFromEvent(receivedEvent);

    const subscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
    });

    if (!subscription) {
        console.error('Subscription not found for resume event:', stripeSubscriptionId);
        return new Response(JSON.stringify({ error: 'Subscription not found' }), { status: 404 });
    }

    await db
        .update(subscriptions)
        .set({
            status: SubscriptionStatus.ACTIVE,
            endedAt: null,
            updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

    try {
        await trackEvent({
            distinctId: subscription.userId,
            event: 'user_subscription_resumed',
            properties: {
                $set: { subscription_resumed_at: new Date() },
            },
        });
    } catch (error) {
        console.error('Error tracking subscription resume:', error);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
