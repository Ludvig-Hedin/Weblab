import 'server-only';

import type { BridgedUser } from '@/utils/auth/types';
import { getClerkBridgedUser } from '@/utils/auth/clerk-bridge';
import { sanitizeReturnUrl } from '@/utils/auth/sanitize-return-url';

/**
 * Post-migration identity helper for Server Components and route handlers.
 *
 * Returns a `BridgedUser` (synthetic Supabase-`User`-shaped object) regardless
 * — the bridge populates this from the Clerk identity. Kept to avoid breaking
 * every call site at once; the synthetic shape stays around until we migrate
 * every consumer to Convex `users.me` directly.
 */
export async function getCurrentUser(): Promise<BridgedUser | null> {
    return getClerkBridgedUser();
}

export function getSignInUrl(returnUrl?: string | null): string {
    const safeReturnUrl = sanitizeReturnUrl(returnUrl);
    if (!safeReturnUrl) return '/sign-in';
    const params = new URLSearchParams({ returnUrl: safeReturnUrl });
    return `/sign-in?${params.toString()}`;
}
