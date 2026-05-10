'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { toast } from '@weblab/ui/sonner';

/**
 * Surfaces OAuth callback errors as a toast on whichever page the user lands
 * on. The provider start route (`/api/auth/providers/[provider]/start`) sends
 * users back to a saved `redirectTo` (defaulting to `/projects`) with
 * `?provider_oauth_error=<code>`. This listener is mounted once at the root
 * layout so both `/projects` and `/project/[id]` are covered without
 * duplicating the effect inside any single feature surface.
 *
 * Keyed messages cover the common failure codes; unknown codes get a generic
 * line so we never echo raw env-var names back to the user.
 */
export function OAuthErrorToast() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        const errorCode = searchParams.get('provider_oauth_error');
        if (!errorCode) return;
        const friendly =
            errorCode === 'token_exchange_failed'
                ? 'Sign-in failed during token exchange. Try again.'
                : errorCode === 'provider_not_configured'
                  ? "This provider isn't available yet. We'll enable it soon."
                  : errorCode === 'invalid_callback'
                    ? 'Sign-in callback was invalid. Try again.'
                    : 'Sign-in failed. Try again in a moment.';
        toast.error('Provider sign-in failed', { description: friendly });

        // Strip the query so a refresh / re-render doesn't re-fire the toast.
        // Preserve any other query params and the URL hash the page may rely on.
        const next = new URLSearchParams(searchParams.toString());
        next.delete('provider_oauth_error');
        const query = next.toString();
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        try {
            router.replace(`${pathname}${query ? `?${query}` : ''}${hash}`);
        } catch (error) {
            console.error('Failed to clear OAuth error parameter:', error);
        }
    }, [searchParams, router, pathname]);

    return null;
}
