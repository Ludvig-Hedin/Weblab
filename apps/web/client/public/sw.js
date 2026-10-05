/* eslint-disable */
// Cache only anonymous offline HTML and explicitly public static assets.
// Private documents, API/data responses and RSC payloads always use the network.
// v5 removes private entries stored by earlier workers without touching drafts
// in IndexedDB or caches belonging to another application.
const VERSION = 'v5';
const SHELL_CACHE = `weblab-shell-${VERSION}`;
const RUNTIME_CACHE = `weblab-runtime-${VERSION}`;
const OWNED_CACHE = /^weblab-(shell|runtime|next-data)-v\d+$/;
const STATIC_URLS = [
    '/manifest.webmanifest',
    '/favicon.svg',
    '/favicon.png',
    '/weblab-preload-script.js',
];

function isRsc(request, url) {
    return url.searchParams.has('_rsc') ||
        (request.headers.get('accept') || '').toLowerCase().includes('text/x-component') ||
        request.headers.get('rsc') === '1';
}

function isPublicRequest(request) {
    const url = new URL(request.url);
    return request.method === 'GET' && url.origin === self.location.origin &&
        !url.username && !url.password && !url.search && !url.hash &&
        !request.headers.has('authorization') && !isRsc(request, url) &&
        (url.pathname === '/offline' || STATIC_URLS.includes(url.pathname) ||
            url.pathname.startsWith('/_next/static/'));
}

function isPublicResponse(response, request) {
    if (!response || !response.ok || response.redirected ||
        response.type === 'opaque' || response.type === 'opaqueredirect') return false;
    const control = response.headers.get('cache-control') || '';
    if (/(?:^|,)\s*(?:private|no-store)(?:\s|=|,|$)/i.test(control)) return false;
    if (response.headers.has('set-cookie')) return false;
    if ((response.headers.get('content-type') || '').toLowerCase().includes('text/x-component')) return false;
    // A followed redirect must never become an offline HTML or asset entry.
    return !response.url || response.url === request.url;
}

function publicRequest(url) {
    return new Request(new URL(url, self.location.origin), {
        credentials: 'omit', cache: 'no-store', redirect: 'error',
    });
}

function publicCache(request) {
    return caches.open(new URL(request.url).pathname.startsWith('/_next/static/')
        ? RUNTIME_CACHE : SHELL_CACHE);
}

async function readPublic(cache, request) {
    if (!isPublicRequest(request)) return undefined;
    const cached = await cache.match(request);
    if (isPublicResponse(cached, request)) return cached;
    return undefined;
}

async function writePublic(cache, request, response) {
    if (isPublicRequest(request) && isPublicResponse(response, request)) {
        await cache.put(request, response.clone()).catch(() => {});
    }
}

async function precacheUrls(urls) {
    await Promise.all(urls.map(async (url) => {
        try {
            if (typeof url !== 'string') return;
            const request = publicRequest(url);
            // Filter before fetch, including URLs sent by older project clients.
            if (!isPublicRequest(request)) return;
            const response = await fetch(request);
            const cache = await publicCache(request);
            await writePublic(cache, request, response);
        } catch {
            /* Optional public assets may be missing or unavailable. */
        }
    }));
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        // '/' uses the authenticated root layout and is deliberately excluded.
        await precacheUrls(['/offline', ...STATIC_URLS]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => OWNED_CACHE.test(key) &&
            ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data?.type === 'WEBLAB_PRECACHE_URLS' && Array.isArray(event.data.urls)) {
        event.waitUntil(precacheUrls(event.data.urls));
    }
});

async function offlineFallback() {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await readPublic(cache, publicRequest('/offline'));
    return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function networkNavigation(request) {
    try {
        return await fetch(request);
    } catch {
        // Never look up the requested private document, even if an old cache
        // entry exists. Only the separately fetched anonymous fallback is safe.
        return offlineFallback();
    }
}

async function publicAsset(request, networkFirst) {
    const anonymousRequest = publicRequest(request.url);
    const cache = await publicCache(request);
    if (!networkFirst) {
        const cached = await readPublic(cache, anonymousRequest);
        if (cached) return cached;
    }
    try {
        const fresh = await fetch(anonymousRequest);
        await writePublic(cache, anonymousRequest, fresh);
        return fresh;
    } catch {
        const cached = await readPublic(cache, anonymousRequest);
        return cached || Response.error();
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin ||
        request.headers.has('authorization') || isRsc(request, url) ||
        url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

    if (isPublicRequest(request)) {
        // Stable chunk URLs can change between deployments; keep them fresh.
        event.respondWith(publicAsset(request,
            url.pathname === '/offline' || url.pathname.startsWith('/_next/static/chunks/')));
        return;
    }
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkNavigation(request));
    }
    // All other same-origin GETs, including /_next/data, bypass CacheStorage.
});
