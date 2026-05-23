'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';

import { env } from '@/env';

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

export function ClerkConvexProviders({ children }: { children: ReactNode }) {
    const clerkPublishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;
    const isClerkMode = env.NEXT_PUBLIC_AUTH_PROVIDER === 'clerk';

    // Construct lazily inside the component so deploys that never render this
    // tree don't open a websocket at module-evaluation. `useMemo` keeps the
    // instance stable across renders. Returns null in supabase mode — Convex
    // is only used by the clerk-backed pipeline.
    const convexClient = useMemo(
        () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
        [convexUrl],
    );

    if (!isClerkMode) {
        // Supabase mode is the path that ships without Clerk/Convex
        // credentials. Render children directly — the Supabase-backed
        // AuthProvider above us owns session state.
        return <>{children}</>;
    }

    if (!clerkPublishableKey) {
        throw new Error(
            'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required when ' +
                'NEXT_PUBLIC_AUTH_PROVIDER=clerk. Set it in ' +
                'apps/web/client/.env.local (mirror CLERK_PUBLISHABLE_KEY).',
        );
    }
    if (!convexUrl || !convexClient) {
        throw new Error(
            'NEXT_PUBLIC_CONVEX_URL is required when ' +
                'NEXT_PUBLIC_AUTH_PROVIDER=clerk. Set it in ' +
                'apps/web/client/.env.local (mirror CONVEX_URL).',
        );
    }

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
                {children}
            </ConvexProviderWithClerk>
        </ClerkProvider>
    );
}
