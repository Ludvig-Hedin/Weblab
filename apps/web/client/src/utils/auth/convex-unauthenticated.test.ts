import { describe, expect, it } from 'bun:test';

import { isConvexUnauthenticatedError } from './convex-unauthenticated';

describe('isConvexUnauthenticatedError', () => {
    it('matches the app-level UNAUTHORIZED guard, wrapped the way Convex relays it', () => {
        expect(
            isConvexUnauthenticatedError(
                new Error(
                    '[CONVEX Q(usage:get)] [Request ID: abc123] Server Error\n' +
                        'Uncaught Error: UNAUTHORIZED\n' +
                        '    at requireUser (../convex/lib/permissions.ts:44:14)',
                ),
            ),
        ).toBe(true);
    });

    it('matches the Convex runtime token rejection (Unauthenticated / OIDC)', () => {
        expect(isConvexUnauthenticatedError(new Error('Unauthenticated'))).toBe(true);
        expect(isConvexUnauthenticatedError(new Error('Could not verify OIDC token claim'))).toBe(
            true,
        );
    });

    it('matches a bare string and ConvexError-shaped payloads', () => {
        expect(isConvexUnauthenticatedError('UNAUTHORIZED')).toBe(true);
        expect(isConvexUnauthenticatedError({ data: 'UNAUTHORIZED' })).toBe(true);
        expect(isConvexUnauthenticatedError({ code: 'Unauthenticated' })).toBe(true);
        expect(isConvexUnauthenticatedError({ code: 'UNAUTHORIZED' })).toBe(true);
    });

    it('does NOT match unrelated errors (avoids bouncing real crashes to /sign-in)', () => {
        expect(isConvexUnauthenticatedError(null)).toBe(false);
        expect(isConvexUnauthenticatedError(undefined)).toBe(false);
        expect(isConvexUnauthenticatedError(new Error('Network request failed'))).toBe(false);
        expect(isConvexUnauthenticatedError(new Error('NOT_FOUND'))).toBe(false);
        // "authorization" / "authorized" must not trip the UNAUTHORIZED word match.
        expect(isConvexUnauthenticatedError(new Error('authorization pending'))).toBe(false);
        expect(isConvexUnauthenticatedError({ code: 'NOT_FOUND' })).toBe(false);
    });
});
