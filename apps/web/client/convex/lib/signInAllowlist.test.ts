import { afterEach, describe, expect, it } from 'bun:test';

import {
    isAllowedByConvexAllowlist,
    isEmailOnAllowlist,
    parseSignInAllowlist,
} from './signInAllowlist';

describe('parseSignInAllowlist', () => {
    it('returns an empty list for unset or blank input', () => {
        expect(parseSignInAllowlist(undefined)).toEqual([]);
        expect(parseSignInAllowlist('')).toEqual([]);
        expect(parseSignInAllowlist(' , ')).toEqual([]);
    });

    it('trims and lowercases each email', () => {
        expect(parseSignInAllowlist(' A@Example.com, b@example.com ')).toEqual([
            'a@example.com',
            'b@example.com',
        ]);
    });
});

describe('isEmailOnAllowlist', () => {
    const list = ['a@example.com'];

    it('matches case-insensitively', () => {
        expect(isEmailOnAllowlist('A@EXAMPLE.com', list)).toBe(true);
    });

    it('rejects missing and unknown emails', () => {
        expect(isEmailOnAllowlist(undefined, list)).toBe(false);
        expect(isEmailOnAllowlist('', list)).toBe(false);
        expect(isEmailOnAllowlist('b@example.com', list)).toBe(false);
    });
});

describe('isAllowedByConvexAllowlist', () => {
    const original = process.env.WEBLAB_SIGN_IN_ALLOWLIST;
    afterEach(() => {
        if (original === undefined) delete process.env.WEBLAB_SIGN_IN_ALLOWLIST;
        else process.env.WEBLAB_SIGN_IN_ALLOWLIST = original;
    });

    it('allows everyone when the env var is unset', () => {
        delete process.env.WEBLAB_SIGN_IN_ALLOWLIST;
        expect(isAllowedByConvexAllowlist('anyone@example.com')).toBe(true);
        expect(isAllowedByConvexAllowlist(undefined)).toBe(true);
    });

    it('allows only listed emails when set', () => {
        process.env.WEBLAB_SIGN_IN_ALLOWLIST = 'a@example.com';
        expect(isAllowedByConvexAllowlist('a@example.com')).toBe(true);
        expect(isAllowedByConvexAllowlist('b@example.com')).toBe(false);
        expect(isAllowedByConvexAllowlist(undefined)).toBe(false);
    });
});
