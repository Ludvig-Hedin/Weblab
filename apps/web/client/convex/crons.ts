import { cronJobs, makeFunctionReference } from 'convex/server';

import { internal } from './_generated/api';

// Scheduled jobs. Run on the Convex deployment side — no extra infrastructure.

const crons = cronJobs();

// Durable cloud sources own their upload records and short retry receipts.
crons.interval('collect cloud source uploads', { hours: 1 }, makeFunctionReference<'mutation', Record<string, never>, null>('cloudEditorUploads:sweep'), {});
crons.interval('collect cloud customer images', { hours: 1 }, makeFunctionReference<'mutation', Record<string, never>, null>('cloudEditorContentImages:sweep'), {});
crons.interval('collect cloud source receipts', { hours: 24 }, makeFunctionReference<'mutation', Record<string, never>, null>('cloudEditor:_collectReceipts'), {});


// Purge stale cursor rows every 5 minutes. Without this the `cursors` table
// accumulates one orphan row per disconnected client (browser crash, tab
// close without `presence.leave` firing). Over time the `by_project_lastSeen`
// scan slows and storage bloats. Cleanup is cheap — index range query +
// delete.
crons.interval('purge stale cursors', { minutes: 5 }, internal.internal.cleanup.purgeStaleCursors);

// Purge processed Stripe webhook events older than their retry window so the
// `stripeEventLog` idempotency table stays bounded (one row per event, forever
// otherwise). Daily is ample — the TTL is 7 days.
crons.interval(
    'purge stale stripe events',
    { hours: 24 },
    internal.internal.cleanup.purgeStaleStripeEvents,
);

// Purge stale `transcribeRateLimits` rows (F-476 fleet-wide anti-spam cap for
// POST /api/transcribe). Windows are 1 minute; daily is ample margin.
crons.interval(
    'purge stale transcribe rate limits',
    { hours: 24 },
    internal.internal.cleanup.purgeStaleTranscribeRateLimits,
);

// Purge AI safeguard rows (aiRateLimits / aiUserSpend) untouched for 2 days.
crons.interval(
    'purge stale ai guard rows',
    { hours: 24 },
    internal.internal.cleanup.purgeStaleAiGuardRows,
);

export default crons;
