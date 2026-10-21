'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

import {
    captureConvexAuthOwner,
    setConvexAuthFetcher,
    setConvexAuthSession,
} from '@/components/store/lib/convex-http-client';

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
    const { getToken, isSignedIn, isLoaded, userId, sessionId } = useAuth();

    useLayoutEffect(() => {
        setConvexAuthSession(
            isLoaded && isSignedIn ? userId : null,
            isLoaded && isSignedIn ? sessionId : null,
        );
        const owner = captureConvexAuthOwner();
        return () => {
            if (owner?.isCurrent()) setConvexAuthSession(null, null);
        };
    }, [isLoaded, isSignedIn, userId, sessionId]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setConvexAuthFetcher(null);
            return;
        }
        // Token rotates ~every 60s. Re-register a fresh fetcher every minute
        // so the singleton picks up the new token before the old one expires.
        const owner = captureConvexAuthOwner();
        if (owner?.userId !== userId || owner.sessionId !== sessionId) return;
        const fetcher = () => getToken({ template: 'convex' });
        setConvexAuthFetcher(fetcher, owner);
        const interval = setInterval(() => {
            setConvexAuthFetcher(fetcher, owner);
        }, 50_000);
        return () => clearInterval(interval);
    }, [getToken, isSignedIn, isLoaded, userId, sessionId]);

    return null;
}
