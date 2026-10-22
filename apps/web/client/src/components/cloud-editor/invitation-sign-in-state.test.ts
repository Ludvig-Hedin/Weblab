import { describe, expect, it } from 'bun:test';
import { invitationEmailFactor, invitationSessionUsable, invitationSignInNext } from './invitation-sign-in-state';

describe('invitation existing-account sign-in admission', () => {
    it('only offers an explicit email-code first factor', () => {
        expect(invitationEmailFactor({ status: 'needs_identifier', supportedFirstFactors: null })).toBeNull();
        expect(invitationEmailFactor({ status: 'needs_first_factor', supportedFirstFactors: [{ strategy: 'password' }] })).toBeNull();
        const email = { strategy: 'email_code' as const, emailAddressId: 'email_one', safeIdentifier: 'a***@example.com' };
        expect(invitationEmailFactor({ status: 'needs_first_factor', supportedFirstFactors: [email] })).toEqual(email);
        expect(invitationEmailFactor({ status: 'needs_second_factor', supportedFirstFactors: [email] })).toBeNull();
    });
    it('requires a complete result and the matching active task-free session', () => {
        const result = { status: 'complete' as const, createdSessionId: 'session_one' };
        const active = { id: 'session_one', status: 'active' };
        expect(invitationSignInNext(result, [active])).toEqual({ kind: 'activate', sessionId: 'session_one' });
        expect(invitationSignInNext(result, [{ ...active, id: 'another_session' }])).toEqual({ kind: 'session-blocked' });
        expect(invitationSignInNext({ ...result, createdSessionId: null }, [active])).toEqual({ kind: 'session-blocked' });
        expect(invitationSignInNext(result, [])).toEqual({ kind: 'session-blocked' });
        for (const status of ['pending', 'expired', 'revoked', 'ended', 'removed', 'replaced', 'abandoned']) {
            expect(invitationSignInNext(result, [{ ...active, status }])).toEqual({ kind: 'session-blocked' });
        }
        expect(invitationSignInNext(result, [{ ...active, currentTask: { key: 'choose-organization' } }])).toEqual({ kind: 'session-blocked' });
    });
    it('never promotes second-factor, trust, password or incomplete results', () => {
        expect(invitationSignInNext({ status: 'needs_second_factor', createdSessionId: 'session_one' }, [{ id: 'session_one', status: 'active' }])).toEqual({ kind: 'second-factor' });
        for (const status of [null, 'needs_identifier', 'needs_first_factor', 'needs_client_trust', 'needs_new_password'] as const) {
            expect(invitationSignInNext({ status, createdSessionId: 'session_one' }, [{ id: 'session_one', status: 'active' }])).toEqual({ kind: 'unsupported' });
        }
    });
    it('gates the explicit Accept surface on a usable reactive session', () => {
        expect(invitationSessionUsable(null)).toBe(false);
        expect(invitationSessionUsable({ id: '', status: 'active' })).toBe(false);
        expect(invitationSessionUsable({ id: 'one', status: 'pending' })).toBe(false);
        expect(invitationSessionUsable({ id: 'one', status: 'active', currentTask: { key: 'setup-mfa' } })).toBe(false);
        expect(invitationSessionUsable({ id: 'one', status: 'active' })).toBe(true);
    });
});
