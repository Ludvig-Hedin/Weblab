'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

import { setConvexAuthFetcher } from '@/components/store/lib/convex-http-client';

/**
 * Bridges Clerk's session token into the MobX-side singleton
 * `ConvexHttpClient`. Mount once inside `<ClerkConvexProviders>` so the
 * client's auth follows the live Clerk session.
 *
 * React components use `convex/react` hooks which already authenticate via
 * `ConvexProviderWithClerk` — this bridge is ONLY for class-based stores
 * (editor api, branch manager, frames manager, screenshot, conversation,
 * comment, canvas, create manager) that import the singleton directly.
 *
 * Without this bridge those stores' calls return UNAUTHORIZED on every
 * protected query/mutation/action.
 */
export function ConvexAuthBridge() {
    const { getToken, isSignedIn, isLoaded } = useAuth();

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setConvexAuthFetcher(null);
            return;
        }
        // Token rotates ~every 60s. Re-register a fresh fetcher every minute
        // so the singleton picks up the new token before the old one expires.
        const fetcher = () => getToken({ template: 'convex' });
        setConvexAuthFetcher(fetcher);
        const interval = setInterval(() => {
            setConvexAuthFetcher(fetcher);
        }, 50_000);
        return () => clearInterval(interval);
    }, [getToken, isSignedIn, isLoaded]);

    return null;
}
