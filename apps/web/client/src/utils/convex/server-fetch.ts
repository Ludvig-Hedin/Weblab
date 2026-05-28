import 'server-only';

import type { NextjsOptions } from 'convex/nextjs';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import type { ArgsAndOptions, FunctionReference, FunctionReturnType } from 'convex/server';

import { withTimeout } from '@/utils/promise/with-timeout';

/**
 * Timeout-bounded Convex calls for Server Components, layouts, and route
 * handlers.
 *
 * Server-side Convex calls in render-gating layouts/pages block the SSR
 * response until they resolve. `convex/nextjs` exposes no timeout, so a slow
 * or briefly unavailable backend — most commonly while a Convex *production*
 * deploy is swapping versions — makes the request hang. Cloudflare sits in
 * front of the origin (Railway) with a fixed ~100s edge timeout; a hang past
 * that surfaces to logged-in users as a hard **HTTP 524** with no recovery
 * path. (The `error.tsx` boundaries only catch *thrown* errors, never a hang.)
 *
 * Racing every server-side Convex call against a short timeout converts that
 * hang into a thrown `TimeoutError`, which the nearest `error.tsx` boundary
 * catches and renders as a retryable state instead of a 524.
 *
 * Normal Convex queries resolve in well under a second; the default ceiling is
 * generous enough to ride out a routine deploy swap while staying far below
 * Cloudflare's edge timeout.
 */
export const DEFAULT_CONVEX_TIMEOUT_MS = 10_000;

/**
 * Drop-in replacement for `fetchQuery` from `convex/nextjs` that rejects with
 * `TimeoutError` after `DEFAULT_CONVEX_TIMEOUT_MS`. Mirrors the upstream generic
 * signature so call-site typing is fully preserved.
 */
export function fetchQueryWithTimeout<Query extends FunctionReference<'query'>>(
    query: Query,
    ...args: ArgsAndOptions<Query, NextjsOptions>
): Promise<FunctionReturnType<Query>> {
    return withTimeout(fetchQuery(query, ...args), DEFAULT_CONVEX_TIMEOUT_MS, 'Convex query');
}

/**
 * Drop-in replacement for `fetchMutation` from `convex/nextjs` with the same
 * timeout behavior. Only use on mutations that are safe to surface as a
 * retryable error if they exceed the deadline.
 */
export function fetchMutationWithTimeout<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    ...args: ArgsAndOptions<Mutation, NextjsOptions>
): Promise<FunctionReturnType<Mutation>> {
    return withTimeout(
        fetchMutation(mutation, ...args),
        DEFAULT_CONVEX_TIMEOUT_MS,
        'Convex mutation',
    );
}
