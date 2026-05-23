'use client';

import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

/**
 * Signs the user out of every provider currently in play. Phase 5 keeps
 * Supabase + Clerk side-by-side until the flag fully flips; calling both is
 * cheap and avoids stranded sessions.
 *
 * `clerkSignOut` should be the function from `useClerk().signOut` — pass it
 * in so this stays a pure helper without React context.
 */
export async function signOutEverywhere(clerkSignOut?: () => Promise<unknown>): Promise<void> {
    const supabase = createSupabaseBrowserClient();
    await Promise.allSettled([
        supabase.auth.signOut(),
        clerkSignOut ? clerkSignOut() : Promise.resolve(),
    ]);
}
