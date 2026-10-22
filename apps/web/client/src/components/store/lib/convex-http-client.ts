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

export type ConvexAuthOwner = Readonly<{
    userId: string;
    sessionId: string;
    generation: number;
    signal: AbortSignal;
    ready: Promise<void>;
    isCurrent: () => boolean;
}>;
let authGeneration = 0;
let tokenRequest = 0;
let authSession: {
    userId: string; sessionId: string; generation: number;
    controller: AbortController; ready: Promise<void>; resolveReady: () => void;
    token: string | null; client: ConvexHttpClient | null;
} | null = null;

/** JWT rotation retains ownership; switching Clerk sessions invalidates it immediately. */
export function setConvexAuthSession(userId: string | null, sessionId: string | null): void {
    if (authSession?.userId === userId && authSession?.sessionId === sessionId) return;
    if (!authSession && !userId && !sessionId) return;
    const previous = authSession;
    authSession = null;
    authGeneration++;
    tokenRequest++;
    getConvexHttpClient().clearAuth();
    previous?.client?.clearAuth();
    previous?.controller.abort();
    previous?.resolveReady();
    if (!userId || !sessionId) return;
    let resolveReady!: () => void;
    const ready = new Promise<void>(resolve => { resolveReady = resolve; });
    authSession = { userId, sessionId, generation: authGeneration, controller: new AbortController(), ready, resolveReady, token: null, client: null };
}

export function captureConvexAuthOwner(): ConvexAuthOwner | null {
    const captured = authSession;
    if (!captured) return null;
    return Object.freeze({ userId: captured.userId, sessionId: captured.sessionId,
        generation: captured.generation, signal: captured.controller.signal, ready: captured.ready,
        isCurrent: () => authSession === captured && !captured.controller.signal.aborted });
}

/** Every source request, including Convex's queued mutations, stays with its original session. */
export function getConvexHttpClientForOwner(owner: ConvexAuthOwner): ConvexHttpClient {
    const session = authSession;
    if (!session || !owner.isCurrent() || session.generation !== owner.generation)
        throw new Error('The signed-in account changed. Reopen this project.');
    if (!session.client) {
        const guardedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            if (!owner.isCurrent()) return Promise.reject(new Error('The signed-in account changed. Reopen this project.'));
            return globalThis.fetch(input, { ...init, signal: init?.signal
                ? AbortSignal.any([owner.signal, init.signal]) : owner.signal });
        }) as typeof globalThis.fetch;
        session.client = new ConvexHttpClient(getConvexHttpClient().url, { fetch: guardedFetch });
        if (session.token) session.client.setAuth(session.token);
    }
    return session.client;
}

// ─── Auth readiness ──────────────────────────────────────────────────────────
// Protected one-shot queries (e.g. CommentManager on editor mount) can race the
// auth bridge: if they fire before `setConvexAuthFetcher` has attached the Clerk
// token, Convex returns UNAUTHORIZED and the caller may give up permanently.
// `whenConvexAuthReady()` lets such callers await the first token attach (or a
// short grace timeout, so a missing/late bridge never hangs the editor).
let resolveAuthReady: (() => void) | null = null;
const authReadyPromise: Promise<void> = new Promise<void>((resolve) => {
    resolveAuthReady = resolve;
});
function markConvexAuthReady(): void {
    resolveAuthReady?.();
}
// Safety net: never block protected queries forever if the auth bridge never
// mounts — fall through (unauthenticated) after a short grace period.
if (typeof window !== 'undefined') {
    setTimeout(markConvexAuthReady, 5_000);
}

/** Resolves once a Clerk token has been attached (or cleared) at least once. */
export function whenConvexAuthReady(): Promise<void> {
    return authReadyPromise;
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
    expectedOwner?: ConvexAuthOwner,
): void {
    if (expectedOwner && !expectedOwner.isCurrent()) return;
    const client = getConvexHttpClient();
    const owner = authSession;
    const generation = authGeneration;
    const request = ++tokenRequest;
    const current = () => generation === authGeneration && request === tokenRequest;
    if (!fetcher) {
        client.clearAuth();
        if (owner) { owner.token = null; owner.client?.clearAuth(); }
        owner?.resolveReady();
        markConvexAuthReady();
        return;
    }
    // `ConvexHttpClient.setAuth` expects a string token. Fetch the latest and
    // attach; the auth bridge re-calls this every ~50s so the token rotates
    // before its ~60s Clerk TTL. Errors are surfaced + auth cleared so calls
    // fail loud as UNAUTHORIZED rather than silently with a stale token.
    fetcher()
        .then((token) => {
            if (!current()) return;
            if (owner) owner.token = token;
            if (token) { client.setAuth(token); owner?.client?.setAuth(token); }
            else { client.clearAuth(); owner?.client?.clearAuth(); }
        })
        .catch((err: unknown) => {
            if (!current()) return;
            console.error('[convex-http-client] token fetch failed:', err);
            client.clearAuth();
            if (owner) { owner.token = null; owner.client?.clearAuth(); }
        })
        .finally(() => {
            // Unblock any query awaiting the first token attach, success or not.
            if (current()) { owner?.resolveReady(); markConvexAuthReady(); }
        });
}
