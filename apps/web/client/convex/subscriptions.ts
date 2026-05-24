import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { vPriceKey } from './lib/enums';
import { getOptionalUser, requireUser } from './lib/permissions';

// Convex billing — subscription queries.
//
// Ported from apps/web/client/src/server/api/routers/subscription/subscription.ts.
// Drizzle-with-relations joins (`product`, `price`) are emulated by sequential
// `ctx.db.get` calls — Convex has no SQL `with:` clause but `_id` lookups are
// O(1) and never cross-document.

// Domain shapes mirrored from @weblab/stripe so consumers do not have to
// import the Stripe-package types just to read a subscription. Keeping them
// inline avoids a Convex bundle dependency on `stripe` for query-side code.
type SubscriptionStatusValue = Doc<'subscriptions'>['status'];
type ScheduledActionValue = NonNullable<Doc<'subscriptions'>['scheduledAction']>;

export interface BillingPrice {
    id: string;
    productId: string;
    key: Doc<'prices'>['key'];
    monthlyMessageLimit: number;
    stripePriceId: string;
}

export interface BillingProduct {
    name: string;
    type: Doc<'products'>['type'];
    stripeProductId: string;
}

export interface BillingScheduledChange {
    scheduledAction: ScheduledActionValue;
    scheduledChangeAt: number;
    price: BillingPrice | null;
    stripeSubscriptionScheduleId: string | null;
}

export interface BillingSubscription {
    id: string;
    status: SubscriptionStatusValue;
    startedAt: number;
    endedAt: number | null;
    product: BillingProduct;
    price: BillingPrice;
    scheduledChange: BillingScheduledChange | null;
    stripeSubscriptionId: string;
    stripeSubscriptionItemId: string;
    stripeCustomerId: string;
}

function toBillingPrice(price: Doc<'prices'>): BillingPrice {
    return {
        id: price._id,
        productId: price.productId,
        key: price.key,
        monthlyMessageLimit: price.monthlyMessageLimit,
        stripePriceId: price.stripePriceId,
    };
}

function toBillingProduct(product: Doc<'products'>): BillingProduct {
    return {
        name: product.name,
        type: product.type,
        stripeProductId: product.stripeProductId,
    };
}

function toBillingScheduledChange(
    scheduledPrice: Doc<'prices'> | null,
    scheduledAction: Doc<'subscriptions'>['scheduledAction'],
    scheduledChangeAt: Doc<'subscriptions'>['scheduledChangeAt'],
    stripeSubscriptionScheduleId: Doc<'subscriptions'>['stripeSubscriptionScheduleId'],
): BillingScheduledChange | null {
    if (!scheduledAction || !scheduledChangeAt) return null;
    return {
        price: scheduledPrice ? toBillingPrice(scheduledPrice) : null,
        scheduledAction,
        scheduledChangeAt,
        stripeSubscriptionScheduleId: stripeSubscriptionScheduleId ?? null,
    };
}

async function loadActiveSubscription(
    ctx: QueryCtx,
    userId: Doc<'users'>['_id'],
): Promise<Doc<'subscriptions'> | null> {
    return ctx.db
        .query('subscriptions')
        .withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'active'))
        .unique();
}

export const getLegacySubscriptions = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        if (!user.email) return null;
        const matches = await ctx.db
            .query('legacySubscriptions')
            .withIndex('by_email', (q) => q.eq('email', user.email!))
            .collect();
        // legacy promo: skip rows already redeemed
        return matches.find((row) => row.redeemAt === undefined) ?? null;
    },
});

export const get = query({
    args: {},
    handler: async (ctx): Promise<BillingSubscription | null> => {
        const user = await getOptionalUser(ctx);
        if (!user) return null;
        const subscription = await loadActiveSubscription(ctx, user._id);
        if (!subscription) return null;

        const product = await ctx.db.get(subscription.productId);
        const price = await ctx.db.get(subscription.priceId);
        if (!product || !price) {
            // Schema invariant: an active subscription always points to a live
            // product + price row. Bail loudly so the bug surfaces instead of
            // silently returning a half-filled subscription object.
            throw new Error('subscription.product/price missing');
        }

        const scheduledPrice = subscription.scheduledPriceId
            ? ((await ctx.db.get(subscription.scheduledPriceId)) ?? null)
            : null;

        return {
            id: subscription._id,
            status: subscription.status,
            startedAt: subscription.startedAt,
            endedAt: subscription.endedAt ?? null,
            product: toBillingProduct(product),
            price: toBillingPrice(price),
            scheduledChange: toBillingScheduledChange(
                scheduledPrice,
                subscription.scheduledAction,
                subscription.scheduledChangeAt,
                subscription.stripeSubscriptionScheduleId,
            ),
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            stripeSubscriptionItemId: subscription.stripeSubscriptionItemId,
            stripeCustomerId: subscription.stripeCustomerId,
        };
    },
});

/**
 * Resolve a logical PriceKey enum to its Stripe price ID. Kept as a mutation
 * to mirror the tRPC contract (`getPriceId` was a `.mutation` upstream so the
 * client wrapper plays nicely with React Query's mutate API).
 */
export const getPriceId = mutation({
    args: { priceKey: vPriceKey },
    handler: async (ctx, { priceKey }) => {
        await requireUser(ctx);
        const price = await ctx.db
            .query('prices')
            .withIndex('by_key', (q) => q.eq('key', priceKey))
            .unique();
        if (!price) {
            throw new Error(`Price not found for key: ${priceKey}`);
        }
        return price.stripePriceId;
    },
});
