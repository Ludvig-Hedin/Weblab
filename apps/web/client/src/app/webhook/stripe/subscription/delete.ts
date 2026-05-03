import { trackEvent } from '@/utils/analytics/server';
import { subscriptions } from '@weblab/db';
import { db } from '@weblab/db/src/client';
import { SubscriptionStatus } from '@weblab/stripe';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { extractIdsFromEvent } from './helpers';

export const handleSubscriptionDeleted = async (
    receivedEvent: Stripe.CustomerSubscriptionDeletedEvent,
) => {
    const { stripeSubscriptionId } = extractIdsFromEvent(receivedEvent);

    const res = await db
        .update(subscriptions)
        .set({
            status: SubscriptionStatus.CANCELED,
            endedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

    console.log('Subscription cancelled: ', res);
    await trackSubscriptionCancelled(stripeSubscriptionId);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const trackSubscriptionCancelled = async (stripeSubscriptionId: string) => {
    try {
        const subscription = await db.query.subscriptions.findFirst({
            where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
        });
        if (subscription) {
            trackEvent({
                distinctId: subscription.userId,
                event: 'user_subscription_cancelled',
                properties: {
                    $set: {
                        subscription_cancelled_at: new Date(),
                    }
                }
            })
        }
    } catch (error) {
        console.error('Error tracking user subscription cancelled: ', error)
    }
}