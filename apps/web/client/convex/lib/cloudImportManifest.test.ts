import { describe, expect, it } from 'bun:test';
import {
    assertContentCloudProfile, assertExecutableCloudProfile, assertReleaseCloudProfile, IMPORT_CHUNK_BYTES, IMPORT_PREPARED_PROFILE, IMPORT_SOURCE_PROFILE,
    importSourcePath, MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_BYTES, MAX_IMPORT_INLINE_BYTES,
    sourceProfileCapabilities, validateCloudImportManifest,
    type CloudImportFile,
} from './cloudImportManifest';

const encoder = new TextEncoder();
const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
async function digest(value: string): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function textFile(path: string, text: string): Promise<CloudImportFile> {
    return { path, kind: 'text', bytes: encoder.encode(text).byteLength, hash: await digest(text), text };
}
function binaryFile(path: string, bytes = 23 * 1024 * 1024): CloudImportFile {
    // Manifest-only declaration. Actual binary bytes must be verified at upload.
    return { path, kind: 'binary', bytes, hash: 'a'.repeat(64) };
}

describe('imported source manifest policy', () => {
    it('accepts a representative source-only project with large assets and inert repository tooling', async () => {
        const files = [
            await textFile('package.json', '{"scripts":{"dev":"next dev"}}'),
            await textFile('.env.example', 'NEXT_PUBLIC_API_URL=\nSTRIPE_SECRET_KEY=\n'),
            await textFile('.githooks/pre-commit', '#!/bin/sh\necho inert hook\n'),
            await textFile('.github/workflows/build.yml', 'name: build\n'),
            await textFile('src/app/page.tsx', 'export default () => <p>Hej 👋</p>;\r\n'),
            binaryFile('files/original-photo.jpg'),
            binaryFile('public/film.mp4', 24 * 1024 * 1024),
        ];
        const result = await validateCloudImportManifest(files);
        expect(result.bytes).toBe(files.reduce((total, file) => total + file.bytes, 0));
        expect(result.files.find(file => file.path === 'files/original-photo.jpg')?.bytes).toBe(23 * 1024 * 1024);
        expect(result.files.find(file => file.path === 'src/app/page.tsx')?.text).toBe(files[4]?.text);
        expect(sourceProfileCapabilities(IMPORT_SOURCE_PROFILE)).toEqual({ sourceWrite: false, contentWrite: false, preview: false, release: false, imported: true });
        expect(IMPORT_CHUNK_BYTES).toBe(512 * 1024);
    });

    it('allows only the exact root env example and rejects credential, generated and private paths', () => {
        expect(importSourcePath('.env.example')).toBe('.env.example');
        for (const path of [
            '.env', '.env.local', '.env.example.local', '.ENV.EXAMPLE', 'nested/.env.example',
            '.git/config', 'nested/.git', 'node_modules/pkg/index.js', 'nested/node_modules/file', '.next/server.js',
            '.vercel/project.json', '.railway/config.json', '.ssh/id_rsa', '.aws/credentials',
            '.codex/config', '.claude/settings.json', '.agents/instructions', '.DS_Store', 'files/.DS_Store',
            'private.pem', 'private.key', 'private.sqlite3',
        ]) expect(() => importSourcePath(path)).toThrow();
        for (const path of ['.github/workflows/build.yml', '.githooks/pre-commit', 'files/photo.png', 'src/environment.ts']) {
            expect(importSourcePath(path)).toBe(path);
        }
    });

    it('requires canonical relative paths and valid Unicode metadata', async () => {
        for (const path of [
            '', '/src/a.ts', '//host/file', 'C:/file', 'c:file', 'src\\a.ts', 'src//a.ts', 'src/./a.ts',
            'src/../a.ts', '../a.ts', 'src/a.ts/', 'src/\u0000a.ts', 'src/\u007fa.ts', 'src/\u0085a.ts',
            'src/\ud800.ts', 'src/\udc00.ts', 'a'.repeat(241),
        ]) {
            await expect(validateCloudImportManifest([{ ...binaryFile('placeholder', 0), path }])).rejects.toThrow();
        }
        expect(importSourcePath('src/åäö-👋.tsx')).toBe('src/åäö-👋.tsx');
    });

    it('scans every text including the env example for secrets while allowing mere references', async () => {
        const references = 'STRIPE_SECRET_KEY=\nGITHUB_TOKEN=your_token_here\nconst key = process.env.STRIPE_SECRET_KEY;';
        await validateCloudImportManifest([await textFile('.env.example', references)]);
        for (const text of [
            '-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN OPENSSH PRIVATE KEY-----',
            `AKIA${'A'.repeat(16)}`, `sk_live_${'a'.repeat(20)}`, `sk_test_${'a'.repeat(20)}`,
            `sk-ant-${'a'.repeat(20)}`, `sk-proj-${'a'.repeat(20)}`, `ghp_${'a'.repeat(30)}`, `github_pat_${'a'.repeat(30)}`,
        ]) {
            for (const path of ['src/config.ts', '.env.example']) {
                await expect(validateCloudImportManifest([await textFile(path, text)])).rejects.toThrow('CLOUD_RELEASE_SECRET');
            }
        }
    });

    it('rejects duplicate and file/ancestor collisions regardless of order or file kind', async () => {
        for (const paths of [['file', 'file'], ['files', 'files/photo.jpg'], ['src/file.ts/deep', 'src/file.ts']]) {
            await expect(validateCloudImportManifest(paths.map(path => binaryFile(path, 0)))).rejects.toThrow('CLOUD_IMPORT_PATH_COLLISION');
            await expect(validateCloudImportManifest([...paths].reverse().map(path => binaryFile(path, 0)))).rejects.toThrow('CLOUD_IMPORT_PATH_COLLISION');
        }
        const sibling = await validateCloudImportManifest([binaryFile('src/file.ts', 0), binaryFile('src/file.tsx', 0)]);
        expect(sibling.files).toHaveLength(2);
    });

    it('requires exact UTF-8 bytes and hash, lowercase hashes, strict text and no binary text', async () => {
        const valid = await textFile('src/text.ts', 'å👋\r\n');
        expect(valid.bytes).toBe(8);
        for (const patch of [
            { bytes: 7 }, { hash: 'a'.repeat(64) }, { hash: valid.hash.toUpperCase() },
            { hash: 'short' }, { bytes: NaN }, { bytes: Infinity }, { bytes: -1 }, { bytes: 0.5 },
            { bytes: Number.MAX_SAFE_INTEGER + 1 }, { text: undefined },
        ]) await expect(validateCloudImportManifest([{ ...valid, ...patch }])).rejects.toThrow();
        for (const text of ['\ud800', '\udc00', 'ok\ud800after']) {
            await expect(validateCloudImportManifest([await textFile('source.txt', text)])).rejects.toThrow('CLOUD_IMPORT_INVALID_TEXT');
        }
        for (const text of ['', undefined]) {
            await expect(validateCloudImportManifest([{ ...binaryFile('file.bin', 0), text }])).rejects.toThrow('CLOUD_IMPORT_INVALID_MANIFEST');
        }
        await expect(validateCloudImportManifest([{ ...valid, text: 1 } as unknown as CloudImportFile])).rejects.toThrow('CLOUD_IMPORT_INVALID_TEXT');
        await expect(validateCloudImportManifest([{ ...valid, kind: 'directory' } as unknown as CloudImportFile])).rejects.toThrow('CLOUD_IMPORT_INVALID_MANIFEST');
    });

    it('enforces file count, per-asset, total decoded bytes and encoded inline limits', async () => {
        await expect(validateCloudImportManifest([])).rejects.toThrow('CLOUD_IMPORT_INVALID_MANIFEST');
        const many = Array.from({ length: 401 }, (_, index) => binaryFile(`files/${index}.bin`, 0));
        await expect(validateCloudImportManifest(many)).rejects.toThrow('CLOUD_IMPORT_INVALID_MANIFEST');
        expect((await validateCloudImportManifest(many.slice(0, 400))).files).toHaveLength(400);
        await expect(validateCloudImportManifest([binaryFile('large.bin', MAX_IMPORT_ASSET_BYTES + 1)])).rejects.toThrow('CLOUD_IMPORT_ASSET_TOO_LARGE');
        expect((await validateCloudImportManifest([binaryFile('one.bin', MAX_IMPORT_ASSET_BYTES), binaryFile('two.bin', MAX_IMPORT_ASSET_BYTES)])).bytes).toBe(MAX_IMPORT_BYTES);
        await expect(validateCloudImportManifest([binaryFile('one.bin', MAX_IMPORT_ASSET_BYTES), binaryFile('two.bin', MAX_IMPORT_ASSET_BYTES), binaryFile('three.bin', 1)])).rejects.toThrow('CLOUD_IMPORT_TOO_LARGE');
        await expect(validateCloudImportManifest([{ path: 'large.txt', kind: 'text', bytes: 750_001, hash: emptyHash, text: '' }])).rejects.toThrow('CLOUD_IMPORT_TEXT_TOO_LARGE');
        const escaped = await textFile('quoted.txt', '"'.repeat(MAX_IMPORT_INLINE_BYTES / 2));
        expect(escaped.bytes).toBeLessThan(MAX_IMPORT_INLINE_BYTES);
        await expect(validateCloudImportManifest([escaped])).rejects.toThrow('CLOUD_IMPORT_INLINE_TOO_LARGE');
        const half = 'a'.repeat(350_000);
        await expect(validateCloudImportManifest([await textFile('a.txt', half), await textFile('b.txt', half)])).rejects.toThrow('CLOUD_IMPORT_INLINE_TOO_LARGE');
        expect((await validateCloudImportManifest([await textFile('fits.txt', 'a'.repeat(699_000))])).files).toHaveLength(1);
    });

    it('rejects unbounded extra metadata instead of silently removing it from the measured input', async () => {
        const file = { ...binaryFile('file.bin', 0), extra: 'not part of the manifest contract' };
        await expect(validateCloudImportManifest([file])).rejects.toThrow('CLOUD_IMPORT_INVALID_MANIFEST');
    });

    it('hashes sorted canonical tuples deterministically and returns copies without changing input', async () => {
        const a = await textFile('a.txt', 'abc');
        expect(a.hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        const z = binaryFile('z.bin', 10);
        const files = [z, a];
        const before = structuredClone(files);
        const result = await validateCloudImportManifest(files);
        const reversed = await validateCloudImportManifest([a, z]);
        expect(result.manifestHash).toBe(reversed.manifestHash);
        expect(result.manifestHash).toBe(await digest(JSON.stringify([
            ['a.txt', 'text', a.bytes, a.hash], ['z.bin', 'binary', z.bytes, z.hash],
        ])));
        expect(files).toEqual(before);
        expect(result.files).not.toBe(files);
        expect(result.files[0]).not.toBe(a);
        expect(result.files[0]?.text).toBe('abc');
        result.files[0]!.text = 'changed output';
        expect(a.text).toBe('abc');
        const changed = await validateCloudImportManifest([a, { ...z, bytes: 11 }]);
        expect(changed.manifestHash).not.toBe(result.manifestHash);
    });
});

describe('source profile execution boundary', () => {
    it('retains starter capability, keeps unprepared imports inert and refuses unknown profiles', () => {
        for (const profile of [undefined, 'starter-v1']) {
            expect(sourceProfileCapabilities(profile)).toEqual({ sourceWrite: true, contentWrite: true, preview: true, release: true, imported: false });
            expect(() => assertExecutableCloudProfile(profile)).not.toThrow();
        }
        expect(() => assertExecutableCloudProfile(IMPORT_SOURCE_PROFILE)).toThrow('CLOUD_IMPORT_SOURCE_ONLY');
        expect(sourceProfileCapabilities(IMPORT_PREPARED_PROFILE)).toEqual({ sourceWrite: true, contentWrite: false, preview: true, release: false, imported: true });
        expect(() => assertExecutableCloudProfile(IMPORT_PREPARED_PROFILE)).not.toThrow();
        expect(() => assertContentCloudProfile(IMPORT_PREPARED_PROFILE)).toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        expect(() => assertReleaseCloudProfile(IMPORT_PREPARED_PROFILE)).toThrow('CLOUD_RELEASE_PROFILE_UNSUPPORTED');
        for (const profile of ['', 'imported-source-v2', 'unknown']) {
            expect(sourceProfileCapabilities(profile)).toEqual({ sourceWrite: false, contentWrite: false, preview: false, release: false, imported: false });
            expect(() => assertExecutableCloudProfile(profile)).toThrow('CLOUD_PROFILE_UNSUPPORTED');
        }
    });
});
