import { v } from 'convex/values';

import { internalQuery } from './_generated/server';

// V8-side internal helpers for the Node-only userActions.ts. Actions cannot
// declare internalQuery/internalMutation directly (the "use node" runtime
// doesn't support them), so they live here and are reached via
// `internal.userActionsInternal._getByClerkId`.
//
// NOTE: re-export the same name `_getByClerkId` under
// `internal.userActions._getByClerkId` via re-export trick? No — the action
// in userActions.ts calls `internal.userActionsInternal._getByClerkId` —
// fix the import there.

export const _getByClerkId = internalQuery({
    args: { clerkUserId: v.string() },
    handler: async (ctx, { clerkUserId }) => {
        return ctx.db
            .query('users')
            .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
            .unique();
    },
});
