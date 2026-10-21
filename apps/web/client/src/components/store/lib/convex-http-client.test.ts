import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { makeFunctionReference } from 'convex/server';

// Run this focused file in its own process: only environment IO is replaced.
// The real ConvexHttpClient, including its mutation queue, remains in use.
void mock.module('@/env', () => ({
    env: { NEXT_PUBLIC_CONVEX_URL: 'https://ownership-test.convex.cloud' },
}));
const {
    captureConvexAuthOwner,
    getConvexHttpClientForOwner,
    getConvexHttpClient,
    whenConvexAuthReady,
    setConvexAuthFetcher,
    setConvexAuthSession,
} = await import('./convex-http-client');
const query = makeFunctionReference<'query', Record<string, never>, null>('cloudEditor:status');
const action = makeFunctionReference<'action', Record<string, never>, null>(
    'cloudEditorTextActions:commit',
);
const delayed = makeFunctionReference<'mutation', Record<string, never>, null>('test:delayed');
const start = makeFunctionReference<'mutation', Record<string, never>, null>(
    'cloudEditor:ensurePreview',
);
const ticket = makeFunctionReference<'mutation', Record<string, never>, null>(
    'cloudPreviewAccess:issue',
);
const response = () => Response.json({ status: 'success', value: null, logLines: [] });
const sent = (init?: RequestInit) => ({
    authorization: new Headers(init?.headers).get('authorization'),
    path: (JSON.parse(String(init?.body)) as { path: string }).path,
});

function mockFetch(
    handler: (...args: Parameters<typeof globalThis.fetch>) => ReturnType<typeof globalThis.fetch>,
) {
    const implementation = Object.assign(handler, { preconnect: globalThis.fetch.preconnect });
    return spyOn(globalThis, 'fetch').mockImplementation(implementation);
}

async function session(userId: string, token: string) {
    setConvexAuthSession(userId, `${userId}-session`);
    const owner = captureConvexAuthOwner()!;
    setConvexAuthFetcher(async () => token, owner);
    await owner.ready;
    return { owner, client: getConvexHttpClientForOwner(owner) };
}
afterEach(() => {
    setConvexAuthSession(null, null);
    mock.restore();
});

describe('cloud source authenticated ownership', () => {
    it('keeps JWT refresh in the same session and fences logout queries and actions', async () => {
        const requests: ReturnType<typeof sent>[] = [];
        mockFetch(async (_input, init) => {
            requests.push(sent(init));
            return response();
        });
        const first = await session('a', 'token-a1');
        await first.client.query(query, {});
        const refreshed = Promise.withResolvers<string | null>();
        setConvexAuthFetcher(() => refreshed.promise, first.owner);
        refreshed.resolve('token-a2');
        await refreshed.promise;
        expect(captureConvexAuthOwner()?.generation).toBe(first.owner.generation);
        expect(first.owner.signal.aborted).toBe(false);
        expect(getConvexHttpClientForOwner(first.owner)).toBe(first.client);
        await first.client.action(action, {});
        expect(requests.map((request) => request.authorization)).toEqual([
            'Bearer token-a1',
            'Bearer token-a2',
        ]);
        setConvexAuthSession(null, null);
        expect(first.owner.signal.aborted).toBe(true);
        await expect(first.client.query(query, {})).rejects.toThrow('account changed');
        await expect(first.client.action(action, {})).rejects.toThrow('account changed');
        expect(requests).toHaveLength(2);
    });

    it('ignores an old session token fetch completing after the next account attaches', async () => {
        const requests: ReturnType<typeof sent>[] = [];
        mockFetch(async (_input, init) => {
            requests.push(sent(init));
            return response();
        });
        const first = await session('a', 'token-a1');
        const stale = Promise.withResolvers<string | null>();
        setConvexAuthFetcher(() => stale.promise, first.owner);
        const next = await session('b', 'token-b');
        stale.resolve('late-token-a');
        await stale.promise;
        expect(first.owner.isCurrent()).toBe(false);
        await next.client.query(query, {});
        await expect(first.client.query(query, {})).rejects.toThrow('account changed');
        expect(requests).toEqual([{ authorization: 'Bearer token-b', path: 'cloudEditor:status' }]);
        expect(() => getConvexHttpClientForOwner(first.owner)).toThrow('account changed');
    });

    it('does not dispatch A’s queued preview start or ticket under B after an account switch', async () => {
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<Response>();
        const requests: ReturnType<typeof sent>[] = [];
        mockFetch(async (_input, init) => {
            const request = sent(init);
            requests.push(request);
            if (request.path === 'test:delayed') {
                entered.resolve();
                return release.promise;
            }
            return response();
        });
        const first = await session('a', 'token-a');
        const inflight = first.client.mutation(delayed, {});
        await entered.promise;
        const oldStart = first.client.mutation(start, {});
        const oldTicket = first.client.mutation(ticket, {});
        // Attach rejection observers before releasing the old queue.
        const settled = Promise.allSettled([oldStart, oldTicket]);
        const next = await session('b', 'token-b');
        expect(next.client).not.toBe(first.client);
        await next.client.mutation(ticket, {});
        release.resolve(response()); // Simulates an already-dispatched A request completing despite abort.
        await inflight;
        expect((await settled).map((result) => result.status)).toEqual(['rejected', 'rejected']);
        expect(requests).toEqual([
            { authorization: 'Bearer token-a', path: 'test:delayed' },
            { authorization: 'Bearer token-b', path: 'cloudPreviewAccess:issue' },
        ]);
    });

    it('rotates ownership when the same account gets a different Clerk session', async () => {
        const first = await session('a', 'token-a');
        setConvexAuthSession('a', 'replacement-session');
        const nextOwner = captureConvexAuthOwner()!;
        expect(nextOwner.generation).not.toBe(first.owner.generation);
        expect(first.owner.signal.aborted).toBe(true);
        expect(first.owner.isCurrent()).toBe(false);
        expect(nextOwner.isCurrent()).toBe(true);
        expect(() => getConvexHttpClientForOwner(first.owner)).toThrow('account changed');

        let fetched = false;
        setConvexAuthFetcher(async () => {
            fetched = true;
            return 'obsolete-token';
        }, first.owner);
        expect(fetched).toBe(false);
    });

    it('keeps singleton readiness and ignores an older concurrent token refresh', async () => {
        const requests: ReturnType<typeof sent>[] = [];
        mockFetch(async (_input, init) => {
            requests.push(sent(init));
            return response();
        });
        const first = await session('a', 'token-a');
        await whenConvexAuthReady();
        const oldRefresh = Promise.withResolvers<string | null>();
        const newRefresh = Promise.withResolvers<string | null>();
        setConvexAuthFetcher(() => oldRefresh.promise, first.owner);
        setConvexAuthFetcher(() => newRefresh.promise, first.owner);
        newRefresh.resolve('new-token-a');
        await newRefresh.promise;
        oldRefresh.resolve('obsolete-token-a');
        await oldRefresh.promise;
        await getConvexHttpClient().query(query, {});
        await first.client.query(query, {});
        expect(requests.map((request) => request.authorization)).toEqual([
            'Bearer new-token-a',
            'Bearer new-token-a',
        ]);
    });

    it('aborts a dispatched request when its initiating session ends', async () => {
        const entered = Promise.withResolvers<void>();
        mockFetch((_input, init) => {
            const signal = init?.signal;
            if (!signal) throw new Error('Expected the initiating owner signal');
            entered.resolve();
            return new Promise<Response>((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            });
        });
        const first = await session('a', 'token-a');
        const pending = first.client.query(query, {});
        const settled = pending.then(
            () => ({ rejected: false, reason: undefined }),
            (reason: unknown) => ({ rejected: true, reason }),
        );
        await entered.promise;
        setConvexAuthSession(null, null);
        const result = await settled;
        expect(result.rejected).toBe(true);
        expect(result.reason).toBeDefined();
    });
});
