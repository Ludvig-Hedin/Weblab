import { resolve } from 'node:path';
import { config } from 'dotenv';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@weblab/db/src/client';
import { PriceKey, ProductType, SubscriptionStatus } from '@weblab/stripe';

import { prices, products } from '../../schema';
import { subscriptions } from '../../schema/subscription/subscription';
import { users } from '../../schema/user/user';

// Load .env file
config({ path: resolve(import.meta.dir, '../../.env') });

const FREE_PERIOD_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const backfillFreeSubscriptions = async () => {
    console.log('Backfilling FREE subscriptions for users without an active plan...');

    const freeProduct = await db.query.products.findFirst({
        where: eq(products.type, ProductType.FREE),
    });
    if (!freeProduct) {
        throw new Error(
            'FREE product not found. Run `bun db:seed:stripe` (or db:seed) before backfilling.',
        );
    }

    const freePrice = await db.query.prices.findFirst({
        where: eq(prices.key, PriceKey.FREE_INITIAL),
    });
    if (!freePrice) {
        throw new Error(
            'FREE_INITIAL price not found. Run `bun db:seed:stripe` (or db:seed) before backfilling.',
        );
    }

    // Users left-joined to ACTIVE subscriptions; rows where the join is null have no ACTIVE plan.
    const rows = await db
        .select({ userId: users.id, createdAt: users.createdAt })
        .from(users)
        .leftJoin(
            subscriptions,
            and(
                eq(subscriptions.userId, users.id),
                eq(subscriptions.status, SubscriptionStatus.ACTIVE),
            ),
        )
        .where(isNull(subscriptions.id));

    console.log(`Found ${rows.length} users without an active subscription.`);

    const now = new Date();

    const valuesToInsert = rows.map(({ userId, createdAt }) => {
        const syntheticId = `free_${userId}`;
        const start = createdAt ?? now;
        const periodEnd = new Date(start.getTime() + FREE_PERIOD_DAYS * MS_PER_DAY);
        return {
            userId,
            productId: freePrice.productId,
            priceId: freePrice.id,
            status: SubscriptionStatus.ACTIVE,
            stripeCustomerId: syntheticId,
            stripeSubscriptionId: syntheticId,
            stripeSubscriptionItemId: syntheticId,
            stripeCurrentPeriodStart: start,
            stripeCurrentPeriodEnd: periodEnd,
        };
    });

    const result =
        valuesToInsert.length > 0
            ? await db
                  .insert(subscriptions)
                  .values(valuesToInsert)
                  .onConflictDoNothing({ target: [subscriptions.stripeSubscriptionId] })
                  .returning({ id: subscriptions.id })
            : [];

    const inserted = result.length;
    const skipped = rows.length - inserted;

    console.log(`Backfill complete. Inserted ${inserted}, skipped ${skipped}.`);
};

if (import.meta.main) {
    (async () => {
        try {
            if (!process.env.SUPABASE_DATABASE_URL) {
                throw new Error('Missing SUPABASE_DATABASE_URL');
            }
            await backfillFreeSubscriptions();
            process.exit(0);
        } catch (error) {
            console.error('Backfill failed:', error);
            process.exit(1);
        }
    })();
}
