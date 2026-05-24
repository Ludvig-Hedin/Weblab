import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

// Scheduled jobs. Run on the Convex deployment side — no extra infrastructure.

const crons = cronJobs();

// Purge stale cursor rows every 5 minutes. Without this the `cursors` table
// accumulates one orphan row per disconnected client (browser crash, tab
// close without `presence.leave` firing). Over time the `by_project_lastSeen`
// scan slows and storage bloats. Cleanup is cheap — index range query +
// delete.
crons.interval(
    'purge stale cursors',
    { minutes: 5 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (internal as any)['internal/cleanup'].purgeStaleCursors,
);

export default crons;
