const { describe, test, expect } = require('bun:test');
const { createPublishAuthorizer, REQUEST_ACTIVE } = require('./authorize');

const now = () => 1_000_000;
const jwt = (claims = { sub: 'user_a', exp: 1100 }) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const response = (overrides = {}) => Response.json({ userId: 'user_a', projectId: 'project', branchId: 'branch', rootPath: '/project', cmsRequired: false, productionSwitchEnabled: false, expiresAt: now() + 15_000, ...overrides });
const input = () => ({ projectId: 'project', branchId: 'branch', jwt: jwt(), [REQUEST_ACTIVE]: () => true });

describe('native publication authorization', () => {
    test('uses the configured origin and only the bearer, without browser cookies', async () => {
        let request;
        const authorize = createPublishAuthorizer('https://weblab.build/projects', {
            now, fetchImpl: async (url, init) => { request = { url, init }; return response(); },
        });
        expect((await authorize(input())).userId).toBe('user_a');
        expect(request.url).toBe('https://weblab.build/api/native/publishing/authorize');
        expect(request.init.redirect).toBe('error');
        expect(request.init.headers.Cookie).toBeUndefined();
    });

    test('missing/expired claims never reach the network', async () => {
        let calls = 0;
        const authorize = createPublishAuthorizer('https://weblab.build', { now, fetchImpl: async () => { calls++; return response(); } });
        for (const token of ['', jwt({ sub: 'user_a', exp: 999 }), jwt({ sub: 'user_a' })]) {
            await expect(authorize({ ...input(), jwt: token })).rejects.toThrow();
        }
        expect(calls).toBe(0);
    });

    test('a different user/project/branch or stale permission cannot unlock credentials', async () => {
        for (const overrides of [{ userId: 'user_b' }, { projectId: 'other' }, { branchId: 'other' }, { expiresAt: 0 }, { rootPath: null }, { productionSwitchEnabled: undefined }, { productionSwitchEnabled: 'true' }]) {
            const authorize = createPublishAuthorizer('https://weblab.build', { now, fetchImpl: async () => response(overrides) });
            await expect(authorize(input())).rejects.toThrow('Invalid');
        }
    });

    test('non-HTTPS external origins and refusal responses fail closed', async () => {
        expect(() => createPublishAuthorizer('http://example.com')).toThrow('trusted');
        expect(() => createPublishAuthorizer('https://secret@example.com')).toThrow('trusted');
        const authorize = createPublishAuthorizer('https://weblab.build', { now, fetchImpl: async () => new Response('', { status: 403 }) });
        await expect(authorize(input())).rejects.toThrow('access');
    });
});


test('navigation during server authorization refuses the delayed result', async () => {
    let active = true;
    const authorize = createPublishAuthorizer('https://weblab.build', {
        now, fetchImpl: async () => { active = false; return response(); },
    });
    await expect(authorize({ ...input(), [REQUEST_ACTIVE]: () => active })).rejects.toThrow('window changed');
});
