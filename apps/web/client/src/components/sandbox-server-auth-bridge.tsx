'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

import { setSandboxServerAuthFetcher } from '@/lib/sandbox-server-client';

/**
 * Wires Clerk's session token into the sandbox-server tRPC WS client.
 * Mount once inside `<ClerkConvexProviders>` so the WS connection carries
 * a valid Clerk JWT on every (re)connect.
 *
 * apps/web/server verifies the token via Clerk's JWKS in its tRPC context.
 */
export function SandboxServerAuthBridge() {
    const { getToken, isLoaded, isSignedIn } = useAuth();

    useEffect(() => {
        // While Clerk is still loading, don't register anything: passing null
        // here marked the WS auth gate "ready" with no token fetcher, so a
        // sandbox call racing Clerk's load connected with an empty token and
        // failed UNAUTHORIZED at editor boot. Leaving the gate unresolved lets
        // `waitForAuthReady` hold the first connection until sign-in state is
        // actually known.
        if (!isLoaded) {
            return;
        }
        if (!isSignedIn) {
            setSandboxServerAuthFetcher(null);
            return;
        }
        setSandboxServerAuthFetcher(() => getToken({ template: 'convex' }));
    }, [getToken, isLoaded, isSignedIn]);

    return null;
}
