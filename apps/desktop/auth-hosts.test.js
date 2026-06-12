// Unit tests for the desktop navigation host policy (auth-hosts.js).
//
// Regression guard for the "desktop loads empty in dev" bug: Clerk's dev-mode
// handshake redirects the top-level document to `<slug>.clerk.accounts.dev`,
// and main.js used to bounce that to the external browser via isOAuthHost,
// leaving the window blank. Clerk FAPI/handshake hosts must NOT be treated as
// OAuth provider pages.

import { describe, expect, test } from 'bun:test';
import { isClerkFapiHost, isOAuthHost } from './auth-hosts.js';

describe('isClerkFapiHost', () => {
    test.each([
        'full-redbird-32.clerk.accounts.dev', // the exact dev host from the bug log
        'foo-bar-1.clerk.accounts.dev',
        'clerk.weblab.build',
    ])('treats Clerk FAPI host %s as FAPI', (host) => {
        expect(isClerkFapiHost(host)).toBe(true);
    });

    test.each([
        'accounts.weblab.build', // hosted account portal, not FAPI
        'accounts.google.com',
        'github.com',
        'weblab.build',
    ])('does not treat %s as FAPI', (host) => {
        expect(isClerkFapiHost(host)).toBe(false);
    });
});

describe('isOAuthHost', () => {
    test.each([
        'full-redbird-32.clerk.accounts.dev', // <- the bug: must stay in-window
        'clerk.weblab.build',
    ])('never bounces Clerk FAPI host %s', (host) => {
        expect(isOAuthHost(host)).toBe(false);
    });

    test.each([
        'accounts.google.com',
        'appleid.apple.com',
        'github.com',
        'gist.github.com', // subdomain of a blocked host
        'vercel.com',
        'accounts.weblab.build', // hosted sign-in UI stays external by design
    ])('bounces OAuth provider / portal host %s', (host) => {
        expect(isOAuthHost(host)).toBe(true);
    });

    test.each([
        'localhost',
        'weblab.build',
        'www.weblab.build',
    ])('allows first-party / app host %s in-window', (host) => {
        expect(isOAuthHost(host)).toBe(false);
    });
});
