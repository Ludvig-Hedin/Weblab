import 'server-only';

import type { User } from '@supabase/supabase-js';
import { env } from '@/env';
import { getClerkBridgedUser } from '@/server/api/auth-bridge';
import { createClient } from '@/utils/supabase/server';

/**
 * Flag-aware identity helper for Server Components and route handlers.
 *
 * Returns the same `@supabase/supabase-js` `User` shape regardless of which
 * provider is active — the bridge populates a synthetic User when Clerk owns
 * the session. Layouts and API handlers can replace
 *
 *     const supabase = await createClient();
 *     const { data: { user } } = await supabase.auth.getUser();
 *
 * with a single call here.
 */
export async function getCurrentUser(): Promise<User | null> {
    if (env.WEBLAB_AUTH_PROVIDER === 'clerk') {
        return getClerkBridgedUser();
    }
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

/**
 * URL the layouts should redirect to when the caller is unauthenticated.
 * Phase 5 keeps both surfaces alive until the flag flips; this lets layouts
 * route to the right one without each file branching on the env var.
 */
export function getSignInUrl(returnUrl?: string | null): string {
    const base = env.WEBLAB_AUTH_PROVIDER === 'clerk' ? '/sign-in' : '/login';
    if (!returnUrl) return base;
    const params = new URLSearchParams({ returnUrl });
    return `${base}?${params.toString()}`;
}
