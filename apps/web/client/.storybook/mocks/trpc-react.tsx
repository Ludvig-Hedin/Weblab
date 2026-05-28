'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Stub `@/trpc/react` for Storybook builds.
 *
 * The original tRPC client + `@trpc/react-query` were removed during the
 * Convex migration (commit 944b1e7ac). No source file under `apps/web/client/src`
 * imports `@/trpc/react` anymore, but Storybook still aliases the path here
 * via `viteFinal` in `.storybook/main.ts` as a defensive fallback in case
 * a stale story imports it. Rollup needs the alias target to resolve at
 * build time, so this file has to exist — but it must NOT import any
 * removed packages (`@trpc/react-query` would fail with
 * `Rollup failed to resolve import "@trpc/react-query"`).
 *
 * Surface area kept intentionally minimal:
 *   - `api` — Proxy that returns `useQuery`/`useMutation` hooks shaped like
 *     `{ data: undefined, isLoading: false, error: null }` /
 *     `{ mutate(){}, mutateAsync(){}, isLoading: false, error: null }` for
 *     any router/procedure path a story might touch.
 *   - `TRPCReactProvider` — only wires a `QueryClientProvider` so descendants
 *     that still call `useQueryClient()` get a real instance.
 *   - `RouterInputs` / `RouterOutputs` — empty record types so any
 *     `RouterOutputs['foo']['bar']` access in story TS still compiles.
 *
 * If a story actually needs typed tRPC calls, port it to Convex (`useQuery`
 * from `convex/react`) — that's the live data path now.
 */

type AnyFn = (...args: unknown[]) => unknown;

const noopMutation = () =>
    ({
        mutate: (() => {}) as AnyFn,
        mutateAsync: (async () => undefined) as AnyFn,
        isLoading: false,
        isPending: false,
        error: null,
        data: undefined,
        reset: (() => {}) as AnyFn,
    }) as const;

const noopQuery = () =>
    ({
        data: undefined,
        isLoading: false,
        isPending: false,
        isError: false,
        error: null,
        refetch: (async () => ({ data: undefined })) as AnyFn,
    }) as const;

const procedureProxy: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
        if (prop === 'useQuery' || prop === 'useSuspenseQuery') {
            return noopQuery;
        }
        if (
            prop === 'useMutation' ||
            prop === 'useInfiniteQuery' ||
            prop === 'useSubscription'
        ) {
            return noopMutation;
        }
        // Nested router access: return another proxy so `api.foo.bar.useQuery()`
        // walks any depth without throwing.
        return new Proxy({}, procedureProxy);
    },
};

const apiProxy: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
        if (prop === 'Provider') {
            return ({ children }: { children: ReactNode }) => children as JSX.Element;
        }
        if (prop === 'createClient') {
            return () => ({});
        }
        return new Proxy({}, procedureProxy);
    },
};

export const api = new Proxy({}, apiProxy) as unknown as Record<string, unknown> & {
    Provider: (props: { children: ReactNode }) => JSX.Element;
    createClient: () => Record<string, unknown>;
};

// Type exports kept so any story file with `RouterOutputs['foo']` still
// compiles against this mock.
export type RouterInputs = Record<string, never>;
export type RouterOutputs = Record<string, never>;

let queryClientSingleton: QueryClient | undefined;
function getQueryClient(): QueryClient {
    if (!queryClientSingleton) {
        queryClientSingleton = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 60 * 1000,
                    retry: false,
                },
            },
        });
    }
    return queryClientSingleton;
}

export function TRPCReactProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
