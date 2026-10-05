import 'server-only';

import type { BridgedUser } from '@/utils/auth/types';
import { isEmailOnAllowlist, parseSignInAllowlist } from '@convex/lib/signInAllowlist';

import { env } from '@/env';
import { IS_LOCAL_APP_MODE } from '@/lib/site-mode';
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
    const user = await getClerkBridgedUser();
    if (user && !isSignInAllowed(user.email)) return null;
    return user;
}

/**
 * Local-app mode is invite-only: only emails on WEBLAB_SIGN_IN_ALLOWLIST may
 * use the web app. Cloud mode allows everyone. The default list is repeated
 * here because SKIP_ENV_VALIDATION skips the zod default in `env.ts`.
 */
export function isSignInAllowed(email: string | undefined | null): boolean {
    if (!IS_LOCAL_APP_MODE) return true;
    const allowlist = parseSignInAllowlist(
        env.WEBLAB_SIGN_IN_ALLOWLIST || 'ludvighedin15@gmail.com',
    );
    return isEmailOnAllowlist(email, allowlist);
}

export function getSignInUrl(returnUrl?: string | null): string {
    const safeReturnUrl = sanitizeReturnUrl(returnUrl);
    if (!safeReturnUrl) return '/sign-in';
    const params = new URLSearchParams({ returnUrl: safeReturnUrl });
    return `/sign-in?${params.toString()}`;
}
