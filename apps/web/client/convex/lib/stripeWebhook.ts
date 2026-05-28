import { v } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { internalMutation, internalQuery } from '../_generated/server';
import { getUserByClerkIdSafe } from './permissions';

// Convex Stripe webhook handlers. INTERNAL — invoked only by the
// `/webhooks/stripe` httpAction in `convex/http.ts` after signature
// verification. Each handler accepts a JSON-cloned subset of the Stripe
// event payload (`StripeEventInput`) — the raw `Stripe.Event` object is
// not Convex-serializable.
//
// Why we re-parse on the Convex side instead of passing the full event:
//   1. Convex validators must enclose every value crossing the action ↔
//      mutation boundary; `v.any()` would work but loses type-safety.
//   2. The webhook caller already has the strongly-typed `Stripe.Event`
//      before calling here — passing just the fields we care about
//      keeps the mutation contract narrow.

// ─── Shared event input shape ────────────────────────────────────────────────
//
// Captures the minimum a handler needs: subscription id, item id, schedule id
// (optional), price id, customer id, period start/end (epoch seconds),
// status string, optional cancel_at (epoch seconds).

const vSubEventInput = v.object({
    // Top-level Stripe event id (`evt_…`) — drives webhook idempotency.
    eventId: v.string(),
    subscriptionId: v.string(),
    subscriptionItemId: v.string(),
    subscriptionScheduleId: v.optional(v.string()),
    priceId: v.string(),
    customerId: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    stripeStatus: v.string(),
    cancelAt: v.optional(v.number()),
});

type SubEventInput = {
    eventId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    subscriptionScheduleId?: string;
    priceId: string;
    customerId: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    stripeStatus: string;
    cancelAt?: number;
};

// ─── Util — random carryOverKey ──────────────────────────────────────────────
//
// Drizzle used `uuid()` from the `uuid` package. Convex actions/mutations
// have access to `crypto.randomUUID()` (Web Crypto) so we avoid pulling in
// an extra dep just for this.
function carryOverKey(): string {
    return crypto.randomUUID();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findUserByStripeCustomerId(
    ctx: MutationCtx,
    stripeCustomerId: string,
): Promise<Doc<'users'> | null> {
    return ctx.db
        .query('users')
        .withIndex('by_stripe_customer_id', (q) => q.eq('stripeCustomerId', stripeCustomerId))
        .unique();
}

async function findPriceByStripeId(
    ctx: MutationCtx,
    stripePriceId: string,
): Promise<Doc<'prices'> | null> {
    return ctx.db
        .query('prices')
        .withIndex('by_stripe_price_id', (q) => q.eq('stripePriceId', stripePriceId))
        .unique();
}

async function findSubscriptionByStripeId(
    ctx: MutationCtx,
    stripeSubscriptionId: string,
): Promise<Doc<'subscriptions'> | null> {
    return ctx.db
        .query('subscriptions')
        .withIndex('by_stripe_subscription_id', (q) =>
            q.eq('stripeSubscriptionId', stripeSubscriptionId),
        )
        .unique();
}

async function findSubscriptionByStripeItemId(
    ctx: MutationCtx,
    stripeSubscriptionItemId: string,
): Promise<Doc<'subscriptions'> | null> {
    return ctx.db
        .query('subscriptions')
        .withIndex('by_stripe_subscription_item_id', (q) =>
            q.eq('stripeSubscriptionItemId', stripeSubscriptionItemId),
        )
        .unique();
}

function isTierUpgrade(currentLimit: number, newLimit: number): boolean {
    return newLimit > currentLimit;
}

// ─── Webhook idempotency ─────────────────────────────────────────────────────
//
// Stripe retries deliveries on 5xx for up to 3 days and may double-deliver even
// on 2xx. Record each processed `evt.id` in `stripeEventLog` inside the same
// transaction as the handler's work, and skip if already present, so the
// credit-granting branches run exactly once per event. Convex OCC closes the
// concurrent-duplicate race: the second transaction's `by_event_id` read is
// invalidated by the first transaction's insert and retries into the
// "already processed" path.
async function alreadyProcessed(
    ctx: MutationCtx,
    eventId: string,
    eventType: string,
): Promise<boolean> {
    const existing = await ctx.db
        .query('stripeEventLog')
        .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
        .unique();
    if (existing) return true;
    await ctx.db.insert('stripeEventLog', {
        eventId,
        eventType,
        processedAt: Date.now(),
    });
    return false;
}

// ─── _setStripeCustomerId ────────────────────────────────────────────────────
//
// Used by the `checkout` action when it creates a fresh Stripe customer for
// a user that didn't have one yet. `users.setStripeCustomerId` only exists
// as a public mutation (caller-scoped via requireUser), so we need an
// internal variant that takes the userId explicitly for action → mutation
// flows.
export const _setStripeCustomerId = internalMutation({
    args: {
        userId: v.id('users'),
        stripeCustomerId: v.string(),
    },
    handler: async (ctx, { userId, stripeCustomerId }) => {
        await ctx.db.patch(userId, { stripeCustomerId, updatedAt: Date.now() });
    },
});

// ─── _handleSubCreated ───────────────────────────────────────────────────────
//
// Port of apps/web/client/src/app/webhook/stripe/subscription/create.ts.
//
// Idempotency:
//   * `subscriptions` has an app-level unique key on stripeSubscriptionItemId
//     (enforced here via lookup-then-upsert).
//   * `rateLimits` insert is split: only inserted when the subscription row
//     was actually new — fixes the duplicate-rate-limit bug called out as
//     TODO(bug-hunt) in the Drizzle handler.
export const _handleSubCreated = internalMutation({
    args: { event: vSubEventInput },
    handler: async (ctx, { event }) => {
        const input = event as SubEventInput;
        if (await alreadyProcessed(ctx, input.eventId, 'customer.subscription.created')) return;

        const price = await findPriceByStripeId(ctx, input.priceId);
        if (!price) {
            throw new Error(`No price found for price ID: ${input.priceId}`);
        }

        const user = await findUserByStripeCustomerId(ctx, input.customerId);
        if (!user) {
            throw new Error(`No user found for customer ID: ${input.customerId}`);
        }

        const now = Date.now();
        const periodStart = input.currentPeriodStart * 1000;
        const periodEnd = input.currentPeriodEnd * 1000;

        const existing = await findSubscriptionByStripeItemId(ctx, input.subscriptionItemId);

        let subscriptionId: Id<'subscriptions'>;
        let createdRateLimit = false;
        if (existing) {
            await ctx.db.patch(existing._id, {
                userId: user._id,
                priceId: price._id,
                productId: price.productId,
                status: 'active',
                stripeCustomerId: input.customerId,
                stripeSubscriptionId: input.subscriptionId,
                stripeCurrentPeriodStart: periodStart,
                stripeCurrentPeriodEnd: periodEnd,
                updatedAt: now,
            });
            subscriptionId = existing._id;
        } else {
            subscriptionId = await ctx.db.insert('subscriptions', {
                userId: user._id,
                productId: price.productId,
                priceId: price._id,
                startedAt: now,
                updatedAt: now,
                status: 'active',
                stripeCustomerId: input.customerId,
                stripeSubscriptionId: input.subscriptionId,
                stripeSubscriptionItemId: input.subscriptionItemId,
                stripeCurrentPeriodStart: periodStart,
                stripeCurrentPeriodEnd: periodEnd,
            });
            createdRateLimit = true;
        }

        if (createdRateLimit) {
            await ctx.db.insert('rateLimits', {
                userId: user._id,
                subscriptionId,
                updatedAt: now,
                startedAt: periodStart,
                endedAt: periodEnd,
                max: price.monthlyMessageLimit,
                left: price.monthlyMessageLimit,
                carryOverKey: carryOverKey(),
                carryOverTotal: 0,
                stripeSubscriptionItemId: input.subscriptionItemId,
            });
        }

        return { subscriptionId, createdRateLimit };
    },
});

// ─── _handleSubUpdated ───────────────────────────────────────────────────────
//
// Port of apps/web/client/src/app/webhook/stripe/subscription/update.ts.
//
// Schedule-fetching from Stripe (Drizzle `updateSubscriptionScheduleIfNeeded`
// reads `stripe.subscriptionSchedules.retrieve`) does not happen here — the
// Convex internalMutation cannot call the Stripe SDK directly. The Stripe-
// action layer (`convex/subscriptionActions.ts`) handles schedule reads. The
// webhook still patches schedule-related fields based on the IDs delivered
// in the event payload; full schedule resolution is the job of the
// release/update actions, which the user invokes directly.
export const _handleSubUpdated = internalMutation({
    args: { event: vSubEventInput },
    handler: async (ctx, { event }) => {
        const input = event as SubEventInput;
        if (await alreadyProcessed(ctx, input.eventId, 'customer.subscription.updated')) return;
        const subscription = await findSubscriptionByStripeId(ctx, input.subscriptionId);
        if (!subscription) {
            throw new Error('Subscription not found');
        }

        const newPrice = await findPriceByStripeId(ctx, input.priceId);
        if (!newPrice) {
            throw new Error(`No price found for updated price ID: ${input.priceId}`);
        }

        const currentPrice = await ctx.db.get(subscription.priceId);
        if (!currentPrice) {
            throw new Error(`No price found for current price ID: ${subscription.priceId}`);
        }

        const periodStart = input.currentPeriodStart * 1000;
        const periodEnd = input.currentPeriodEnd * 1000;
        const now = Date.now();

        const isUpgrade = isTierUpgrade(
            currentPrice.monthlyMessageLimit,
            newPrice.monthlyMessageLimit,
        );
        const isRenewal =
            input.stripeStatus === 'active' && periodEnd !== subscription.stripeCurrentPeriodEnd;

        let renew = false;
        if (isUpgrade) {
            await ctx.db.patch(subscription._id, {
                priceId: newPrice._id,
                productId: newPrice.productId,
                scheduledAction: undefined,
                scheduledChangeAt: undefined,
                scheduledPriceId: undefined,
                stripeSubscriptionScheduleId: undefined,
                updatedAt: now,
            });

            // Pro-rated upgrade mid-period — issue a delta rate limit for the
            // tier increase. Non-pro-rated (= new full period) falls through
            // to the renewal path below.
            const isProRated = periodEnd === subscription.stripeCurrentPeriodEnd;
            const tierIncrease = newPrice.monthlyMessageLimit - currentPrice.monthlyMessageLimit;
            if (isProRated) {
                await ctx.db.insert('rateLimits', {
                    userId: subscription.userId,
                    subscriptionId: subscription._id,
                    updatedAt: now,
                    startedAt: periodStart,
                    endedAt: periodEnd,
                    max: tierIncrease,
                    left: tierIncrease,
                    carryOverKey: carryOverKey(),
                    carryOverTotal: 0,
                    stripeSubscriptionItemId: input.subscriptionItemId,
                });
            } else {
                renew = true;
            }
        } else if (isRenewal) {
            renew = true;
        }

        if (renew) {
            await handleSubscriptionRenewed(
                ctx,
                subscription,
                periodStart,
                periodEnd,
                input.subscriptionItemId,
                newPrice,
            );
        }

        if (input.cancelAt) {
            const cancelAt = input.cancelAt * 1000;
            await ctx.db.patch(subscription._id, {
                priceId: newPrice._id,
                productId: newPrice.productId,
                scheduledAction: 'cancellation',
                scheduledChangeAt: cancelAt,
                stripeSubscriptionItemId: input.subscriptionItemId,
                updatedAt: now,
            });
        } else if (!input.subscriptionScheduleId) {
            // No schedule on the latest event — clear any scheduled-change
            // state that may be stale in our DB.
            await ctx.db.patch(subscription._id, {
                scheduledAction: undefined,
                scheduledChangeAt: undefined,
                scheduledPriceId: undefined,
                stripeSubscriptionScheduleId: undefined,
                updatedAt: now,
            });
        } else {
            // Schedule id is present. We record it but defer full
            // schedule-phase resolution to the Stripe-action layer (which
            // can call `stripe.subscriptionSchedules.retrieve`).
            await ctx.db.patch(subscription._id, {
                stripeSubscriptionScheduleId: input.subscriptionScheduleId,
                updatedAt: now,
            });
        }
    },
});

// Carry-over logic identical to the Drizzle handler:
//   1. Each existing rate limit on the subscription gets its endedAt clipped
//      to the new period's start.
//   2. If a rate limit hasn't been carried over yet (carryOverTotal === 0),
//      mint a new rate limit for the leftover credits with carryOverTotal
//      bumped. Subsequent carry-overs are NOT minted — leftover credits at
//      that point are lost intentionally, matching upstream behavior.
//   3. Mint a fresh full-quota rate limit for the new period.
async function handleSubscriptionRenewed(
    ctx: MutationCtx,
    subscription: Doc<'subscriptions'>,
    currentPeriodStart: number,
    currentPeriodEnd: number,
    stripeSubscriptionItemId: string,
    newPrice: Doc<'prices'>,
): Promise<void> {
    const now = Date.now();

    const rates = await ctx.db
        .query('rateLimits')
        .withIndex('by_subscription', (q) => q.eq('subscriptionId', subscription._id))
        .collect();

    const previousItemRates = rates.filter(
        (r) => r.stripeSubscriptionItemId === subscription.stripeSubscriptionItemId,
    );

    for (const rate of previousItemRates) {
        await ctx.db.patch(rate._id, {
            endedAt: currentPeriodStart,
            updatedAt: now,
        });

        if (rate.carryOverTotal === 0 && rate.left > 0) {
            await ctx.db.insert('rateLimits', {
                userId: subscription.userId,
                subscriptionId: subscription._id,
                updatedAt: now,
                startedAt: currentPeriodStart,
                endedAt: currentPeriodEnd,
                max: rate.left,
                left: rate.left,
                carryOverKey: rate.carryOverKey,
                carryOverTotal: rate.carryOverTotal + 1,
                stripeSubscriptionItemId,
            });
        }
    }

    await ctx.db.insert('rateLimits', {
        userId: subscription.userId,
        subscriptionId: subscription._id,
        updatedAt: now,
        startedAt: currentPeriodStart,
        endedAt: currentPeriodEnd,
        max: newPrice.monthlyMessageLimit,
        left: newPrice.monthlyMessageLimit,
        carryOverKey: carryOverKey(),
        carryOverTotal: 0,
        stripeSubscriptionItemId,
    });

    await ctx.db.patch(subscription._id, {
        status: 'active',
        priceId: newPrice._id,
        productId: newPrice.productId,
        stripeSubscriptionItemId,
        stripeCurrentPeriodStart: currentPeriodStart,
        stripeCurrentPeriodEnd: currentPeriodEnd,
        updatedAt: now,
    });
}

// ─── _handleSubDeleted ───────────────────────────────────────────────────────
//
// Fires when the subscription EXPIRES (Stripe-side). User-initiated cancel
// arrives as `customer.subscription.updated` with a `cancel_at` field — see
// the _handleSubUpdated branch above.
export const _handleSubDeleted = internalMutation({
    args: { event: vSubEventInput },
    handler: async (ctx, { event }) => {
        const input = event as SubEventInput;
        if (await alreadyProcessed(ctx, input.eventId, 'customer.subscription.deleted')) return;
        const subscription = await findSubscriptionByStripeId(ctx, input.subscriptionId);
        if (!subscription) {
            // Webhook for a subscription we never persisted — accept-ignore.
            return;
        }
        const now = Date.now();
        await ctx.db.patch(subscription._id, {
            status: 'canceled',
            endedAt: now,
            updatedAt: now,
        });
    },
});

// ─── _handleSubPaused / _handleSubResumed ────────────────────────────────────
//
// Stripe pause/resume map to our two-state status (active|canceled). Paused
// = treated as canceled so entitlements drop; resumed = back to active.
export const _handleSubPaused = internalMutation({
    args: { event: vSubEventInput },
    handler: async (ctx, { event }) => {
        const input = event as SubEventInput;
        if (await alreadyProcessed(ctx, input.eventId, 'customer.subscription.paused')) return;
        const subscription = await findSubscriptionByStripeId(ctx, input.subscriptionId);
        if (!subscription) return;
        const now = Date.now();
        await ctx.db.patch(subscription._id, {
            status: 'canceled',
            endedAt: now,
            updatedAt: now,
        });
    },
});

export const _handleSubResumed = internalMutation({
    args: { event: vSubEventInput },
    handler: async (ctx, { event }) => {
        const input = event as SubEventInput;
        if (await alreadyProcessed(ctx, input.eventId, 'customer.subscription.resumed')) return;
        const subscription = await findSubscriptionByStripeId(ctx, input.subscriptionId);
        if (!subscription) return;
        const now = Date.now();
        await ctx.db.patch(subscription._id, {
            status: 'active',
            endedAt: undefined,
            updatedAt: now,
        });
    },
});

// ─── _applyScheduleChange ────────────────────────────────────────────────────
//
// Called by the `update` action in convex/subscriptionActions.ts after a
// downgrade has been scheduled with Stripe. The action gathers the schedule
// id + downgrade target priceId; this mutation persists the scheduled change
// onto our subscription row.
export const _applyScheduleChange = internalMutation({
    args: {
        stripeSubscriptionItemId: v.string(),
        stripeSubscriptionScheduleId: v.string(),
        scheduledPriceId: v.id('prices'),
        scheduledChangeAt: v.number(),
    },
    handler: async (ctx, args) => {
        const subscription = await findSubscriptionByStripeItemId(
            ctx,
            args.stripeSubscriptionItemId,
        );
        if (!subscription) {
            throw new Error('Subscription not found for scheduled change');
        }
        await ctx.db.patch(subscription._id, {
            scheduledAction: 'price_change',
            scheduledChangeAt: args.scheduledChangeAt,
            scheduledPriceId: args.scheduledPriceId,
            stripeSubscriptionScheduleId: args.stripeSubscriptionScheduleId,
            updatedAt: Date.now(),
        });
    },
});

// ─── _clearScheduleChange ────────────────────────────────────────────────────
//
// Called after the `releaseSubscriptionSchedule` action drops a future
// downgrade. Restores ACTIVE state and clears all scheduled-change columns.
export const _clearScheduleChange = internalMutation({
    args: { stripeSubscriptionScheduleId: v.string() },
    handler: async (ctx, { stripeSubscriptionScheduleId }) => {
        const subscription = await ctx.db
            .query('subscriptions')
            .filter((q) =>
                q.eq(q.field('stripeSubscriptionScheduleId'), stripeSubscriptionScheduleId),
            )
            .unique();
        if (!subscription) {
            throw new Error('Subscription not found');
        }
        await ctx.db.patch(subscription._id, {
            status: 'active',
            scheduledAction: undefined,
            scheduledChangeAt: undefined,
            scheduledPriceId: undefined,
            stripeSubscriptionScheduleId: undefined,
            updatedAt: Date.now(),
        });
        return subscription._id;
    },
});

// ─── _resolvePriceByStripeId (internal, for actions) ─────────────────────────
//
// Convex actions can't access ctx.db directly; they call this to resolve a
// Stripe price ID → our Convex `prices._id` (needed for _applyScheduleChange).
export const _resolvePriceIdByStripeId = internalQuery({
    args: { stripePriceId: v.string() },
    handler: async (ctx, { stripePriceId }) => {
        const price = await ctx.db
            .query('prices')
            .withIndex('by_stripe_price_id', (q) => q.eq('stripePriceId', stripePriceId))
            .unique();
        return price?._id ?? null;
    },
});

// ─── _loadUserForCheckout (internal, for actions) ────────────────────────────
//
// Action-side load of the caller's user record + Stripe customer id. Returns
// the minimum the checkout action needs without exposing the full user doc
// across the action boundary.
export const _loadUserForCheckout = internalQuery({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) => {
        const user = await ctx.db.get(userId);
        if (!user) return null;
        return {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            stripeCustomerId: user.stripeCustomerId,
        };
    },
});

// ─── _resolveCallerUserId (internal, for actions) ────────────────────────────
//
// Convex actions cannot read documents directly. They use this to resolve
// the currently authenticated Clerk identity to a Convex users._id (after
// the caller already passed JIT user creation in a separate mutation, or
// has signed up via the webhook).
export const _resolveCallerUserId = internalQuery({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;
        // `.collect()` + dedupe via the shared helper — never `.unique()`
        // on by_clerk_user_id. Duplicate rows from the JIT/webhook race
        // would otherwise break checkout, subscription management, and
        // promo flows for affected users.
        const user = await getUserByClerkIdSafe(ctx, identity.subject);
        if (!user) return null;
        return {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            stripeCustomerId: user.stripeCustomerId,
        };
    },
});

// ─── _findActiveProSubscriptionForPromo (internal, for actions) ──────────────
//
// startPromoCheckout needs to reject callers that already have an active Pro
// subscription. Mirrors the equivalent check in the original tRPC procedure.
export const _findActiveProSubscriptionForPromo = internalQuery({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) => {
        const sub = await ctx.db
            .query('subscriptions')
            .withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'active'))
            .unique();
        if (!sub) return false;
        const product = await ctx.db.get(sub.productId);
        return product?.type === 'pro';
    },
});

// ─── _findPriceByKey (internal, for actions) ─────────────────────────────────
export const _findPriceByKey = internalQuery({
    args: {
        priceKey: v.union(
            v.literal('PRO_MONTHLY_TIER_1'),
            v.literal('PRO_MONTHLY_TIER_2'),
            v.literal('PRO_MONTHLY_TIER_3'),
            v.literal('PRO_MONTHLY_TIER_4'),
            v.literal('PRO_MONTHLY_TIER_5'),
            v.literal('PRO_MONTHLY_TIER_6'),
            v.literal('PRO_MONTHLY_TIER_7'),
            v.literal('PRO_MONTHLY_TIER_8'),
            v.literal('PRO_MONTHLY_TIER_9'),
            v.literal('PRO_MONTHLY_TIER_10'),
            v.literal('PRO_MONTHLY_TIER_11'),
        ),
    },
    handler: async (ctx, { priceKey }) => {
        const price = await ctx.db
            .query('prices')
            .withIndex('by_key', (q) => q.eq('key', priceKey))
            .unique();
        return price?.stripePriceId ?? null;
    },
});

// ─── _findActiveSubscriptionForCaller (internal, for actions) ────────────────
//
// Used by manageSubscription action to look up the Stripe customer id for
// the billing portal session.
export const _findActiveSubscriptionForCaller = internalQuery({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) => {
        const sub = await ctx.db
            .query('subscriptions')
            .withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'active'))
            .unique();
        if (!sub) return null;
        return {
            id: sub._id,
            stripeCustomerId: sub.stripeCustomerId,
            stripeSubscriptionId: sub.stripeSubscriptionId,
            stripeSubscriptionItemId: sub.stripeSubscriptionItemId,
            stripeSubscriptionScheduleId: sub.stripeSubscriptionScheduleId,
            priceId: sub.priceId,
        };
    },
});

// ─── _findOwnedSubscriptionBySchedule (internal, for actions) ────────────────
//
// Confirm the caller owns the subscription tied to a given schedule ID before
// performing any Stripe-side mutation (CR-060 from the upstream router).
export const _findOwnedSubscriptionBySchedule = internalQuery({
    args: {
        userId: v.id('users'),
        stripeSubscriptionScheduleId: v.string(),
    },
    handler: async (ctx, { userId, stripeSubscriptionScheduleId }) => {
        const subs = await ctx.db
            .query('subscriptions')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        return (
            subs.find((s) => s.stripeSubscriptionScheduleId === stripeSubscriptionScheduleId) ??
            null
        );
    },
});

// ─── _findOwnedSubscriptionForUpdate (internal, for actions) ─────────────────
//
// Same CR-060 ownership check, but keyed by (stripeSubscriptionId,
// stripeSubscriptionItemId) for the update action.
export const _findOwnedSubscriptionForUpdate = internalQuery({
    args: {
        userId: v.id('users'),
        stripeSubscriptionId: v.string(),
        stripeSubscriptionItemId: v.string(),
    },
    handler: async (ctx, { userId, stripeSubscriptionId, stripeSubscriptionItemId }) => {
        const sub = await ctx.db
            .query('subscriptions')
            .withIndex('by_stripe_subscription_item_id', (q) =>
                q.eq('stripeSubscriptionItemId', stripeSubscriptionItemId),
            )
            .unique();
        if (!sub) return null;
        if (sub.userId !== userId) return null;
        if (sub.stripeSubscriptionId !== stripeSubscriptionId) return null;
        const currentPrice = await ctx.db.get(sub.priceId);
        return {
            id: sub._id,
            stripeSubscriptionScheduleId: sub.stripeSubscriptionScheduleId,
            currentPrice: currentPrice
                ? {
                      id: currentPrice._id,
                      monthlyMessageLimit: currentPrice.monthlyMessageLimit,
                  }
                : null,
        };
    },
});

// ─── _findPriceForStripeId (internal query, for update action) ──────────────
export const _findPriceForStripeId = internalQuery({
    args: { stripePriceId: v.string() },
    handler: async (ctx, { stripePriceId }) => {
        const price = await ctx.db
            .query('prices')
            .withIndex('by_stripe_price_id', (q) => q.eq('stripePriceId', stripePriceId))
            .unique();
        if (!price) return null;
        return {
            id: price._id,
            monthlyMessageLimit: price.monthlyMessageLimit,
        };
    },
});
