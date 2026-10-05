import { EventEmitter } from 'node:events';
import { timingSafeEqual } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'bun:test';
import { CLOUD_PREVIEW_GATEWAY_SCRIPT } from './cloudPreviewGateway';

type Headers = Record<string, string | string[] | undefined>;
const capability = 'ab'.repeat(32), ticket = 'cd'.repeat(32), verifier = 'ef'.repeat(32);
const cookie = '__Host-weblab-preview=' + ticket, host = 'test-preview.vercel.run';

class Stream extends EventEmitter {
    destroyed = false; ended = false; paused = false;
    writes: string[] = []; headers: Headers = {}; statusCode = 200; headersSent = false; pipedTo?: Stream;
    write(value: string | Buffer) { this.writes.push(value.toString()); return true; }
    end(value?: string) { if (value) this.write(value); this.ended = true; }
    destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
    pipe(destination: Stream) { this.pipedTo = destination; this.paused = false; return destination; }
    pause() { this.paused = true; }
    resume() { this.paused = false; }
    setTimeout(_delay: number, _callback?: () => void) { return this; }
    writeHead(status: number, headers: Headers) { this.statusCode = status; this.headers = headers; this.headersSent = true; }
}
class Request extends Stream {
    constructor(public url: string, public method = 'GET', headers: Headers = {}) { super(); this.headers = { host, ...headers }; }
}

/** Exercises the shipped program with no sockets, real timers, fetches or processes. */
function gateway() {
    let now = 1_000_000, allowed = true, unavailable = false;
    let wait: Promise<void> | null = null;
    let handle!: (request: Request, response: Stream) => Promise<void>;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const timers: Array<{ callback: () => void | Promise<void>; delay: number; cleared: boolean; unref: () => void }> = [];
    const requests: Array<{ options: { hostname: string; port: number; method: string; path: string; headers: Headers }; stream: Stream; respond?: (response: Stream) => void }> = [];
    const server = Object.assign(new EventEmitter(), { listen() {}, close() {}, closeAllConnections() {} });
    runInNewContext(CLOUD_PREVIEW_GATEWAY_SCRIPT, {
        require: (name: string) => {
            if (name === 'node:crypto') return { timingSafeEqual };
            if (name !== 'node:http') throw new Error('Unexpected module');
            return {
                createServer: (callback: typeof handle) => { handle = callback; return server; },
                request: (options: (typeof requests)[number]['options'], respond?: (response: Stream) => void) => {
                    const stream = new Stream(); requests.push({ options, stream, respond }); return stream;
                },
            };
        },
        fetch: async (url: URL, options: { body: string }) => {
            const body = JSON.parse(options.body) as { args: Array<Record<string, string>> };
            calls.push({ url: url.toString(), body });
            if (wait) await wait;
            if (unavailable) throw new Error('Service unavailable');
            return { ok: true, json: async () => ({ status: 'success', value: {
                allowed: allowed && body.args[0]?.ticket === ticket && body.args[0]?.verifier === verifier, expiresAt: 1_900_000,
            } }) };
        },
        process: { env: {
            WEBLAB_PREVIEW_CAPABILITY: capability, WEBLAB_PREVIEW_VERIFIER: verifier,
            WEBLAB_PREVIEW_PROJECT_ID: 'project', WEBLAB_PREVIEW_BRANCH_ID: 'branch', WEBLAB_PREVIEW_SANDBOX_ID: 'sandbox',
            WEBLAB_CONVEX_URL: 'https://deployment.convex.cloud', WEBLAB_PREVIEW_EXPIRES_AT: '1900000', WEBLAB_EDITOR_ORIGIN: 'https://editor.example.com',
        } },
        Buffer, URL, Date: { now: () => now }, AbortSignal: { timeout: () => undefined },
        setTimeout: (callback: () => void | Promise<void>, delay: number) => {
            const timer = { callback, delay, cleared: false, unref() {} }; timers.push(timer); return timer;
        },
        clearTimeout: (timer: (typeof timers)[number]) => { timer.cleared = true; },
    });
    return {
        requests, timers, calls, revoke: () => { allowed = false; }, fail: () => { unavailable = true; },
        expire: () => { now += 900_001; }, wait: (promise: Promise<void>) => { wait = promise; },
        request: async (url: string, headers: Headers = {}, method = 'GET') => {
            const request = new Request(url, method, headers), response = new Stream();
            await handle(request, response); return { request, response };
        },
        upgrade: async (headers: Headers = {}) => {
            const socket = new Stream();
            const handler = server.listeners('upgrade')[0] as (request: Request, socket: Stream, head: Buffer) => Promise<void>;
            await handler(new Request('/_next/webpack-hmr', 'GET', { upgrade: 'websocket', origin: 'https://' + host, ...headers }), socket, Buffer.from('client-head'));
            return socket;
        },
        monitor: () => [...timers].reverse().find(timer => timer.delay === 2000 && !timer.cleared)!,
    };
}

describe('current-access preview gateway', () => {
    it('rejects anonymous documents/assets/upgrades without contacting Next', async () => {
        const app = gateway();
        for (const path of ['/', '/about', '/_next/static/chunk.js', '/image.png']) expect((await app.request(path)).response.statusCode).toBe(401);
        expect((await app.upgrade()).writes.join('')).toContain('401 Unauthorized');
        expect(app.requests).toHaveLength(0);
    });

    it('checks an actor ticket before exchanging it for a protected cookie', async () => {
        const app = gateway(), { response } = await app.request('/about?other=1&__weblab_preview=' + ticket);
        expect(response.statusCode).toBe(303); expect(response.headers.location).toBe('/about?other=1');
        expect(response.headers['set-cookie']).toBe(cookie + '; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=900');
        expect(app.calls[0]).toEqual({ url: 'https://deployment.convex.cloud/api/query', body: {
            path: 'cloudPreviewAccess:authorize', format: 'convex_encoded_json',
            args: [{ projectId: 'project', branchId: 'branch', sandboxId: 'sandbox', verifier, ticket }],
        } });
        expect((await app.request('/?__weblab_preview=' + capability)).response.statusCode).toBe(401);
        expect((await app.request('/?__weblab_preview=' + ticket + '&__weblab_preview=' + ticket)).response.statusCode).toBe(401);
        expect((await app.request('/?__weblab_preview=' + ticket, {}, 'POST')).response.statusCode).toBe(401);
    });

    it('rechecks every request and fails closed on revoked access or authorization outage', async () => {
        const app = gateway(); await app.request('/one.js', { cookie }); await app.request('/two.js', { cookie });
        expect(app.calls).toHaveLength(2); expect(app.requests).toHaveLength(2);
        app.revoke(); expect((await app.request('/three.js', { cookie })).response.statusCode).toBe(401);
        expect(app.requests).toHaveLength(2);
        const down = gateway(); down.fail(); expect((await down.request('/', { cookie })).response.statusCode).toBe(401);
        expect(down.requests).toHaveLength(0);
    });

    it('strips gateway credentials and preserves protected asset forwarding', async () => {
        const app = gateway(), { request, response } = await app.request('/_next/static/chunk.js?x=1', {
            cookie: 'theme=dark; ' + cookie, authorization: 'Bearer unrelated', 'x-weblab-preview': ticket,
        });
        const upstream = app.requests[0]!;
        expect(upstream.options.hostname).toBe('127.0.0.1'); expect(upstream.options.port).toBe(3001);
        expect(upstream.options.headers.cookie).toBe('theme=dark'); expect(upstream.options.headers.authorization).toBeUndefined();
        expect(JSON.stringify(upstream.options)).not.toContain(ticket); expect(request.pipedTo).toBe(upstream.stream);
        const reply = new Stream();
        reply.headers = { 'cache-control': 'public', 'set-cookie': ['__Host-weblab-preview=forged', 'theme=light'], 'access-control-allow-origin': '*' };
        upstream.respond!(reply);
        expect(response.headers['set-cookie']).toEqual(['theme=light']); expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['content-security-policy']).toBe('frame-ancestors https://editor.example.com');
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('accepts private readiness control only on GET/HEAD and never forwards that secret', async () => {
        const app = gateway(); await app.request('/weblab-preload-script.js', { 'x-weblab-preview-control': capability });
        expect(app.calls).toHaveLength(0); expect(app.requests).toHaveLength(1);
        expect(JSON.stringify(app.requests[0]!.options)).not.toContain(capability);
        expect((await app.request('/', { cookie: '__Host-weblab-preview=' + capability })).response.statusCode).toBe(401);
        expect((await app.request('/', { 'x-weblab-preview-control': capability }, 'POST')).response.statusCode).toBe(401);
    });

    it('rejects malformed paths, duplicate cookies, CSRF and absolute expiry', async () => {
        const app = gateway();
        for (const path of ['http://example.com/', '//example.com/', '/%2fexample.com', '/bad%5cpath', '/bad%00path'])
            expect((await app.request(path, { cookie })).response.statusCode).toBe(400);
        expect((await app.request('/', { cookie: cookie + '; ' + cookie })).response.statusCode).toBe(401);
        expect((await app.request('/api/example', { cookie, origin: 'https://attacker.example' }, 'POST')).response.statusCode).toBe(403);
        app.expire(); expect((await app.request('/', { cookie })).response.statusCode).toBe(401); expect(app.requests).toHaveLength(0);
    });

    it('closes ongoing HTTP streams when membership is revoked', async () => {
        const app = gateway(), { request, response } = await app.request('/stream', { cookie });
        const reply = new Stream(); app.requests[0]!.respond!(reply);
        app.revoke(); await app.monitor().callback();
        expect(request.destroyed).toBe(true); expect(response.destroyed).toBe(true); expect(app.requests[0]!.stream.destroyed).toBe(true);
    });

    it('pauses a late HTTP response while its recheck is pending', async () => {
        const app = gateway(); await app.request('/stream', { cookie });
        let release!: () => void; app.wait(new Promise(resolve => { release = resolve; }));
        const checking = app.monitor().callback(), reply = new Stream(); app.requests[0]!.respond!(reply);
        expect(reply.paused).toBe(true); app.revoke(); release(); await checking; expect(app.requests[0]!.stream.destroyed).toBe(true);
    });

    it('preserves WebSocket forwarding and closes both endpoints after revocation', async () => {
        const app = gateway();
        expect((await app.upgrade({ cookie, origin: 'https://attacker.example' })).writes.join('')).toContain('401 Unauthorized');
        const socket = await app.upgrade({ cookie }), upstream = app.requests[0]!, remote = new Stream(), response = new Stream();
        response.statusCode = 101; upstream.stream.emit('upgrade', response, remote, Buffer.from('server-head'));
        expect(socket.writes.join('')).toContain('101 Switching Protocols'); expect(socket.pipedTo).toBe(remote); expect(remote.pipedTo).toBe(socket);
        expect(remote.writes).toContain('client-head'); expect(socket.writes).toContain('server-head');
        app.revoke(); await app.monitor().callback();
        expect(socket.destroyed).toBe(true); expect(remote.destroyed).toBe(true); expect(upstream.stream.destroyed).toBe(true);
    });

    it('does not forward upgrade headers or head bytes while authorization is pending', async () => {
        const app = gateway(), socket = await app.upgrade({ cookie });
        let release!: () => void; app.wait(new Promise(resolve => { release = resolve; }));
        const checking = app.monitor().callback(), response = new Stream(), remote = new Stream();
        response.statusCode = 101; app.requests[0]!.stream.emit('upgrade', response, remote, Buffer.from('server-head'));
        expect(socket.writes).toEqual([]); expect(remote.writes).toEqual([]); expect(socket.pipedTo).toBeUndefined();
        expect(remote.paused).toBe(true); expect(socket.paused).toBe(true);
        app.revoke(); release(); await checking; expect(remote.destroyed).toBe(true);
    });

    it('does not resurrect an upgrade after the browser disconnects', async () => {
        const app = gateway(), socket = await app.upgrade({ cookie }); socket.destroy();
        const remote = new Stream(), response = new Stream(); response.statusCode = 101;
        app.requests[0]!.stream.emit('upgrade', response, remote, Buffer.alloc(0));
        expect(remote.destroyed).toBe(true); expect(socket.pipedTo).toBeUndefined();
    });
});
