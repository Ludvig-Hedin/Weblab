import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE helpers (RFC 7636). Generates a S256 verifier/challenge pair we use
 * for every provider's OAuth start. The verifier rides along in an
 * HTTP-only cookie until the callback hits.
 */

function base64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateVerifier(): string {
    return base64url(randomBytes(32));
}

export function deriveChallenge(verifier: string): string {
    return base64url(createHash('sha256').update(verifier).digest());
}

export function generateState(): string {
    return base64url(randomBytes(16));
}
