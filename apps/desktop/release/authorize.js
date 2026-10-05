'use strict';

// A renderer cannot serialize this key. IPC binds it to the actual initiating frame.
const REQUEST_ACTIVE = Symbol('publishing-request-active');
function assertRequestActive(input) {
    if (typeof input[REQUEST_ACTIVE] !== 'function' || !input[REQUEST_ACTIVE]()) {
        throw new Error('The publishing window changed. Open publishing again.');
    }
}

function createPublishAuthorizer(appUrl, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    const origin = new URL(appUrl);
    if (origin.username || origin.password || (origin.protocol !== 'https:' &&
        !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) {
        throw new Error('Publishing requires a trusted app origin.');
    }
    return async (input) => {
        assertRequestActive(input);
        const { projectId, branchId, jwt } = input;
        if (typeof jwt !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt) || jwt.length > 8192) {
            throw new Error('Sign in again before publishing.');
        }
        let claims;
        try { claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); }
        catch { throw new Error('Sign in again before publishing.'); }
        // This is an early rejection only. The app server verifies the signature,
        // Clerk session and current project membership on every operation.
        if (typeof claims.sub !== 'string' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now()) {
            throw new Error('Sign in again before publishing.');
        }
        const response = await fetchImpl(new URL('/api/native/publishing/authorize', origin).href, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, branchId }),
        });
        if (!response.ok) throw new Error('Your publishing access could not be verified.');
        const text = await response.text();
        assertRequestActive(input);
        if (text.length > 8192) throw new Error('Invalid publishing authorization.');
        let result;
        try { result = JSON.parse(text); } catch { throw new Error('Invalid publishing authorization.'); }
        if (result.userId !== claims.sub || result.projectId !== projectId || result.branchId !== branchId ||
            typeof result.rootPath !== 'string' || !result.rootPath || typeof result.cmsRequired !== 'boolean' || typeof result.productionSwitchEnabled !== 'boolean' || !Number.isFinite(result.expiresAt) ||
            result.expiresAt <= now() || result.expiresAt > now() + 30_000) {
            throw new Error('Invalid publishing authorization.');
        }
        return { userId: result.userId, projectId, branchId, rootPath: result.rootPath, cmsRequired: result.cmsRequired, productionSwitchEnabled: result.productionSwitchEnabled };
    };
}

module.exports = { createPublishAuthorizer, REQUEST_ACTIVE, assertRequestActive };
