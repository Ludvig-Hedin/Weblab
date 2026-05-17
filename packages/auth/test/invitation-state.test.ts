import { describe, expect, it } from 'bun:test';

import { InvitationStatus } from '@weblab/models';

import { checkAcceptable, checkRevocable, isEmailMatch } from '../src/invitation-state';

const NOW = new Date('2026-05-17T12:00:00Z');
const FUTURE = new Date('2026-05-24T12:00:00Z');
const PAST = new Date('2026-05-10T12:00:00Z');

describe('checkAcceptable', () => {
    it('pending + not expired → null (acceptable)', () => {
        expect(
            checkAcceptable({ status: InvitationStatus.PENDING, expiresAt: FUTURE }, NOW),
        ).toBeNull();
    });

    it('pending but past expires_at → "expired"', () => {
        expect(checkAcceptable({ status: InvitationStatus.PENDING, expiresAt: PAST }, NOW)).toBe(
            'expired',
        );
    });

    it('exactly at expires_at → still acceptable (inclusive end-of-window)', () => {
        expect(
            checkAcceptable({ status: InvitationStatus.PENDING, expiresAt: NOW }, NOW),
        ).toBeNull();
    });

    it('accepted → "already_accepted"', () => {
        expect(checkAcceptable({ status: InvitationStatus.ACCEPTED, expiresAt: FUTURE }, NOW)).toBe(
            'already_accepted',
        );
    });

    it('revoked → "revoked" (even if not expired)', () => {
        expect(checkAcceptable({ status: InvitationStatus.REVOKED, expiresAt: FUTURE }, NOW)).toBe(
            'revoked',
        );
    });

    it('expired status (already flipped) → "expired"', () => {
        expect(checkAcceptable({ status: InvitationStatus.EXPIRED, expiresAt: FUTURE }, NOW)).toBe(
            'expired',
        );
    });

    it('revoked status preempts time check (revoke wins over natural expiry)', () => {
        expect(checkAcceptable({ status: InvitationStatus.REVOKED, expiresAt: PAST }, NOW)).toBe(
            'revoked',
        );
    });

    it('accepted status preempts time check (terminal regardless of clock)', () => {
        expect(checkAcceptable({ status: InvitationStatus.ACCEPTED, expiresAt: PAST }, NOW)).toBe(
            'already_accepted',
        );
    });
});

describe('checkRevocable', () => {
    it('pending → null (revocable)', () => {
        expect(checkRevocable({ status: InvitationStatus.PENDING })).toBeNull();
    });

    it('accepted → "not_pending"', () => {
        expect(checkRevocable({ status: InvitationStatus.ACCEPTED })).toBe('not_pending');
    });

    it('revoked → "not_pending" (cannot re-revoke)', () => {
        expect(checkRevocable({ status: InvitationStatus.REVOKED })).toBe('not_pending');
    });

    it('expired → "not_pending"', () => {
        expect(checkRevocable({ status: InvitationStatus.EXPIRED })).toBe('not_pending');
    });
});

describe('isEmailMatch', () => {
    it('case-insensitive match', () => {
        expect(isEmailMatch('alice@example.com', 'ALICE@example.com')).toBe(true);
    });

    it('trims whitespace on both sides', () => {
        expect(isEmailMatch('  alice@example.com  ', 'alice@example.com\n')).toBe(true);
    });

    it('rejects different emails', () => {
        expect(isEmailMatch('alice@example.com', 'bob@example.com')).toBe(false);
    });

    it('rejects null caller email', () => {
        expect(isEmailMatch('alice@example.com', null)).toBe(false);
    });

    it('rejects empty caller email', () => {
        expect(isEmailMatch('alice@example.com', '')).toBe(false);
    });
});
