'use node';

import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action } from './_generated/server';

// User-account actions that require Node-only SDKs (Clerk backend SDK).
// Public-facing: account deletion. Called from the settings UI.

/**
 * Delete the caller's account. Steps:
 *   1. Verify caller via Clerk identity (no fallback — must be signed in).
 *   2. Delete the Clerk identity FIRST so a partial failure cannot leave a
 *      re-signinable orphan.
 *   3. Run the Convex cascade (settings, providerConnections, workspaceMembers,
 *      projectMembers, owned personal workspace + its projects, skills,
 *      subscriptions, etc.) via internal.cascade.deleteUserCascade.
 *
 * Note: this is a Node-only action because @clerk/backend requires Node APIs.
 * The mutation it dispatches (deleteUserCascade) runs in V8 — actions cross
 * the runtime boundary via ctx.runMutation.
 */
export const remove = action({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('UNAUTHORIZED');

        // Resolve the Convex user id by Clerk subject so we know what to
        // cascade-delete on the Convex side after Clerk drops the identity.
        const user = await ctx.runQuery(internal.userActionsInternal._getByClerkId, {
            clerkUserId: identity.subject,
        });
        if (!user) {
            // Clerk identity exists but Convex row is missing — nothing to
            // cascade. Still drop the Clerk identity to keep state consistent.
            await deleteClerkIdentity(identity.subject);
            return { ok: true, cascaded: false } as const;
        }

        // 1. Delete Clerk identity first.
        await deleteClerkIdentity(identity.subject);

        // 2. Cascade Convex side. internal['internal/cascade'] is the slash-keyed
        // module name codegen produces for files under convex/internal/.
        await ctx.runMutation((internal as any)['internal/cascade'].deleteUserCascade, {
            userId: user._id,
        });

        return { ok: true, cascaded: true } as const;
    },
});

async function deleteClerkIdentity(clerkUserId: string): Promise<void> {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
        throw new Error(
            'CLERK_SECRET_KEY is not set on this Convex deployment. ' +
                'Run `bunx convex env set CLERK_SECRET_KEY <secret>` and retry.',
        );
    }
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey: secret });
    await clerk.users.deleteUser(clerkUserId);
}
