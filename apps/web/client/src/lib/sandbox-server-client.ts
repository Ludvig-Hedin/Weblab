// Direct browser → apps/web/server tRPC client. Bypasses the deleted
// Next.js forward router proxy — connects over native WebSocket to the
// Fastify sandbox server (port 8080 in dev; NEXT_PUBLIC_SANDBOX_SERVER_URL
// in prod).
//
// This is the ONLY remaining tRPC client in the codebase. Everything else
// went to Convex. apps/web/server keeps using tRPC because its workload
// (CodeSandbox/Vercel Sandbox SDK calls, long-lived sandbox file streams)
// doesn't fit Convex's request/response model.
//
// Auth: passes the Clerk JWT in WebSocket connection params. apps/web/server
// reads it from `connectionParams.token` and verifies via Clerk's JWKS.
//
// Usage from MobX class stores:
//   import { getSandboxServerClient } from '@/lib/sandbox-server-client';
//   const client = getSandboxServerClient();
//   await client.sandbox.fileRead.query({ sandboxId, path });

import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';

import type { AppRouter } from '@weblab/web-server/src/router';

import { env } from '@/env';

let cachedClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let cachedTokenFetcher: (() => Promise<string | null>) | null = null;

/**
 * Register a Clerk JWT fetcher so the WS connection carries auth. Called by
 * `<SandboxServerAuthBridge>` (mounted under ClerkProvider) on session change.
 */
export function setSandboxServerAuthFetcher(fetcher: (() => Promise<string | null>) | null): void {
    cachedTokenFetcher = fetcher;
}

function resolveServerUrl(): string {
    const explicit = env.NEXT_PUBLIC_SANDBOX_SERVER_URL;
    if (explicit) {
        // Convert http(s):// → ws(s):// if user passed a plain URL.
        return explicit.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/trpc';
    }
    // Dev fallback — apps/web/server defaults to port 8080.
    if (typeof window !== 'undefined') {
        const isSecure = window.location.protocol === 'https:';
        const host = window.location.hostname;
        return `${isSecure ? 'wss' : 'ws'}://${host}:8080/api/trpc`;
    }
    return 'ws://localhost:8080/api/trpc';
}

export function getSandboxServerClient() {
    if (cachedClient) return cachedClient;
    const wsClient = createWSClient({
        url: resolveServerUrl(),
        // Re-fetch the token on every reconnect so a long-lived editor
        // session picks up a refreshed Clerk JWT without manual reconnect.
        connectionParams: async () => {
            const token = cachedTokenFetcher ? await cachedTokenFetcher() : null;
            return { token: token ?? '' };
        },
        // Reconnect with exponential backoff up to 30s. Editor sessions
        // should survive transient network blips without losing in-flight
        // file ops.
        retryDelayMs: (attempt: number) => Math.min(30_000, 500 * 2 ** attempt),
    });
    cachedClient = createTRPCClient<AppRouter>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        links: [wsLink({ client: wsClient, transformer: undefined as any })],
    });
    return cachedClient;
}
