import { describe, expect, it } from 'bun:test';

import {
    CreateFlowInvalidInputError,
    CreateFlowNotAuthenticatedError,
    isInvalidInputError,
    isNotAuthenticatedError,
} from './manager';

describe('isNotAuthenticatedError', () => {
    it('matches the typed sentinel error', () => {
        expect(isNotAuthenticatedError(new CreateFlowNotAuthenticatedError())).toBe(true);
    });

    it('does NOT match a plain Error sharing the same message — collision-proof', () => {
        // Without the typed subclass, a string-based sentinel would
        // misclassify this as "needs auth modal". `instanceof` matches
        // identity, not text.
        expect(isNotAuthenticatedError(new Error('NOT_AUTHENTICATED'))).toBe(false);
    });

    it('rejects unrelated error shapes', () => {
        expect(isNotAuthenticatedError(new Error('Network failed'))).toBe(false);
        expect(isNotAuthenticatedError(new TypeError('bad arg'))).toBe(false);
    });

    it('rejects non-Error values without throwing', () => {
        expect(isNotAuthenticatedError(null)).toBe(false);
        expect(isNotAuthenticatedError(undefined)).toBe(false);
        expect(isNotAuthenticatedError('NOT_AUTHENTICATED')).toBe(false);
        expect(isNotAuthenticatedError({ message: 'NOT_AUTHENTICATED' })).toBe(false);
        expect(isNotAuthenticatedError(42)).toBe(false);
    });

    it('preserves the sentinel error name for stack traces', () => {
        const err = new CreateFlowNotAuthenticatedError();
        expect(err.name).toBe('CreateFlowNotAuthenticatedError');
        expect(err.message).toBe('NOT_AUTHENTICATED');
    });

    it('does NOT match a CreateFlowInvalidInputError — distinct sentinels', () => {
        expect(isNotAuthenticatedError(new CreateFlowInvalidInputError('private repo'))).toBe(
            false,
        );
    });
});

describe('isInvalidInputError', () => {
    it('matches the typed sentinel error', () => {
        expect(isInvalidInputError(new CreateFlowInvalidInputError('private repo'))).toBe(true);
    });

    it('preserves the supplied user-facing message', () => {
        const err = new CreateFlowInvalidInputError('Cannot use subpath with pre-seeded sandbox.');
        expect(err.name).toBe('CreateFlowInvalidInputError');
        expect(err.message).toBe('Cannot use subpath with pre-seeded sandbox.');
    });

    it('rejects auth-error sentinel and unrelated values', () => {
        expect(isInvalidInputError(new CreateFlowNotAuthenticatedError())).toBe(false);
        expect(isInvalidInputError(new Error('private repo'))).toBe(false);
        expect(isInvalidInputError(null)).toBe(false);
        expect(isInvalidInputError({ message: 'private repo' })).toBe(false);
    });
});
