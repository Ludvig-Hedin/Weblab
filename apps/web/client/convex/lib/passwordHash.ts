// PBKDF2-SHA256 password hashing using Web Crypto API. Mirrors
// apps/web/client/src/server/api/routers/page-access/hash.ts so the same
// algorithm runs in published Edge-runtime middleware (which has
// crypto.subtle but not Node's crypto.scrypt).
//
// Storage format: `pbkdf2$<iterations>$<saltB64>$<hashB64>`.
//
// Safe to import from default (V8) Convex runtime — no Node APIs.

const ITERATIONS = 100_000;
const SALT_LENGTH_BYTES = 16;
const HASH_LENGTH_BYTES = 32;
const PREFIX = 'pbkdf2';

const toBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const derive = async (
    password: string,
    salt: Uint8Array,
    iterations: number,
): Promise<Uint8Array> => {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
        keyMaterial,
        HASH_LENGTH_BYTES * 8,
    );
    return new Uint8Array(bits);
};

export const hashPassword = async (password: string): Promise<string> => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
    const hash = await derive(password, salt, ITERATIONS);
    return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== PREFIX) return false;
    const iterations = Number.parseInt(parts[1] ?? '', 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const salt = fromBase64(parts[2] ?? '');
    const expected = fromBase64(parts[3] ?? '');
    const actual = await derive(password, salt, iterations);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) {
        diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
    }
    return diff === 0;
};
