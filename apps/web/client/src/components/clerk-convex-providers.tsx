'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';

import { env } from '@/env';

import { ConvexAuthBridge } from './convex-auth-bridge';
import { SandboxServerAuthBridge } from './sandbox-server-auth-bridge';

// Phase 3 wiring: mount Clerk + Convex providers alongside the existing
// Supabase-backed AuthProvider so the new pipe can be smoke-tested without
// touching the production auth flow.
//
// Behavior:
//  - In **clerk mode** (`NEXT_PUBLIC_AUTH_PROVIDER === 'clerk'`) — both
//    providers mount. If env vars are missing we still throw, because the
//    chosen auth provider cannot function without them.
//  - In **supabase mode** — providers are skipped entirely so deploys can
//    ship without Clerk / Convex credentials. Downstream Clerk hooks
//    (`useUser`, `useAuth`, `useClerk`) tolerate a missing provider on
//    Clerk v5+ and return safe defaults (`isLoaded: false`, `null` user).
//    Call sites that invoke `clerk.signOut()` etc. must check the mode
//    flag before doing so.

// Module-level singleton: created once on first read. Survives React strict
// mode double-renders, suspense remounts, and HMR re-evaluations of the
// component file. `useMemo` is NOT safe here — React is allowed to drop
// memoized values, which would tear down the active WebSocket and lose
// every in-flight subscription/auth state.
//
// `expectAuth: true` is the fix for the live-query UNAUTHORIZED bug. Without
// it the client opens the WebSocket and ships `ModifyQuerySet` BEFORE
// `ConvexProviderWithClerk`'s effect can call `setAuth()` with the Clerk
// token — every initial subscription comes back UNAUTHORIZED, and Convex
// does not always replay them once auth lands. Starting the socket paused
// guarantees the first message we ever send is `Authenticate`.
//
// Trade-off: when the viewer is signed *out*, `ConvexProviderWithClerk`
// never calls `setAuth`, so the socket would stay paused forever and even
// auth-optional queries (e.g. `api.ping.hello` on /dev/convex-smoke) hang.
// `<UnauthedConvexResume>` below handles that case by calling `setAuth`
// with a token-returning-null fetcher once Clerk has loaded as signed-out;
// `AuthenticationManager.setConfig` always calls `resumeSocket()` at the
// end of its run, so the socket unpauses and unauthed queries fire.
let convexClientSingleton: ConvexReactClient | null = null;

function getConvexClient(url: string): ConvexReactClient {
    convexClientSingleton ??= new ConvexReactClient(url, { expectAuth: true });
    return convexClientSingleton;
}

export function ClerkConvexProviders({ children }: { children: ReactNode }) {
    const clerkPublishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;

    // Post-migration: Clerk + Convex always mount. No env-flag branching.
    if (!clerkPublishableKey) {
        throw new Error(
            'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required. Set it in ' +
                'apps/web/client/.env.local (mirror CLERK_PUBLISHABLE_KEY).',
        );
    }
    if (!convexUrl) {
        throw new Error(
            'NEXT_PUBLIC_CONVEX_URL is required. Set it in ' +
                'apps/web/client/.env.local (mirror CONVEX_URL).',
        );
    }

    const convexClient = getConvexClient(convexUrl);

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
                <UnauthedConvexResume client={convexClient} />
                <ConvexAuthBridge />
                <SandboxServerAuthBridge />
                {children}
            </ConvexProviderWithClerk>
        </ClerkProvider>
    );
}

/**
 * Companion to the `expectAuth: true` client option.
 *
 * `ConvexProviderWithClerk` only calls `client.setAuth()` when the viewer is
 * signed in. With `expectAuth: true`, the WebSocket starts paused and only
 * resumes on the first `setAuth` call — so a signed-out viewer would never
 * see *any* query results, including auth-optional ones.
 *
 * We watch Clerk's `isLoaded`/`isSignedIn`. The moment Clerk reports a
 * loaded-and-signed-out state, we issue our own `setAuth(() => null, ...)`.
 * Internally that runs through `AuthenticationManager.setConfig`, which
 * always calls `resumeSocket()` on exit — the socket unpauses, unauthed
 * queries flush. When the viewer later signs in, `ConvexProviderWithClerk`
 * takes over with the real Clerk token.
 */
function UnauthedConvexResume({ client }: { client: ConvexReactClient }) {
    const { isLoaded, isSignedIn } = useAuth();
    const hasResumedRef = useRef(false);

    useEffect(() => {
        if (!isLoaded || isSignedIn || hasResumedRef.current) return;
        hasResumedRef.current = true;
        // The fetcher must return null to signal "no token available" — this
        // walks the AuthenticationManager state machine to its terminal
        // "auth failed" branch, which calls `resumeSocket()`.
        client.setAuth(
            async () => null,
            () => {
                // No-op — auth-change events for the signed-out path don't
                // affect anything downstream.
            },
        );
    }, [client, isLoaded, isSignedIn]);

    return null;
}
