'use client';

import { useEffect, useState } from 'react';

import { isClerkMode, useSafeClerkAuth } from '@/utils/auth/safe-clerk';

const SUPABASE_COOKIE_PATTERN = /(^|;\s*)sb-[^=]*-auth-token(\.\d+)?=/;
const CLERK_COOKIE_PATTERN = /(^|;\s*)__session=/;

/**
 * Cheap client-side heuristic for "is this visitor signed in?". Returns:
 *   - `null` during SSR and first paint (we don't know yet)
 *   - `true`/`false` after mount
 *
 * In clerk mode we read from `useAuth()` (authoritative — Clerk knows its
 * own session shape across staging/preview hosts where the cookie name
 * varies). In supabase mode we sniff the cookie. Used to gate provider-
 * level `api.user.*` queries so anonymous landing visitors don't trigger
 * a 401 round-trip on every page load. The server still re-validates auth
 * on every protected call — this is a perf hint, not a security boundary.
 */
export function useHasAuthCookie(): boolean | null {
    const clerkActive = isClerkMode();
    // useSafeClerkAuth returns a stub in supabase mode so we never call the
    // raw Clerk hook outside its provider.
    const clerk = useSafeClerkAuth();
    const [hasCookie, setHasCookie] = useState<boolean | null>(null);

    useEffect(() => {
        if (clerkActive) return; // handled by the Clerk branch below
        const read = () => {
            if (typeof document === 'undefined') return;
            const cookies = document.cookie;
            // Belt-and-braces: also accept a Clerk session cookie in case a
            // stale one lingers across a provider flip.
            const matched =
                SUPABASE_COOKIE_PATTERN.test(cookies) || CLERK_COOKIE_PATTERN.test(cookies);
            setHasCookie(matched);
        };
        read();
        // Re-check on focus so post-login pages start fetching user data
        // immediately without a hard reload.
        window.addEventListener('focus', read);
        return () => window.removeEventListener('focus', read);
    }, [clerkActive]);

    if (clerkActive) {
        if (!clerk.isLoaded) return null;
        return Boolean(clerk.isSignedIn);
    }
    return hasCookie;
}
