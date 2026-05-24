import { ConvexHttpClient } from 'convex/browser';

import { env } from '@/env';

// Singleton ConvexHttpClient for non-React contexts (MobX stores, class-based
// managers). React components should use `useQuery`/`useMutation`/`useAction`
// from `convex/react` directly — those auto-attach Clerk JWT via
// `ConvexProviderWithClerk` in `src/components/clerk-convex-providers.tsx`.
//
// For class stores we expose:
//   1. `getConvexHttpClient()` — the singleton. Authenticated requests need
//      a fresh token via `setConvexAuthToken()` before each call OR via
//      `client.setAuth(getToken)` which Convex calls on demand.
//   2. `setConvexAuthFetcher(fetcher)` — registers a Clerk JWT fetcher.
//      Components inside `ClerkConvexProviders` should call this once on
//      mount with `useAuth().getToken`.
//
// Without an auth fetcher every protected query/mutation/action returns
// UNAUTHORIZED. The provider component handles the wiring.

let singleton: ConvexHttpClient | null = null;

export function getConvexHttpClient(): ConvexHttpClient {
    if (!singleton) {
        const url = env.NEXT_PUBLIC_CONVEX_URL;
        if (!url) {
            throw new Error(
                '[convex-http-client] NEXT_PUBLIC_CONVEX_URL not set — MobX stores cannot reach Convex.',
            );
        }
        singleton = new ConvexHttpClient(url);
    }
    return singleton;
}

/**
 * Wire a Clerk JWT fetcher into the singleton. Called by the
 * `<ConvexAuthBridge>` component (mounted under ClerkProvider) once on
 * mount and re-called whenever Clerk's session token rotates.
 *
 * The fetcher returns `Promise<string | null>` — null when signed-out so
 * the client falls back to unauthenticated calls.
 */
export function setConvexAuthFetcher(
    fetcher: ((opts?: { skipCache?: boolean }) => Promise<string | null>) | null,
): void {
    const client = getConvexHttpClient();
    if (!fetcher) {
        client.clearAuth();
        return;
    }
    // `ConvexHttpClient.setAuth` expects a string token. Fetch the latest and
    // attach; the auth bridge re-calls this every ~50s so the token rotates
    // before its ~60s Clerk TTL. Errors are surfaced + auth cleared so calls
    // fail loud as UNAUTHORIZED rather than silently with a stale token.
    fetcher()
        .then((token) => {
            if (token) client.setAuth(token);
            else client.clearAuth();
        })
        .catch((err: unknown) => {
            console.error('[convex-http-client] token fetch failed:', err);
            client.clearAuth();
        });
}
