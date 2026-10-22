import { describe, expect, it } from 'bun:test';
import { hashImportBytes, reviewImportFolder } from './manifest';

function file(path: string, value: string | Uint8Array<ArrayBuffer> = ''): File {
    const result = new File([value], path.split('/').at(-1)!);
    Object.defineProperty(result, 'webkitRelativePath', { value: path }); return result;
}
function base() { return [file('site/package.json', '{"dependencies":{"next":"16.0.0"}}'), file('site/src/app/layout.tsx', 'export default function Layout() {}'), file('site/src/app/page.tsx', 'export default function Page() {}')]; }
const review = (files: File[]) => reviewImportFolder(files, new AbortController().signal);

describe('cloud folder manifest review', () => {
    it('preserves UTF-8 BOM, CRLF, Unicode and original media bytes in canonical order', async () => {
        const content = '\ufeff// Åäö 😀\r\nexport const title = "Hej";\r\n';
        const media = file('site/public/movie.mp4', new Uint8Array([1, 2, 3, 255]));
        const result = await review([...base().reverse(), media, file('site/src/text.ts', content)]);
        expect(result.problems).toEqual([]);
        expect(result.manifest?.files.map(file => file.path)).toEqual(['package.json', 'public/movie.mp4', 'src/app/layout.tsx', 'src/app/page.tsx', 'src/text.ts']);
        expect(result.manifest?.files.at(-1)?.text).toBe(content);
        expect(result.manifest?.files.at(-1)?.bytes).toBe(new TextEncoder().encode(content).length);
        expect(result.binaries.get('public/movie.mp4')).toBe(media);
        const tuples = result.manifest!.files.map(({ path, kind, bytes, hash }) => [path, kind, bytes, hash]);
        expect(result.manifest?.manifestHash).toBe(await hashImportBytes(new TextEncoder().encode(JSON.stringify(tuples))));
    });
    it('lists excluded private/generated files before reading them and permits only root .env.example', async () => {
        const excluded = ['.env', '.ENV.EXAMPLE', 'nested/.env.example', '.git/config', '.agents/config.json', '.railway/config.json', '.ssh/id_rsa', 'key.pem', 'local.sqlite'];
        const privateFiles = excluded.map(path => { const value = file(`site/${path}`, 'private'); value.arrayBuffer = async () => { throw new Error('Must not read excluded files'); }; return value; });
        const result = await review([...base(), ...privateFiles, file('site/.env.example', 'PUBLIC_ORIGIN=https://example.invalid\r\n')]);
        expect(result.problems).toEqual([]);
        expect(result.excluded.map(file => file.path)).toEqual(excluded);
        expect(result.manifest?.files.some(file => file.path === '.env.example')).toBe(true);
    });
    it('blocks secrets, invalid UTF-8, unknown types, archives and executable files with safe path/code only', async () => {
        for (const [path, value, code] of [
            ['src/private.ts', 'export const key = "sk_live_1234567890abcdef"', 'CLOUD_RELEASE_SECRET'],
            ['src/bad.ts', new Uint8Array([0xff]), 'CLOUD_IMPORT_INVALID_TEXT'],
            ['archive.zip', 'bytes', 'CLOUD_IMPORT_UNSUPPORTED_FILE'],
            ['program.exe', 'bytes', 'CLOUD_IMPORT_UNSUPPORTED_FILE'],
            ['unknown.custom', 'bytes', 'CLOUD_IMPORT_UNSUPPORTED_FILE'],
        ] as const) {
            const result = await review([...base(), file(`site/${path}`, value)]);
            expect(result.manifest).toBeNull(); expect(result.problems).toContainEqual({ path, code });
            expect(JSON.stringify(result.problems)).not.toContain('1234567890abcdef');
        }
    });
    it('keeps nested build routes and coverage media while excluding root outputs', async () => {
        const result = await review([...base(), file('site/src/app/build/page.tsx', 'route'), file('site/public/coverage/hero.webp', 'image'), file('site/build/generated.js', 'output')]);
        expect(result.problems).toEqual([]);
        expect(result.manifest?.files.map(file => file.path)).toContain('src/app/build/page.tsx');
        expect(result.manifest?.files.map(file => file.path)).toContain('public/coverage/hero.webp');
        expect(result.excluded).toContainEqual({ path: 'build/generated.js', reason: 'generated' });
    });
    it('refuses unsafe, absent, mixed and colliding selected directory paths', async () => {
        for (const path of ['plain.ts', '/site/a.ts', 'site/../a.ts', 'site/a\\b.ts', 'site/\ud800.ts', 'site//a.ts', 'C:/site/a.ts']) {
            await expect(review([...base(), file(path)])).rejects.toThrow('CLOUD_IMPORT_DIRECTORY_REQUIRED');
        }
        await expect(review([...base(), file('other/a.ts')])).rejects.toThrow('CLOUD_IMPORT_MIXED_ROOTS');
        await expect(review([...base(), file('site/package.json')])).rejects.toThrow('CLOUD_IMPORT_PATH_COLLISION');
        await expect(review([...base(), file('site/src'), file('site/src/a.ts')])).rejects.toThrow('CLOUD_IMPORT_PATH_COLLISION');
    });
    it('enforces per-file, total, file-count and inline limits before any attempt', async () => {
        let reads = 0;
        const sized = (path: string, size: number) => { const value = file(path); Object.defineProperty(value, 'size', { value: size }); value.arrayBuffer = async () => { reads++; throw new Error('Too large'); }; return value; };
        expect((await review([...base(), sized('site/public/large.mp4', 32 * 1024 * 1024 + 1)])).problems[0]?.code).toBe('CLOUD_IMPORT_ASSET_TOO_LARGE');
        expect((await review([...base(), sized('site/src/large.ts', 750_001)])).problems[0]?.code).toBe('CLOUD_IMPORT_TEXT_TOO_LARGE');
        expect((await review([...base(), ...[1, 2, 3].map(i => sized(`site/public/${i}.mp4`, 25 * 1024 * 1024))])).problems).toContainEqual({ path: '', code: 'CLOUD_IMPORT_TOO_LARGE' });
        expect(reads).toBe(0);
        expect((await review([...base(), ...Array.from({ length: 398 }, (_, i) => file(`site/src/${i}.ts`))])).problems).toContainEqual({ path: '', code: 'CLOUD_IMPORT_FILE_LIMIT' });
        expect((await review([...base(), file('site/src/large.ts', 'x'.repeat(700_000))])).problems).toContainEqual({ path: '', code: 'CLOUD_IMPORT_INLINE_TOO_LARGE' });
    });
    it('requires Next and an App Router tree, and stops between file reads on abort', async () => {
        expect((await review([file('site/package.json', '{}')])).problems).toContainEqual({ path: 'package.json', code: 'CLOUD_IMPORT_NEXT_REQUIRED' });
        const abort = new AbortController();
        await expect(reviewImportFolder(base(), abort.signal, () => abort.abort())).rejects.toThrow();
    });
});
