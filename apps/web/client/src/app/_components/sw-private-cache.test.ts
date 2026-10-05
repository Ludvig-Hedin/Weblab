import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const origin = 'https://editor.test';
const source = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const shell = 'weblab-shell-v5';
const runtime = 'weblab-runtime-v5';
type WorkerEvent = {
    request?: Request;
    data?: unknown;
    waitUntil(promise: Promise<unknown>): void;
    respondWith(promise: Promise<Response>): void;
};
type Fetcher = (request: Request) => Promise<Response>;

function fixture() {
    const listeners = new Map<string, (event: WorkerEvent) => void>();
    const stores = new Map<string, Map<string, Response>>();
    const fetched: Request[] = [];
    const matched: string[] = [];
    const requestOptions = new WeakMap<Request, RequestInit | undefined>();
    // Bun does not faithfully expose browser credential policy on Request.
    // Observe the real worker's constructor arguments without supplying defaults.
    class WorkerRequest extends Request {
        constructor(input: RequestInfo | URL, options?: RequestInit) {
            super(input, options);
            requestOptions.set(this, options);
        }
    }
    let fetcher: Fetcher = async () => new Response('public');
    let claimed = false;
    let skipped = false;
    const key = (input: Request | string) => typeof input === 'string'
        ? new URL(input, origin).href : input.url;
    const store = (name: string) => {
        let entries = stores.get(name);
        if (!entries) { entries = new Map(); stores.set(name, entries); }
        return entries;
    };
    runInNewContext(source, {
        URL, Request: WorkerRequest, Response,
        fetch: async (request: Request) => { fetched.push(request); return fetcher(request); },
        caches: {
            keys: async () => [...stores.keys()],
            delete: async (name: string) => stores.delete(name),
            open: async (name: string) => ({
                match: async (input: Request | string) => {
                    matched.push(key(input));
                    return store(name).get(key(input))?.clone();
                },
                put: async (input: Request | string, response: Response) => {
                    store(name).set(key(input), response.clone());
                },
            }),
        },
        self: {
            location: { origin },
            addEventListener: (name: string, listener: (event: WorkerEvent) => void) => listeners.set(name, listener),
            skipWaiting: async () => { skipped = true; },
            clients: { claim: async () => { claimed = true; } },
        },
    });
    const dispatch = async (name: string, properties: { request?: Request; data?: unknown } = {}) => {
        const pending: Promise<unknown>[] = [];
        let response: Promise<Response> | undefined;
        listeners.get(name)?.({
            ...properties,
            waitUntil: promise => { pending.push(promise); },
            respondWith: promise => { response = promise; },
        });
        await Promise.all(pending);
        return response;
    };
    return {
        fetched, matched, stores, dispatch, requestOptions,
        request: (path: string, headers?: HeadersInit) => new Request(new URL(path, origin), { headers }),
        seed: (name: string, path: string, body: string, headers?: HeadersInit) => {
            store(name).set(new URL(path, origin).href, new Response(body, { headers }));
        },
        offline: () => { fetcher = async () => { throw new Error('offline'); }; },
        network: (next: Fetcher) => { fetcher = next; },
        claimed: () => claimed,
        skipped: () => skipped,
    };
}

const privatePaths = [
    '/', '/projects', '/project/secret', '/sign-in', '/auth/callback', '/api/private',
    '/_next/data/build/projects.json', '/private.json', '/images/private.png',
    '/offline?account=one', '/favicon.svg?account=one', '/_next/static/chunks/app.js?_rsc=one',
    'https://foreign.test/_next/static/chunks/app.js',
    'https://editor.test.evil.test/favicon.svg',
];

describe('service worker public cache boundary', () => {
    it('installs only anonymous offline/static entries, never the signed-in home document', async () => {
        const f = fixture();
        await f.dispatch('install');
        expect(f.fetched.map(request => new URL(request.url).pathname).sort()).toEqual([
            '/favicon.png', '/favicon.svg', '/manifest.webmanifest', '/offline', '/weblab-preload-script.js',
        ]);
        for (const request of f.fetched) {
            expect(f.requestOptions.get(request)).toMatchObject({ credentials: 'omit', redirect: 'error' });
        }
        expect(f.stores.get(shell)?.size).toBe(5);
        expect(f.skipped()).toBe(true);
    });

    it('ignores unapproved precache messages before fetching and uses no credentials for allowed URLs', async () => {
        const f = fixture();
        await f.dispatch('message', { data: { type: 'WEBLAB_PRECACHE_URLS', urls: [
            ...privatePaths, null, {}, 1, '/offline', '/favicon.svg', '/_next/static/chunks/app.js',
        ] } });
        expect(f.fetched.map(request => new URL(request.url).pathname)).toEqual([
            '/offline', '/favicon.svg', '/_next/static/chunks/app.js',
        ]);
        for (const request of f.fetched) {
            expect(f.requestOptions.get(request)).toMatchObject({ credentials: 'omit', redirect: 'error' });
        }
    });

    it('never reads or writes private GET, data, query, cross-origin, RSC or authorization requests', async () => {
        const f = fixture();
        const requests = [
            ...privatePaths.map(path => f.request(path)),
            f.request('/favicon.svg', { RSC: '1' }),
            f.request('/offline', { Accept: 'text/html, text/x-component' }),
            f.request('/_next/static/chunks/app.js', { Authorization: 'Bearer secret' }),
            new Request(`${origin}/favicon.svg`, { method: 'POST' }),
        ];
        for (const request of requests) {
            f.seed(shell, request.url, 'private-old');
            f.seed(runtime, request.url, 'private-old');
            expect(await f.dispatch('fetch', { request })).toBeUndefined();
        }
        expect(f.fetched).toHaveLength(0);
        expect(f.matched).toHaveLength(0);
    });

    it('uses the network for private navigation and only anonymous offline HTML when disconnected', async () => {
        const f = fixture();
        f.seed('weblab-shell-v4', '/project/secret', 'old private HTML');
        f.seed(shell, '/project/secret', 'current private HTML');
        f.seed(shell, '/offline', 'anonymous fallback');
        const request = f.request('/project/secret', { Accept: 'text/html' });
        f.network(async () => new Response('live private HTML'));
        expect(await (await f.dispatch('fetch', { request }))?.text()).toBe('live private HTML');
        expect(await f.stores.get(shell)?.get(request.url)?.clone().text()).toBe('current private HTML');
        f.offline();
        for (const path of ['/project/secret', '/sign-in', '/projects?workspace=secret']) {
            expect(await (await f.dispatch('fetch', { request: f.request(path, { Accept: 'text/html' }) }))?.text())
                .toBe('anonymous fallback');
        }
        expect(f.matched).toEqual(Array(3).fill(`${origin}/offline`));
    });

    it('refuses redirected, private, no-store, cookie and RSC responses on install and runtime writes', async () => {
        const responses = [
            () => new Response('private', { headers: { 'Cache-Control': 'public, private="Set-Cookie"' } }),
            () => new Response('private', { headers: { 'Cache-Control': 'max-age=0, NO-STORE' } }),
            () => new Response('private', { headers: { 'Set-Cookie': 'session=secret' } }),
            () => new Response('private', { headers: { 'Content-Type': 'text/x-component' } }),
            () => Object.defineProperty(new Response('redirected'), 'redirected', { value: true }),
            () => Object.defineProperty(new Response('wrong URL'), 'url', { value: `${origin}/sign-in` }),
            () => new Response('error', { status: 500 }),
        ];
        for (const response of responses) {
            const f = fixture();
            f.network(async () => response());
            await f.dispatch('install');
            await f.dispatch('fetch', { request: f.request('/_next/static/chunks/app.js') });
            expect([...f.stores.values()].every(entries => entries.size === 0)).toBe(true);
        }
    });

    it('refuses unsafe cached responses and falls back to 503 when anonymous HTML is unavailable', async () => {
        const f = fixture();
        f.seed(shell, '/offline', 'private offline page', { 'Cache-Control': 'private' });
        f.seed(runtime, '/_next/static/chunks/app.js', 'unsafe JS', { 'Cache-Control': 'no-store' });
        f.offline();
        expect((await f.dispatch('fetch', { request: f.request('/project/secret', { Accept: 'text/html' }) }))?.status).toBe(503);
        expect((await f.dispatch('fetch', { request: f.request('/_next/static/chunks/app.js') }))?.type).toBe('error');
    });

    it('keeps public static assets available offline and refreshes chunks while online', async () => {
        const f = fixture();
        await f.dispatch('install');
        for (const path of ['/_next/static/chunks/app.js', '/_next/static/media/font.woff2']) {
            expect(await (await f.dispatch('fetch', { request: f.request(path) }))?.text()).toBe('public');
        }
        f.network(async () => new Response('new chunk'));
        expect(await (await f.dispatch('fetch', { request: f.request('/_next/static/chunks/app.js') }))?.text()).toBe('new chunk');
        f.offline();
        expect(await (await f.dispatch('fetch', { request: f.request('/_next/static/chunks/app.js') }))?.text()).toBe('new chunk');
        for (const path of ['/favicon.svg', '/offline', '/_next/static/media/font.woff2']) {
            expect(await (await f.dispatch('fetch', { request: f.request(path) }))?.text()).toBe('public');
        }
    });

    it('purges only old owned cache families, retaining unrelated caches and draft stores', async () => {
        const f = fixture();
        const retained = [shell, runtime, 'unrelated-cache', 'weblab-drafts-v4', 'weblab-shell-v4-extra'];
        for (const name of [...retained, 'weblab-shell-v4', 'weblab-runtime-v3', 'weblab-next-data-v5']) {
            f.seed(name, '/private', 'keep only unrelated data');
        }
        // No IndexedDB global is provided: activation must not access draft storage.
        await f.dispatch('activate');
        expect([...f.stores.keys()]).toEqual(retained);
        expect(f.claimed()).toBe(true);
    });
});
