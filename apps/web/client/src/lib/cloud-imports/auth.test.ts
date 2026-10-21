import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { importSessionToken, type ImportSessionVerifier } from './auth';

const site = 'https://weblab.example';
const signedIn: ImportSessionVerifier = async () => ({
    status: 'signed-in', tokenType: 'session_token',
    toAuth: () => ({ userId: 'user', getToken: async () => 'convex-token' }),
});

describe('import route session verification', () => {
    it('verifies the canonical site with no body, query, middleware or forwarded headers', async () => {
        const body = new ReadableStream({ start() {}, pull() { throw new Error('Body must not be read'); } }, { highWaterMark: 0 });
        const request = new Request('http://0.0.0.0:8080/api/cloud-imports/attempt/0?__clerk_db_jwt=bad', {
            method: 'POST', body, duplex: 'half', headers: {
                cookie: '__session=signed', authorization: 'Bearer session', origin: site,
                'sec-fetch-dest': 'empty', 'x-clerk-auth-status': 'signed-in', 'x-clerk-auth-user-id': 'attacker',
                'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https',
            },
        } as RequestInit);
        const result = await importSessionToken(request, site, async (input, options) => {
            expect(input.url).toBe(`${site}/api/cloud-imports/attempt/0`);
            expect(input.method).toBe('HEAD'); expect(input.body).toBeNull();
            expect([...input.headers.keys()].sort()).toEqual(['authorization', 'cookie', 'origin', 'sec-fetch-dest']);
            expect(options).toEqual({ acceptsToken: 'session_token', authorizedParties: [site] });
            return { status: 'signed-in', tokenType: 'session_token', toAuth: settings => {
                expect(settings).toEqual({ treatPendingAsSignedOut: true });
                return { userId: 'user', getToken: async options => { expect(options).toEqual({ template: 'convex' }); return 'convex-token'; } };
            } };
        });
        expect(result).toBe('convex-token'); expect(request.bodyUsed).toBe(false);
        await request.body?.cancel();
    });
    it('never uses a protocol-relative input path as the auth host', async () => {
        await importSessionToken(new Request('http://internal//evil.example/p?token=secret'), site, async (input, options) => {
            expect(new URL(input.url).origin).toBe(site); expect(new URL(input.url).search).toBe('');
            return signedIn(input, options);
        });
    });
    it('rejects signed-out, handshake, pending and machine identities', async () => {
        for (const [status, tokenType, userId] of [
            ['signed-out', 'session_token', null], ['handshake', 'session_token', null],
            ['signed-in', 'session_token', null], ['signed-in', 'api_key', 'user'],
        ]) {
            const value = await importSessionToken(new Request(`${site}/api/cloud-imports/asset`), site, async () => ({
                status: status!, tokenType: tokenType!, toAuth: () => ({ userId: userId ?? null,
                    getToken: async () => { throw new Error('Must not mint'); } }),
            }));
            expect(value).toBeNull();
        }
    });
    it('refuses unsafe canonical configuration before verification', async () => {
        for (const url of ['http://public.example', 'https://user@weblab.example', `${site}/path`, `${site}?q=1`]) {
            expect(await importSessionToken(new Request(site), url, async () => { throw new Error('Must not verify'); })).toBeNull();
        }
    });
});

describe('actual Next middleware matching', () => {
    for (const relative of ['../../../middleware.ts', '../../middleware.ts']) {
        it(`excludes import transport without bypassing app/private review routes (${relative})`, () => {
            const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
            const matcher = source.match(/matcher:\s*\['([^']+)'\]/)?.[1];
            expect(matcher).toBeDefined();
            const matches = (path: string) => unstable_doesMiddlewareMatch({ config: { matcher: [matcher!] }, url: `${site}${path}` });
            for (const path of ['/api/cloud-imports', '/api/cloud-imports/asset', '/api/cloud-imports/abc/0']) expect(matches(path)).toBe(false);
            for (const path of ['/', '/project/abc', '/cloud-review/abc', '/api/cloud-releases/review/abc', '/api/cloud-imports-other', '/api/chat']) expect(matches(path)).toBe(true);
        });
    }
});
