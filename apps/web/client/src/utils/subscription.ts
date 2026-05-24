import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';

interface UserSubscriptionStatus {
    hasActiveSubscription: boolean;
    hasLegacySubscription: boolean;
}

/**
 * Post-migration: reads subscription status from Convex.
 *
 * `userId` is accepted for source-compatibility but ignored — Convex resolves
 * the caller via Clerk identity, so the bridge is implicit. `userEmail` is
 * still used by Convex's `getLegacySubscriptions` lookup (legacy promo codes
 * keyed by email).
 */
export async function checkUserSubscriptionAccess(
    _userId: string,
    userEmail?: string | null,
): Promise<UserSubscriptionStatus> {
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    const tokenOpt = token ? { token } : undefined;

    const subscription = await fetchQuery(api.subscriptions.get, {}, tokenOpt);
    const legacy = userEmail
        ? await fetchQuery(api.subscriptions.getLegacySubscriptions, {}, tokenOpt)
        : [];

    const hasLegacy = Array.isArray(legacy)
        ? legacy.some(
              (row: { email?: string; redeemAt?: number | null }) =>
                  row.email?.toLowerCase() === userEmail?.toLowerCase() && !row.redeemAt,
          )
        : false;

    return {
        hasActiveSubscription:
            !!subscription && (subscription as { status?: string }).status === 'active',
        hasLegacySubscription: hasLegacy,
    };
}
