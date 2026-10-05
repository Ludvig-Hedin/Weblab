const { describe, test, expect } = require('bun:test');
const { releasePathAllowed, freezeFiles, assertSourceOnlyRelease } = require('./policy');

const base = () => [
    { path: 'package.json', bytes: Buffer.from(JSON.stringify({ dependencies: { next: '16.2.6', tailwindcss: '4.1.0' } })) },
    { path: 'bun.lock', bytes: Buffer.from('locked dependencies') },
    { path: 'src/app/page.tsx', bytes: Buffer.from('export default function Page() { return <h1>Hello</h1> }') },
];

describe('publication snapshot policy', () => {
    test('private/generated/traversal paths cannot enter a release', () => {
        for (const path of ['.env', '.env.production', 'a/.env.example', '.npmrc', '.ssh/config', 'credentials/google.json', 'service-account.json', 'public/private.key', '../page.tsx', '/page.tsx', 'a\\b', '.next/server/page.js', 'db.sqlite']) {
            expect(releasePathAllowed(path)).toBe(false);
        }
        expect(releasePathAllowed('public/photo.webp')).toBe(true);
        expect(releasePathAllowed('src/app/page.tsx')).toBe(true);
    });

    test('snapshot bytes are copied and hashes do not depend on enumeration order', () => {
        const input = base();
        const first = freezeFiles(input);
        expect(freezeFiles([...input].reverse()).hash).toBe(first.hash);
        input[2].bytes.fill(0);
        expect(first.files.find((file) => file.path === 'src/app/page.tsx').bytes.toString()).toContain('Hello');
        expect(freezeFiles(input).hash).not.toBe(first.hash);
    });

    test('locks and the supported framework are required', () => {
        expect(() => freezeFiles(base().filter((file) => file.path !== 'bun.lock'))).toThrow('lockfile');
        const input = base();
        input[0].bytes = Buffer.from('{"dependencies":{"next":"16"}}');
        expect(() => freezeFiles(input)).toThrow('Tailwind');
    });

    test('project configuration cannot bypass reviewed environment or domains', () => {
        for (const key of ['alias', 'env', 'build', 'builds', 'installCommand', 'outputDirectory']) {
            expect(() => freezeFiles([...base(), { path: 'vercel.json', bytes: Buffer.from(JSON.stringify({ [key]: {} })) }])).toThrow('Unsupported');
        }
        expect(() => freezeFiles([...base(), { path: 'vercel.json', bytes: Buffer.from('{"headers":[]}') }])).not.toThrow();
        expect(() => freezeFiles([...base(), { path: 'vercel.json', bytes: Buffer.from('{"framework":"nextjs"}') }])).not.toThrow();
        for (const framework of ['vite', null, false, {}, 'Nextjs']) {
            expect(() => freezeFiles([...base(), { path: 'vercel.json', bytes: Buffer.from(JSON.stringify({ framework })) }])).toThrow('Unsupported');
        }
    });

    test('embedded private keys and duplicate paths refuse publication', () => {
        expect(() => freezeFiles([...base(), { path: 'src/config.ts', bytes: Buffer.from('-----BEGIN PRIVATE KEY-----') }])).toThrow('embedded secret');
        expect(() => freezeFiles([...base(), base()[2]])).toThrow('duplicate');
    });

    test('known Sanity content is derived from frozen manifests even without app CMS metadata', () => {
        expect(freezeFiles(base()).contentSources).toEqual([]);
        expect(() => assertSourceOnlyRelease(freezeFiles(base()))).not.toThrow();
        for (const name of ['sanity', 'next-sanity', '@sanity/client']) {
            const input = base();
            input[0].bytes = Buffer.from(JSON.stringify({ dependencies: { next: '16', tailwindcss: '4', [name]: 'latest' } }));
            const release = freezeFiles(input);
            expect(release.contentSources).toEqual(['sanity']);
            expect(() => assertSourceOnlyRelease({ ...release, cmsRequired: false })).toThrow('immutable content runtime');
        }
    });

    test('nested packages, optional SDKs and npm aliases cannot bypass content detection', () => {
        for (const dependencies of [{ optionalDependencies: { 'next-sanity': '^13' } },
            { dependencies: { cms: 'npm:@sanity/client@7' } }, { peerDependencies: { sanity: '6' } }]) {
            const release = freezeFiles([...base(), { path: 'packages/site/package.json', bytes: Buffer.from(JSON.stringify(dependencies)) }]);
            expect(() => assertSourceOnlyRelease(release)).toThrow('immutable content runtime');
        }
    });

    test('unknown included package manifests refuse rather than assuming there is no CMS', () => {
        for (const json of ['broken', 'null', '[]', '{"dependencies":null}', '{"dependencies":{"cms":false}}']) {
            expect(() => freezeFiles([...base(), { path: 'packages/site/package.json', bytes: Buffer.from(json) }])).toThrow();
        }
    });
});
