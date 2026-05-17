import { headers } from 'next/headers';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { fromDbSubscription, legacySubscriptions, prices, subscriptions, users } from '@weblab/db';
import {
    createBillingPortalSession,
    createCheckoutSession,
    createCustomer,
    getPromotionCodeIdByCode,
    isTierUpgrade,
    PriceKey,
    ProductType,
    releaseSubscriptionSchedule,
    SubscriptionStatus,
    updateSubscription,
    updateSubscriptionNextPeriod,
} from '@weblab/stripe';

import { Routes } from '@/utils/constants';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../../trpc';

/**
 * Default Pro tier used when the user enters checkout from a promo banner.
 * Tier 1 is the entry-level monthly Pro plan (100 credits). Banners send
 * users into the cheapest tier — they can manage/upgrade later from billing.
 */
const PROMO_DEFAULT_PRO_PRICE_KEY = PriceKey.PRO_MONTHLY_TIER_1;

export const subscriptionRouter = createTRPCRouter({
    getLegacySubscriptions: protectedProcedure.query(async ({ ctx }) => {
        const user = ctx.user;
        const subscription = await ctx.db.query.legacySubscriptions.findFirst({
            where: and(
                eq(legacySubscriptions.email, user.email),
                isNull(legacySubscriptions.redeemAt),
            ),
        });
        return subscription ?? null;
    }),
    get: protectedProcedure.query(async ({ ctx }) => {
        const user = ctx.user;
        const subscription = await ctx.db.query.subscriptions.findFirst({
            where: and(
                eq(subscriptions.userId, user.id),
                eq(subscriptions.status, SubscriptionStatus.ACTIVE),
            ),
            with: {
                product: true,
                price: true,
            },
        });

        if (!subscription) {
            console.log('No active subscription found for user', user.id);
            return null;
        }

        // If there is a scheduled price, we need to fetch it from the database.
        let scheduledPrice = null;
        if (subscription.scheduledPriceId) {
            scheduledPrice =
                (await ctx.db.query.prices.findFirst({
                    where: eq(prices.id, subscription.scheduledPriceId),
                })) ?? null;
        }

        return fromDbSubscription(subscription, scheduledPrice);
    }),
    getPriceId: protectedProcedure
        .input(
            z.object({
                priceKey: z.nativeEnum(PriceKey),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const price = await ctx.db.query.prices.findFirst({
                where: eq(prices.key, input.priceKey),
            });

            if (!price) {
                throw new Error(`Price not found for key: ${input.priceKey}`);
            }

            return price.stripePriceId;
        }),
    checkout: protectedProcedure
        .input(
            z.object({
                priceId: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const originUrl = (await headers()).get('origin');
            const user = ctx.user;
            const userData = await ctx.db.query.users.findFirst({
                where: eq(users.id, user.id),
            });

            if (!userData) {
                throw new Error('User not found');
            }

            let stripeCustomerId = userData?.stripeCustomerId;
            if (!stripeCustomerId) {
                // Store Stripe's customer ID as it is available in all customer-related events and
                // API requests.
                // Important, it may seem like a good idea to check if the customer already exists
                // by looking up the email in Stripe, however, this can be a security risk since
                // a user may sign up with an email that is not their own.
                // This may happen when a user changes their email address in the app and the email
                // is not updated in Stripe.
                const customer = await createCustomer({
                    name:
                        (userData.firstName
                            ? userData.firstName + ' ' + userData.lastName
                            : userData.displayName) || '',
                    email: user.email ?? userData.email,
                });

                await ctx.db
                    .update(users)
                    .set({ stripeCustomerId: customer.id })
                    .where(eq(users.id, user.id));
                stripeCustomerId = customer.id;
            }

            const session = await createCheckoutSession({
                priceId: input.priceId,
                userId: user.id,
                stripeCustomerId,
                successUrl: `${originUrl}${Routes.CALLBACK_STRIPE_SUCCESS}`,
                cancelUrl: `${originUrl}${Routes.CALLBACK_STRIPE_CANCEL}`,
            });

            return session;
        }),
    manageSubscription: protectedProcedure.mutation(async ({ ctx }) => {
        const user = ctx.user;
        const subscription = await ctx.db.query.subscriptions.findFirst({
            where: and(
                eq(subscriptions.userId, user.id),
                eq(subscriptions.status, SubscriptionStatus.ACTIVE),
            ),
        });

        if (!subscription) {
            throw new Error('No active subscription found for user');
        }

        const originUrl = (await headers()).get('origin');

        // Bug fix #12: /subscription/manage is not a real route — return users to /projects.
        const session = await createBillingPortalSession({
            customerId: subscription.stripeCustomerId,
            returnUrl: `${originUrl}/projects`,
        });

        return session;
    }),
    update: protectedProcedure
        .input(
            z.object({
                stripeSubscriptionId: z.string(),
                stripeSubscriptionItemId: z.string(),
                stripePriceId: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const { stripeSubscriptionId, stripeSubscriptionItemId, stripePriceId } = input;
            // CR-060: scope by `userId` so a caller cannot mutate another user's
            // subscription by guessing or learning their Stripe subscription ID.
            const subscription = await ctx.db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
                    eq(subscriptions.stripeSubscriptionItemId, stripeSubscriptionItemId),
                    eq(subscriptions.userId, ctx.user.id),
                ),
                with: {
                    price: true,
                },
            });

            if (!subscription) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Subscription not found',
                });
            }

            const currentPrice = subscription.price;
            const newPrice = await ctx.db.query.prices.findFirst({
                where: eq(prices.stripePriceId, stripePriceId),
            });

            if (!newPrice) {
                throw new Error(`Price not found for priceId: ${stripePriceId}`);
            }

            // If there is a future scheduled change, we release it.
            if (subscription.stripeSubscriptionScheduleId) {
                await releaseSubscriptionSchedule({
                    subscriptionScheduleId: subscription.stripeSubscriptionScheduleId,
                });
            }

            const isUpgrade = isTierUpgrade(currentPrice, newPrice);
            if (isUpgrade) {
                // If the new price is higher, we invoice the customer immediately.
                await updateSubscription({
                    subscriptionId: stripeSubscriptionId,
                    subscriptionItemId: stripeSubscriptionItemId,
                    priceId: stripePriceId,
                });
            } else {
                // If the new price is lower, we schedule the change for the end of the current period.
                const schedule = await updateSubscriptionNextPeriod({
                    subscriptionId: stripeSubscriptionId,
                    priceId: stripePriceId,
                });
                const endDate = schedule.phases[0]?.end_date;
                const scheduledChangeAt = endDate ? new Date(endDate * 1000) : null;

                await ctx.db
                    .update(subscriptions)
                    .set({
                        updatedAt: new Date(),
                        scheduledChangeAt,
                        scheduledPriceId: newPrice.id,
                        stripeSubscriptionScheduleId: schedule.id,
                    })
                    .where(eq(subscriptions.stripeSubscriptionItemId, stripeSubscriptionItemId))
                    .returning();
            }
        }),

    /**
     * Start a Stripe Checkout session for the Pro monthly plan with a
     * promotion code pre-applied. Designed for the promo banner CTA on
     * marketing pages. Public-procedure so the client can introspect the
     * `errorCode` (unauthenticated / already-subscribed) without throwing.
     */
    startPromoCheckout: publicProcedure
        .input(
            z.object({
                plan: z.literal('pro-monthly'),
                promotionCode: z.string().min(1).max(64),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            if (!ctx.user?.email) {
                return { errorCode: 'not_authenticated' as const };
            }
            const userId = ctx.user.id;

            // Reject if the caller already has an active Pro subscription —
            // a discount code on top of a live subscription would be either
            // a no-op or a double-charge depending on Stripe rules.
            const activeSub = await ctx.db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.userId, userId),
                    eq(subscriptions.status, SubscriptionStatus.ACTIVE),
                ),
                with: { product: true },
            });
            if (activeSub && activeSub.product.type === ProductType.PRO) {
                return { errorCode: 'already_subscribed' as const };
            }

            // Resolve plan → Stripe price.
            const price = await ctx.db.query.prices.findFirst({
                where: eq(prices.key, PROMO_DEFAULT_PRO_PRICE_KEY),
            });
            if (!price) {
                return { errorCode: 'plan_not_found' as const };
            }

            // Resolve human-readable promotion code → Stripe `promo_...` ID.
            const promotionCodeId = await getPromotionCodeIdByCode(input.promotionCode);
            if (!promotionCodeId) {
                return { errorCode: 'promotion_code_not_found' as const };
            }

            // Ensure the caller has a Stripe customer.
            const userData = await ctx.db.query.users.findFirst({
                where: eq(users.id, userId),
            });
            if (!userData) {
                return { errorCode: 'user_not_found' as const };
            }
            let stripeCustomerId = userData.stripeCustomerId;
            if (!stripeCustomerId) {
                const customer = await createCustomer({
                    name:
                        (userData.firstName
                            ? userData.firstName + ' ' + userData.lastName
                            : userData.displayName) || '',
                    email: ctx.user.email ?? userData.email,
                });
                await ctx.db
                    .update(users)
                    .set({ stripeCustomerId: customer.id })
                    .where(eq(users.id, userId));
                stripeCustomerId = customer.id;
            }

            const originUrl = (await headers()).get('origin');
            if (!originUrl) {
                return { errorCode: 'origin_missing' as const };
            }
            const session = await createCheckoutSession({
                priceId: price.stripePriceId,
                userId,
                stripeCustomerId,
                promotionCodeId,
                successUrl: `${originUrl}${Routes.CALLBACK_STRIPE_SUCCESS}`,
                cancelUrl: `${originUrl}${Routes.CALLBACK_STRIPE_CANCEL}`,
            });

            if (!session.url) {
                return { errorCode: 'session_url_missing' as const };
            }
            return { redirectUrl: session.url };
        }),

    releaseSubscriptionSchedule: protectedProcedure
        .input(
            z.object({
                subscriptionScheduleId: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            // CR-060: confirm the caller owns the subscription tied to this
            // schedule before performing any Stripe-side mutation.
            const ownedSubscription = await ctx.db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.stripeSubscriptionScheduleId, input.subscriptionScheduleId),
                    eq(subscriptions.userId, ctx.user.id),
                ),
            });

            if (!ownedSubscription) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Subscription schedule not found',
                });
            }

            try {
                await releaseSubscriptionSchedule({
                    subscriptionScheduleId: input.subscriptionScheduleId,
                });
            } catch (error: any) {
                // If the schedule is already released then the code should update the subscription to reflect that.
                // This case is supposed to be handled in the webhook but was implemented here just in case.
                if (
                    !(
                        error &&
                        typeof error === 'object' &&
                        'type' in error &&
                        error.type === 'invalid_request_error'
                    )
                ) {
                    throw error;
                }
            }

            const [updatedSubscription] = await ctx.db
                .update(subscriptions)
                .set({
                    status: SubscriptionStatus.ACTIVE,
                    updatedAt: new Date(),
                    scheduledPriceId: null,
                    stripeSubscriptionScheduleId: null,
                    scheduledChangeAt: null,
                })
                .where(eq(subscriptions.stripeSubscriptionScheduleId, input.subscriptionScheduleId))
                .returning();

            if (!updatedSubscription) {
                throw new Error('Subscription not found');
            }

            return updatedSubscription;
        }),
});
