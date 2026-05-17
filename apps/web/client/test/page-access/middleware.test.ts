import { describe, expect, test } from 'bun:test';

import {
    ACCESS_MIDDLEWARE_MARKER,
    generateAccessMiddleware,
    isWeblabGeneratedMiddleware,
} from '../../src/server/api/routers/publish/helpers/access-middleware';
import {
    hashPassword,
    verifyPassword,
} from '../../src/server/api/routers/page-access/hash';

describe('generateAccessMiddleware', () => {
    test('returns null when there are no protected pages', () => {
        expect(generateAccessMiddleware([])).toBeNull();
        expect(
            generateAccessMiddleware([{ pagePath: '', passwordHash: '' }]),
        ).toBeNull();
    });

    test('emits Weblab marker, protected paths, and matcher entries', () => {
        const source = generateAccessMiddleware([
            { pagePath: '/about', passwordHash: 'pbkdf2$100000$saltA$hashA' },
            { pagePath: '/blog/post', passwordHash: 'pbkdf2$100000$saltB$hashB' },
        ]);
        expect(source).not.toBeNull();
        const code = source as string;
        expect(code).toContain(ACCESS_MIDDLEWARE_MARKER);
        expect(code).toContain('"/about"');
        expect(code).toContain('"/blog/post"');
        expect(code).toContain('pbkdf2$100000$saltA$hashA');
        expect(code).toContain('pbkdf2$100000$saltB$hashB');
        expect(code).toContain('export async function middleware(');
        expect(code).toContain('matcher: [');
    });

    test('deduplicates and sorts protected pages for stable output', () => {
        const sourceA = generateAccessMiddleware([
            { pagePath: '/b', passwordHash: 'pbkdf2$1$x$y' },
            { pagePath: '/a', passwordHash: 'pbkdf2$1$x$y' },
            { pagePath: '/a', passwordHash: 'pbkdf2$1$x$y' },
        ]);
        const sourceB = generateAccessMiddleware([
            { pagePath: '/a', passwordHash: 'pbkdf2$1$x$y' },
            { pagePath: '/b', passwordHash: 'pbkdf2$1$x$y' },
        ]);
        expect(sourceA).toBe(sourceB);
        // Two entries, "/a" comes before "/b".
        const code = sourceA as string;
        expect(code.indexOf('"/a"')).toBeLessThan(code.indexOf('"/b"'));
    });
});

describe('isWeblabGeneratedMiddleware', () => {
    test('detects the marker header', () => {
        expect(
            isWeblabGeneratedMiddleware(`/* ${ACCESS_MIDDLEWARE_MARKER} */\nexport {};\n`),
        ).toBe(true);
    });

    test('returns false for user-authored middleware', () => {
        expect(
            isWeblabGeneratedMiddleware(
                "import { NextResponse } from 'next/server';\nexport function middleware() { return NextResponse.next(); }\n",
            ),
        ).toBe(false);
    });
});

describe('hashPassword / verifyPassword', () => {
    test('round-trips a correct password', async () => {
        const stored = await hashPassword('hunter2');
        expect(stored.startsWith('pbkdf2$')).toBe(true);
        expect(await verifyPassword('hunter2', stored)).toBe(true);
    });

    test('rejects incorrect passwords', async () => {
        const stored = await hashPassword('hunter2');
        expect(await verifyPassword('hunter3', stored)).toBe(false);
        expect(await verifyPassword('', stored)).toBe(false);
    });

    test('rejects malformed stored hashes', async () => {
        expect(await verifyPassword('anything', '')).toBe(false);
        expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
        expect(await verifyPassword('anything', 'argon2$100$x$y')).toBe(false);
    });
});
