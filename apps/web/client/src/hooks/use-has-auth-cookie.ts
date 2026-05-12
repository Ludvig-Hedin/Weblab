'use client';

import { useEffect, useState } from 'react';

const SUPABASE_COOKIE_PATTERN = /(^|;\s*)sb-[^=]*-auth-token(\.\d+)?=/;

/**
 * Cheap client-side heuristic for "is this visitor signed in?". Reads the
 * Supabase auth cookie that @supabase/ssr sets on the browser. Returns:
 *   - `null` during SSR and first paint (we don't know yet)
 *   - `true`/`false` after mount
 *
 * Used to gate provider-level `api.user.*` queries so anonymous landing
 * visitors don't trigger a 401 round-trip on every page load. The server
 * still re-validates auth on every protected call — this is a perf hint,
 * not a security boundary.
 */
export function useHasAuthCookie(): boolean | null {
    const [hasCookie, setHasCookie] = useState<boolean | null>(null);

    useEffect(() => {
        const read = () => {
            if (typeof document === 'undefined') return;
            setHasCookie(SUPABASE_COOKIE_PATTERN.test(document.cookie));
        };
        read();
        // Re-check on focus so post-login pages start fetching user data
        // immediately without a hard reload.
        window.addEventListener('focus', read);
        return () => window.removeEventListener('focus', read);
    }, []);

    return hasCookie;
}
