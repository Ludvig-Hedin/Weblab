/* eslint-disable */
// Weblab service worker — offline app shell + navigation fallback.
// Strategy:
//   - precache shell + critical assets on install
//   - /api/*  -> network only (failures surface so the client switches to offline mode)
//   - navigations -> network-first with cache fallback, then /offline
//   - /_next/static/chunks/* -> network-first with runtime fallback
//   - other /_next/static/* and GET assets -> cache-first with runtime cache
//   - /_next/data/* -> stale-while-revalidate
//   - non-GET -> bypass

// Bump on any change to caching strategy or cache shape. `activate` deletes
// every cache whose key doesn't match the current VERSION, so bumping this is
// what flushes stale entries (including poisoned ones) off existing installs.
//
// v3 (2026-06-16): flush installs that had cached a build-versioned document
// (or a chunk under the runtime cache) from a previous deploy. After a deploy
// the old `/_next/static/*` chunks 404, so `cacheFirstAsset` returns
// `Response.error()` ("FetchEvent … resulted in a network error response") and
// the stale document hydrates against a newer bundle → React error #418 on
// prod (seen on /sign-in). Bumping the VERSION purges every prior cache.
//
// v4 (2026-06-23): Turbopack chunk URLs can be stable across adjacent deploys.
// Cache-first chunk handling can therefore serve old JS/CSS against fresh HTML,
// which reproduces React #418 for returning users with an active SW. Purge v3
// caches and fetch chunks network-first, with cached fallback for offline use.
const VERSION = 'v4';
const SHELL_CACHE = `weblab-shell-${VERSION}`;
const RUNTIME_CACHE = `weblab-runtime-${VERSION}`;
const DATA_CACHE = `weblab-next-data-${VERSION}`;

// `/projects` is intentionally NOT precached: it redirects per auth state
// (workspace when signed in, /sign-in when not), so a cached copy is a
// stale, wrong-state document — the exact hazard the navigation handler's
// comment warns about. Only the genuinely static shell + the self-contained
// `/offline` fallback are safe to keep.
const SHELL_URLS = [
    '/',
    '/offline',
    '/manifest.webmanifest',
    '/favicon.svg',
    '/favicon.png',
    '/weblab-preload-script.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(SHELL_CACHE);
            await Promise.all(
                SHELL_URLS.map(async (url) => {
                    try {
                        await cache.add(new Request(url, { cache: 'reload' }));
                    } catch {
                        /* tolerate missing optional shell entries */
                    }
                }),
            );
            await self.skipWaiting();
        })(),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => ![SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE].includes(k))
                    .map((k) => caches.delete(k)),
            );
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }
    if (event.data && event.data.type === 'WEBLAB_PRECACHE_URLS' && Array.isArray(event.data.urls)) {
        event.waitUntil(precacheUrls(event.data.urls));
    }
});

async function precacheUrls(urls) {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(
        urls.map(async (url) => {
            try {
                const request = new Request(url, { cache: 'reload', credentials: 'include' });
                const response = await fetch(request);
                if (response.ok) {
                    await cache.put(request, response.clone());
                }
            } catch {
                /* swallow — best effort */
            }
        }),
    );
}

function isApi(url) {
    return url.pathname.startsWith('/api/');
}

function isNextStatic(url) {
    return url.pathname.startsWith('/_next/static/');
}

function isNextChunk(url) {
    return url.pathname.startsWith('/_next/static/chunks/');
}

function isNextData(url) {
    return url.pathname.startsWith('/_next/data/');
}

function isRsc(request, url) {
    if (url.searchParams.has('_rsc')) return true;
    const accept = request.headers.get('accept') || '';
    if (accept.includes('text/x-component')) return true;
    return false;
}

function isNavigation(request) {
    return (
        request.mode === 'navigate' ||
        (request.method === 'GET' &&
            request.headers.get('accept')?.includes('text/html'))
    );
}

async function networkFirstNavigation(request) {
    const cache = await caches.open(SHELL_CACHE);
    const url = new URL(request.url);
    // Only the static app shell is safe to cache. Auth and per-user pages
    // (/login, /profile-setup, /auth/*, anything with a query string) render
    // differently per session — caching them serves a stale, wrong-state HTML
    // document on the next slow navigation, and that stale HTML can reference
    // build chunks that no longer exist after a deploy, which breaks hydration
    // (React error #418).
    const isCacheable = url.search === '' && SHELL_URLS.includes(url.pathname);
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok && isCacheable) {
            cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        const offline = await cache.match('/offline');
        if (offline) return offline;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

async function cacheFirstAsset(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok && request.url.startsWith(self.location.origin)) {
            cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
    } catch {
        // Never throw out of a fetch handler. A rejected respondWith() is
        // surfaced to the page as a hard network error — it breaks chunk
        // loading and triggers React hydration failures (#418) plus a tight
        // retry/postMessage loop. Response.error() resolves the handler so the
        // browser treats this exactly as it would a normal failed request.
        return Response.error();
    }
}

async function networkFirstAsset(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
        const fresh = await fetch(new Request(request, { cache: 'no-store' }));
        if (fresh && fresh.ok && request.url.startsWith(self.location.origin)) {
            cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        return Response.error();
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone()).catch(() => {});
            }
            return response;
        })
        .catch(() => undefined);
    return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }

    if (url.origin !== self.location.origin) return;

    if (isApi(url)) return; // network-only: let it fail so client triggers offline mode

    // RSC payload requests are dynamic per-render and must not be runtime-
    // cached. Letting the SW serve stale RSC poisons subsequent navigations
    // (Next.js merges them into the route tree). Skip the SW entirely so
    // the network handles them; failures bubble to the page-level offline
    // bootstrap fallback.
    if (isRsc(request, url)) return;

    if (isNavigation(request)) {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    if (isNextChunk(url)) {
        event.respondWith(networkFirstAsset(request));
        return;
    }

    if (isNextStatic(url)) {
        event.respondWith(cacheFirstAsset(request));
        return;
    }

    if (isNextData(url)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Other same-origin GETs (manifest, favicons, preload script, fonts, images served by Next).
    event.respondWith(cacheFirstAsset(request));
});
