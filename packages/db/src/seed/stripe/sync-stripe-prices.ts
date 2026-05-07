/**
 * sync-stripe-prices.ts
 *
 * Safe, idempotent script that fixes placeholder Stripe IDs in the database.
 * It updates existing rows in-place so no foreign-key cascades fire.
 *
 * Run once after a fresh db:seed (which inserts placeholder IDs):
 *   bun db:seed:sync-stripe
 */
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';

import { db } from '@weblab/db/src/client';
import { PriceKey, PRO_PRODUCT_CONFIG, ProductType } from '@weblab/stripe';
import { createStripeClient } from '@weblab/stripe/src/client';

import { prices, products } from '../../schema';

config({ path: '../../.env' });

const syncStripePrices = async () => {
    console.log('Fetching Stripe product and prices…');

    const stripe = createStripeClient();

    // ── 1. Resolve the Stripe product ───────────────────────────────────────
    let stripeProduct: Awaited<ReturnType<typeof stripe.products.list>>['data'][number] | undefined;
    for await (const product of stripe.products.list({ active: true, limit: 100 })) {
        if (product.name === PRO_PRODUCT_CONFIG.name) {
            stripeProduct = product;
            break;
        }
    }
    if (!stripeProduct) {
        throw new Error(`Stripe product "${PRO_PRODUCT_CONFIG.name}" not found`);
    }
    console.log(`Stripe product: ${stripeProduct.id} (${stripeProduct.name})`);

    // ── 2. Fetch all prices for that product ────────────────────────────────
    const stripePrices: Awaited<ReturnType<typeof stripe.prices.list>>['data'] = [];
    for await (const price of stripe.prices.list({ product: stripeProduct.id, limit: 100 })) {
        stripePrices.push(price);
    }
    console.log(`Found ${stripePrices.length} prices in Stripe`);

    // ── 3. Resolve / fix the DB product row ─────────────────────────────────
    // There may be a placeholder row (stripeProductId = 'prod_1234…') inserted
    // by db:seed. We update it in-place so existing price rows keep their FK.
    const [dbProduct] = await db
        .select()
        .from(products)
        .where(eq(products.type, ProductType.PRO))
        .limit(1);

    if (!dbProduct) {
        throw new Error('No PRO product row found in DB. Run bun db:seed first.');
    }

    if (dbProduct.stripeProductId !== stripeProduct.id) {
        console.log(
            `Updating product stripeProductId: ${dbProduct.stripeProductId} → ${stripeProduct.id}`,
        );
        await db
            .update(products)
            .set({ stripeProductId: stripeProduct.id, name: stripeProduct.name })
            .where(eq(products.id, dbProduct.id));
    } else {
        console.log(`Product stripeProductId already correct: ${stripeProduct.id}`);
    }

    // ── 4. Sync prices ───────────────────────────────────────────────────────
    let updated = 0;
    let inserted = 0;
    let skipped = 0;

    for (const stripePrice of stripePrices) {
        // Match by nickname (set to the PriceKey when prices were created).
        // Fall back to amount matching against PRO_PRODUCT_CONFIG.prices.
        let priceKey: PriceKey | undefined = stripePrice.nickname as PriceKey;

        if (!priceKey || !Object.values(PriceKey).includes(priceKey)) {
            // Fall back to cost + billing interval matching to avoid ambiguity
            // when two prices share the same unit_amount at different intervals.
            const interval = stripePrice.recurring?.interval;
            const intervalCount = stripePrice.recurring?.interval_count ?? 1;
            const priceConfig = PRO_PRODUCT_CONFIG.prices.find(
                (p) =>
                    p.cost === stripePrice.unit_amount &&
                    p.paymentInterval === interval &&
                    intervalCount === 1,
            );
            priceKey = priceConfig?.key;
        }

        if (!priceKey) {
            console.warn(
                `Skipping price ${stripePrice.id} — cannot determine PriceKey (nickname="${stripePrice.nickname}", amount=${stripePrice.unit_amount})`,
            );
            skipped++;
            continue;
        }

        const priceConfig = PRO_PRODUCT_CONFIG.prices.find((p) => p.key === priceKey);
        if (!priceConfig) {
            console.warn(`No config entry for key "${priceKey}" — skipping`);
            skipped++;
            continue;
        }

        // Find existing row(s) for this key under the PRO product
        const existing = await db
            .select()
            .from(prices)
            .where(and(eq(prices.productId, dbProduct.id), eq(prices.key, priceKey)));

        if (existing.length > 0) {
            const row = existing[0]!;
            if (row.stripePriceId === stripePrice.id) {
                console.log(`  ✓ ${priceKey} already correct (${stripePrice.id})`);
                skipped++;
            } else {
                // UPDATE in-place — safe even with the UNIQUE constraint because
                // the old value (a placeholder) won't conflict with the real ID.
                await db
                    .update(prices)
                    .set({ stripePriceId: stripePrice.id })
                    .where(eq(prices.id, row.id));
                console.log(`  ↻ Updated ${priceKey}: ${row.stripePriceId} → ${stripePrice.id}`);
                updated++;
            }
        } else {
            // INSERT the missing tier
            await db.insert(prices).values({
                productId: dbProduct.id,
                key: priceKey,
                monthlyMessageLimit: priceConfig.monthlyMessageLimit,
                stripePriceId: stripePrice.id,
            });
            console.log(`  + Inserted ${priceKey}: ${stripePrice.id}`);
            inserted++;
        }
    }

    console.log(
        `\nDone. Updated: ${updated}  Inserted: ${inserted}  Skipped: ${skipped}`,
    );
};

void (async () => {
    try {
        if (!process.env.SUPABASE_DATABASE_URL) {
            throw new Error('Missing SUPABASE_DATABASE_URL');
        }
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error('Missing STRIPE_SECRET_KEY');
        }
        await syncStripePrices();
        process.exit(0);
    } catch (err) {
        console.error('Sync failed:', err);
        process.exit(1);
    }
})();
