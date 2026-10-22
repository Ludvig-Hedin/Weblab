import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { createImportAssetHandler, createImportUploadHandler, type AssetDependencies, type UploadDependencies } from './transport';

const siteUrl = 'https://app.example.test';
const convexUrl = 'https://example.convex.cloud';
const secret = 'f'.repeat(64);
const attemptId = 'a'.repeat(32);
const storageId = 's'.repeat(32);
const payload = new Uint8Array([1, 2, 3]);
const hash = createHash('sha256').update(payload).digest('hex');
const uploadUrl = `${convexUrl}/api/storage/upload?token=signed`;
const assetUrl = `${convexUrl}/api/storage/${storageId}`;
const target = { attemptId, fileIndex: '0' };
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
function fixture() {
    const calls: string[] = [];
    const timers: Array<{ milliseconds: number; fire(): void; active: boolean }> = [];
    const failures: string[] = [];
    const receipts: unknown[] = [];
    const sends: RequestInit[] = [];
    let now = 0;
    const deps: UploadDependencies & AssetDependencies = {
        siteUrl, convexUrl, secret,
        now: () => now,
        timer: (fire, milliseconds) => {
            const entry = { milliseconds, fire, active: true }; timers.push(entry);
            return () => { entry.active = false; };
        },
        authenticate: async () => { calls.push('auth'); return 'jwt'; },
        claimUpload: async args => {
            calls.push('claim'); expect(args.secret).toBe(secret); expect(args.expectedHash).toBe(hash);
            return { nonce: 'server-nonce', url: uploadUrl, bytes: payload.length, hash };
        },
        markSending: async (_args, token) => { expect(token).toBe('jwt'); calls.push('mark'); return true; },
        recordOwned: async args => { calls.push('owned'); receipts.push(args); return { valid: true }; },
        failUpload: async args => { calls.push('fail'); failures.push(args.outcome); return null; },
        asset: async (_args, token) => { expect(token).toBe('jwt'); calls.push('asset'); return { url: assetUrl, bytes: payload.length, hash }; },
        fetch: (async (_url: URL | RequestInfo, init?: RequestInit) => {
            calls.push('fetch'); sends.push(init ?? {});
            return init?.method === 'POST' ? Response.json({ storageId }) : new Response(payload);
        }),
    };
    const request = (body: BodyInit = payload, headers: Record<string, string> = {}, signal?: AbortSignal) => new Request(`${siteUrl}/api/cloud-imports/${attemptId}/0`, {
        method: 'POST', headers: { origin: siteUrl, 'content-type': 'application/octet-stream', 'x-weblab-content-sha256': hash, ...headers }, body, signal,
        // Node requires duplex for streaming requests; browsers construct these normally.
        ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
    });
    const assetRequest = (headers: Record<string, string> = {}, signal?: AbortSignal) => new Request(`${siteUrl}/api/cloud-imports/asset?${new URLSearchParams({
        projectId: 'p'.repeat(32), branchId: 'b'.repeat(32), path: 'files/photo.jpg', expectedHash: hash,
    })}`, { headers: { 'sec-fetch-site': 'same-origin', ...headers }, signal });
    return { deps, calls, timers, failures, receipts, sends, request, assetRequest, advance: (milliseconds: number) => { now += milliseconds; } };
}

// Dependency injection executes the real Node transport without Next, Clerk,
// provider calls or a simulated claim of distributed concurrency.
describe('trusted import upload transport', () => {
    it('claims before reading, hashes bytes before sending and records only the trusted provider receipt', async () => {
        const f = fixture();
        const body = new ReadableStream<Uint8Array>({ pull(controller) { f.calls.push('read'); controller.enqueue(payload); controller.close(); } }, { highWaterMark: 0 });
        const response = await createImportUploadHandler(f.deps)(f.request(body), target);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true });
        expect(f.calls).toEqual(['auth', 'claim', 'read', 'mark', 'fetch', 'owned']);
        expect(f.receipts).toEqual([{ ...target, fileIndex: 0, nonce: 'server-nonce', secret, storageId, actualBytes: 3, actualHash: hash }]);
        expect(f.sends[0]).toMatchObject({ redirect: 'error', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/octet-stream' } });
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(f.timers.every(timer => !timer.active)).toBe(true);
    });

    it('rejects origin, missing secret, auth and invalid metadata before reading the body', async () => {
        for (const mode of ['origin', 'secret', 'auth', 'hash', 'index', 'id', 'type']) {
            const f = fixture();
            let read = false;
            if (mode === 'secret') f.deps.secret = undefined;
            if (mode === 'auth') f.deps.authenticate = async () => null;
            const body = new ReadableStream<Uint8Array>({ pull(controller) { read = true; controller.close(); } }, { highWaterMark: 0 });
            const headers: Record<string, string> = mode === 'origin' ? { origin: 'https://foreign.test' } : mode === 'hash' ? { 'x-weblab-content-sha256': 'bad' } : mode === 'type' ? { 'content-type': 'text/plain' } : {};
            const response = await createImportUploadHandler(f.deps)(f.request(body, headers), mode === 'index' ? { ...target, fileIndex: '01' } : mode === 'id' ? { ...target, attemptId: '../other' } : target);
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(read).toBe(false); expect(f.calls).not.toContain('claim'); expect(f.sends).toHaveLength(0);
        }
    });

    it('refuses oversize length or claim and exact body/hash mismatches before provider access', async () => {
        for (const mode of ['length', 'claim', 'short', 'long', 'hash']) {
            const f = fixture();
            if (mode === 'claim') f.deps.claimUpload = async () => ({ nonce: 'nonce', url: uploadUrl, bytes: 32 * 1024 * 1024 + 1, hash });
            const body = mode === 'short' ? payload.slice(0, 2) : mode === 'long' ? new Uint8Array([1, 2, 3, 4]) : mode === 'hash' ? new Uint8Array([4, 5, 6]) : payload;
            const response = await createImportUploadHandler(f.deps)(f.request(body, mode === 'length' ? { 'content-length': String(32 * 1024 * 1024 + 1) } : {}), target);
            expect(response.status).toBe(400); expect(f.sends).toHaveLength(0);
            if (mode !== 'length') expect(f.failures).toEqual(['not-sent']);
        }
    });

    it('allows signed query strings but never sends to a foreign or non-storage upload target', async () => {
        for (const url of ['https://foreign.convex.cloud/api/storage/upload', `${convexUrl}/api/query`, `http://example.convex.cloud/api/storage/upload`, `https://user@example.convex.cloud/api/storage/upload`]) {
            const f = fixture();
            f.deps.claimUpload = async () => ({ nonce: 'nonce', url, bytes: 3, hash });
            expect((await createImportUploadHandler(f.deps)(f.request(), target)).status).toBe(400);
            expect(f.sends).toHaveLength(0); expect(f.failures).toEqual(['not-sent']);
        }
    });

    it('rechecks permission before the single send and never retries an uncertain provider POST', async () => {
        const denied = fixture();
        denied.deps.markSending = async () => false;
        expect((await createImportUploadHandler(denied.deps)(denied.request(), target)).status).toBe(400);
        expect(denied.sends).toHaveLength(0); expect(denied.failures).toEqual(['not-sent']);
        const uncertain = fixture();
        let posts = 0;
        uncertain.deps.fetch = (async () => { posts++; throw new Error('Network outcome unknown'); });
        expect((await createImportUploadHandler(uncertain.deps)(uncertain.request(), target)).status).toBe(502);
        expect(posts).toBe(1); expect(uncertain.failures).toEqual(['unknown']);
    });

    it('retries only known ownership receipts without a JWT and never exposes their identifiers', async () => {
        const f = fixture();
        let count = 0;
        f.deps.recordOwned = async args => { f.receipts.push(args); if (++count < 3) throw new Error('Temporary receipt failure'); return { valid: true }; };
        const response = await createImportUploadHandler(f.deps)(f.request(), target);
        expect(response.status).toBe(200); expect(count).toBe(3); expect(f.sends).toHaveLength(1);
        expect(f.receipts.every(args => !('token' in (args as object)))).toBe(true);
        const body = await response.text();
        for (const value of [storageId, uploadUrl, 'server-nonce', secret]) expect(body).not.toContain(value);
        const failed = fixture(); let attempts = 0;
        failed.deps.recordOwned = async () => { attempts++; throw new Error('Unavailable'); };
        expect((await createImportUploadHandler(failed.deps)(failed.request(), target)).status).toBe(502);
        expect(attempts).toBe(3); expect(failed.failures).toEqual(['unknown']); expect(failed.sends).toHaveLength(1);
    });

    it('bounds and validates provider JSON without accepting redirects', async () => {
        for (const response of [
            new Response('x'.repeat(4097)), Response.json({ storageId: '../foreign' }),
            Object.defineProperty(Response.json({ storageId }), 'redirected', { value: true }),
        ]) {
            const f = fixture(); f.deps.fetch = (async () => response);
            expect((await createImportUploadHandler(f.deps)(f.request(), target)).status).toBe(502);
            expect(f.receipts).toHaveLength(0); expect(f.failures).toEqual(['unknown']);
        }
    });

    it('adds a process memory ceiling of two while the backend remains the global authority', async () => {
        const f = fixture(); const admitted = deferred<void>(); const release = deferred<void>(); let claims = 0;
        const original = f.deps.claimUpload;
        f.deps.claimUpload = async (args, token) => { if (++claims === 2) admitted.resolve(); await release.promise; return original(args, token); };
        const handler = createImportUploadHandler(f.deps);
        const first = handler(f.request(), target); const second = handler(f.request(), target);
        await admitted.promise;
        expect((await handler(f.request(), target)).status).toBe(429);
        expect(claims).toBe(2);
        release.resolve();
        expect((await first).status).toBe(200); expect((await second).status).toBe(200);
    });

    it('cancels a stalled upload body at the fixed 90-second deadline', async () => {
        const f = fixture(); const reading = deferred<void>(); let canceled = false;
        const body = new ReadableStream<Uint8Array>({ pull() { reading.resolve(); return new Promise(() => {}); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
        const pending = createImportUploadHandler(f.deps)(f.request(body), target);
        await reading.promise;
        const deadline = f.timers.find(timer => timer.milliseconds === 90_000)!;
        deadline.fire();
        expect((await pending).status).toBe(400); expect(canceled).toBe(true);
        expect(f.failures).toEqual(['not-sent']); expect(f.sends).toHaveLength(0);
    });
});

describe('trusted import asset transport', () => {
    it('accepts same-origin browser GETs behind an internal reverse-proxy URL while retaining auth and canonical configuration checks', async () => {
        for (const mode of ['valid', 'foreign-origin', 'cross-site', 'missing-auth', 'invalid-site']) {
            const f = fixture();
            const browserRequest = f.assetRequest();
            const internalUrl = new URL(browserRequest.url);
            internalUrl.protocol = 'http:'; internalUrl.host = '0.0.0.0:8080';
            const headers = new Headers(browserRequest.headers);
            if (mode === 'foreign-origin') headers.set('origin', 'https://foreign.test');
            if (mode === 'cross-site') headers.set('sec-fetch-site', 'cross-site');
            if (mode === 'missing-auth') f.deps.authenticate = async () => null;
            if (mode === 'invalid-site') f.deps.siteUrl = `${siteUrl}/unexpected-path`;
            const response = await createImportAssetHandler(f.deps)(new Request(internalUrl, { headers }));
            if (mode === 'valid') {
                expect(response.status).toBe(200);
                expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
            } else {
                expect(response.status).toBe(mode === 'missing-auth' ? 401 : 403);
                expect(f.sends).toHaveLength(0);
            }
        }
    });

    it('streams only the authorized object with private headers and no forwarded cookie or provider headers', async () => {
        const f = fixture();
        const response = await createImportAssetHandler(f.deps)(f.assetRequest({ cookie: 'private-cookie' }));
        expect(response.status).toBe(200);
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
        expect(response.headers.get('content-type')).toBe('application/octet-stream');
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
        expect(f.sends[0]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
        expect(f.sends[0]?.headers).toBeUndefined();
        expect(f.timers.every(timer => !timer.active)).toBe(true);
    });

    it('denies cross-site/no-origin navigation and client-selected storage metadata', async () => {
        for (const headers of [{ origin: 'https://other.test' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'none' }] as Array<Record<string, string>>) {
            const f = fixture();
            expect((await createImportAssetHandler(f.deps)(f.assetRequest(headers))).status).toBe(403);
            expect(f.calls).toEqual([]);
        }
        const f = fixture();
        const input = f.assetRequest(); const url = new URL(input.url); url.searchParams.set('storageId', storageId);
        expect((await createImportAssetHandler(f.deps)(new Request(url, { headers: input.headers }))).status).toBe(400);
        expect(f.calls).toEqual([]);
    });

    it('rejects unsafe asset origin and oversize metadata before provider access', async () => {
        for (const metadata of [{ url: 'https://foreign.test/file', bytes: 3, hash }, { url: assetUrl, bytes: 32 * 1024 * 1024 + 1, hash }]) {
            const f = fixture(); f.deps.asset = async () => metadata;
            expect((await createImportAssetHandler(f.deps)(f.assetRequest())).status).toBe(400);
            expect(f.sends).toHaveLength(0);
        }
    });

    it('reauthorizes before later bytes and retains only bytes already forwarded before revocation', async () => {
        const f = fixture(); let checks = 0; let canceled = false; let pulls = 0;
        f.deps.asset = async () => { if (++checks > 1) throw new Error('Membership revoked'); return { url: assetUrl, bytes: 3, hash }; };
        f.deps.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
            pull(controller) { controller.enqueue(payload.slice(pulls, ++pulls)); }, cancel() { canceled = true; },
        }, { highWaterMark: 0 })));
        const response = await createImportAssetHandler(f.deps)(f.assetRequest());
        const reader = response.body!.getReader();
        expect((await reader.read()).value).toEqual(new Uint8Array([1]));
        f.advance(5_000);
        await expect(reader.read()).rejects.toThrow('CLOUD_IMPORT_TRANSFER_FAILED');
        expect(checks).toBe(2); expect(canceled).toBe(true);
    });

    it('refuses changed asset metadata during reauthorization', async () => {
        for (const changed of [{ url: `${assetUrl}?changed=1` }, { bytes: 4 }, { hash: 'a'.repeat(64) }]) {
            const f = fixture(); let checks = 0;
            f.deps.asset = async () => ({ url: assetUrl, bytes: 3, hash, ...(++checks > 1 ? changed : {}) });
            const response = await createImportAssetHandler(f.deps)(f.assetRequest());
            f.advance(5_001);
            await expect(response.arrayBuffer()).rejects.toThrow('CLOUD_IMPORT_TRANSFER_FAILED');
            expect(checks).toBe(2);
        }
    });

    it('errors on short, excessive or hash-mismatched bytes instead of accepting a complete asset', async () => {
        for (const bytes of [payload.slice(0, 2), new Uint8Array([1, 2, 3, 4]), new Uint8Array([9, 9, 9])]) {
            const f = fixture(); f.deps.fetch = (async () => new Response(bytes));
            const response = await createImportAssetHandler(f.deps)(f.assetRequest());
            await expect(response.arrayBuffer()).rejects.toThrow('CLOUD_IMPORT_TRANSFER_FAILED');
        }
    });

    it('aborts provider streaming on client cancellation and at the fixed 30-second deadline', async () => {
        for (const mode of ['cancel', 'deadline']) {
            const f = fixture(); let canceled = false; let providerSignal: AbortSignal | null | undefined;
            f.deps.fetch = (async (_url: URL | RequestInfo, init?: RequestInit) => {
                providerSignal = init?.signal;
                return new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }, { highWaterMark: 0 }));
            });
            const response = await createImportAssetHandler(f.deps)(f.assetRequest());
            if (mode === 'cancel') await response.body!.cancel();
            else {
                f.timers.find(timer => timer.milliseconds === 30_000)!.fire();
                await expect(response.arrayBuffer()).rejects.toThrow('CLOUD_IMPORT_TRANSFER_FAILED');
            }
            expect(providerSignal?.aborted).toBe(true); expect(canceled).toBe(true);
        }
    });
});
