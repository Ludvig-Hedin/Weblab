import { query } from './_generated/server';

// Smoke endpoint — round-trips through the Convex deployment without touching
// auth or data. Used by /dev/convex-smoke to confirm the React client can
// reach Convex. Safe to delete once Phase 4 starts and real queries exist.

export const hello = query({
    args: {},
    handler: async () => {
        return { ok: true as const, ts: Date.now() };
    },
});
