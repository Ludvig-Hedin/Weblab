'use client';

// Safe wrappers around `@clerk/nextjs` hooks for code that needs to render
// in **both** clerk and supabase modes.
//
// In supabase mode the `ClerkConvexProviders` component skips mounting
// `<ClerkProvider>` so deploys can ship without Clerk credentials. The raw
// Clerk hooks (`useAuth`, `useUser`, `useClerk`) THROW when called outside
// the provider — which crashes every page that has a Clerk-aware component
// in its tree (e.g. `<AuthRedirect>` in the root layout).
//
// `NEXT_PUBLIC_AUTH_PROVIDER` is frozen into the client bundle at build time,
// so the branch we take here is constant for the entire session. React's
// "rules of hooks" require constant hook order within a component instance,
// which is satisfied.
import { useClerk as useRawClerk, useAuth as useRawClerkAuth } from '@clerk/nextjs';

import { env } from '@/env';

export const isClerkMode = (): boolean => env.NEXT_PUBLIC_AUTH_PROVIDER === 'clerk';

const STUB_AUTH = { isLoaded: true, isSignedIn: false } as const;

/**
 * Returns Clerk's `useAuth()` in clerk mode, or a stub `{ isLoaded: true,
 * isSignedIn: false }` in supabase mode so callers can read `isSignedIn`
 * without a provider throw.
 */
export function useSafeClerkAuth() {
    if (isClerkMode()) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useRawClerkAuth();
    }
    return STUB_AUTH;
}

/**
 * Returns Clerk's `useClerk()` in clerk mode, or a stub with a no-op
 * `signOut` in supabase mode.
 */
export function useSafeClerk() {
    if (isClerkMode()) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useRawClerk();
    }
    return {
        signOut: async () => undefined,
    };
}
