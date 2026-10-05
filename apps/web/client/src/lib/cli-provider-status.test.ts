import { describe, expect, test } from 'bun:test';
import { cliProviderStatus } from './cli-provider-status';

describe('desktop provider availability', () => {
    test('unverified isolation never becomes an install prompt or a ready model', () => {
        expect(cliProviderStatus({ installed: false, authStatus: 'unknown', blockedCode: 'isolation-unverified' }))
            .toEqual({ kind: 'unavailable', unavailableReason: 'isolation-unverified' });
    });
    test('failed authentication probes never become ready', () => {
        expect(cliProviderStatus({ installed: true, authStatus: 'unknown' }).kind).toBe('unavailable');
        expect(cliProviderStatus({ installed: true, authStatus: 'sign-in' }).kind).toBe('sign-in');
        expect(cliProviderStatus({ installed: true, authStatus: 'ready', version: '1' }))
            .toEqual({ kind: 'ready', version: '1' });
        expect(cliProviderStatus({ installed: false, authStatus: 'sign-in' }).kind).toBe('install');
    });
});
