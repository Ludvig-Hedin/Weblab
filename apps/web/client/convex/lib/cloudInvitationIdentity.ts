import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { getUserByClerkIdSafe } from './permissions';

/**
 * Compatibility boundary for legacy clerkUserId rows, scoped to the one Clerk
 * issuer explicitly configured in auth.config.ts. Never treat a subject as a
 * global identity key or accept a caller-supplied subject without this check.
 * Convex's canonical identifier is issuer|subject (also used by its CLI).
 */
export async function getCloudScopedIdentity(ctx: QueryCtx | MutationCtx) {
    const identity = await ctx.auth.getUserIdentity();
    const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
    if (
        !issuer ||
        identity?.issuer !== issuer ||
        typeof identity.subject !== 'string' ||
        !identity.subject ||
        identity.tokenIdentifier !== `${issuer}|${identity.subject}`
    )
        return null;
    return identity;
}

/**
 * Called only inside the pending claim transaction, after fresh verified-email,
 * token, expiry and current-issuer validation. Never used for accepted replay.
 * It establishes identity only; the same transaction must grant project access.
 */
export async function requireCloudInvitationIdentity(
    ctx: MutationCtx,
    subject: string,
): Promise<Doc<'users'>> {
    const identity = await getCloudScopedIdentity(ctx);
    if (identity?.subject !== subject) throw new Error('UNAUTHORIZED');
    const user = await getUserByClerkIdSafe(ctx, identity.subject);
    // Reuse the same earliest canonical row as ordinary permission checks.
    // Do not rewrite its email to the invited alias or delete referenced duplicates.
    if (user) {
        if (user.clerkUserId !== identity.subject) throw new Error('UNAUTHORIZED');
        return user;
    }
    const id = await ctx.db.insert('users', {
        clerkUserId: identity.subject,
        email: identity.email ?? undefined,
        firstName: identity.givenName ?? undefined,
        lastName: identity.familyName ?? undefined,
        displayName: identity.name ?? identity.email ?? undefined,
        avatarUrl: identity.pictureUrl ?? undefined,
        updatedAt: Date.now(),
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error('USER_INSERT_FAILED');
    return created;
}
