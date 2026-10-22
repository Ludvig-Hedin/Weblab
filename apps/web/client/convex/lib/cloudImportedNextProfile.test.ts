import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    assertImportedNextPins, IMPORTED_BUN_ARCHIVE_SHA256, validateImportedNextProfile,
    type ImportedNextFile, type ImportedNextPolicy,
} from './cloudImportedNextProfile';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
const pkg = {
    name: 'client-site', version: '0.1.0', private: true, packageManager: 'bun@1.3.11',
    scripts: { dev: 'next dev', build: 'next build --webpack', prepare: 'node scripts/prepare.js' },
    dependencies: { next: '16.3.1', react: '19.2.8' },
    devDependencies: { '@tailwindcss/postcss': '^4.1.14' },
    trustedDependencies: ['sharp'],
};
function lockfile() {
    return {
        lockfileVersion: 1, configVersion: 1,
        workspaces: { '': { name: pkg.name, dependencies: { ...pkg.dependencies }, devDependencies: { ...pkg.devDependencies } } },
        trustedDependencies: ['sharp'],
        packages: {
            next: ['next@16.3.1', '', { optionalDependencies: { '@next/swc-linux-x64-gnu': '16.3.1', sharp: '^0.35.3' }, bin: { next: 'dist/bin/next' } }, integrity],
            react: ['react@19.2.8', '', {}, integrity],
            '@tailwindcss/postcss': ['@tailwindcss/postcss@4.3.3', '', {}, integrity],
            '@next/swc-linux-x64-gnu': ['@next/swc-linux-x64-gnu@16.3.1', '', { os: 'linux', cpu: 'x64' }, integrity],
            sharp: ['sharp@0.35.3', '', { optionalDependencies: { '@img/sharp-linux-x64': '0.35.3' } }, integrity],
            '@img/sharp-linux-x64': ['@img/sharp-linux-x64@0.35.3', '', { os: 'linux', cpu: 'x64' }, integrity],
            '@tool/parser': ['@tool/parser@1.0.0', '', { bin: './bin/parser.js' }, integrity],
            '@tool/wasm/@tool/runtime': ['@tool/runtime@1.2.0', '', { bundled: true, peerDependencies: { react: '^18.0.0 || ^19.0.0' }, optionalPeers: ['react'] }, integrity],
        } satisfies Record<string, unknown[]>,
    };
}
function text(path: string, value: string): ImportedNextFile {
    return { path, kind: 'file', text: value, bytes: Buffer.byteLength(value), hash: hash(value) };
}
function source(): ImportedNextFile[] {
    // JSONC comments and trailing commas match the text Bun lock format.
    const lock = `// Frozen dependency graph\n${JSON.stringify(lockfile(), null, 2).replace(/\n}$/, ',\n}')}`;
    return [
        text('package.json', JSON.stringify(pkg)), text('bun.lock', lock),
        text('bunfig.toml', '[install]\nexact = true\n\n[test]\nroot = "./tests"\n'),
        text('next.config.ts', 'import type { NextConfig } from "next";\nconst nextConfig: NextConfig = { poweredByHeader: false, turbopack: { root: process.cwd() } };\nexport default nextConfig;\n'),
        text('tsconfig.json', '{"compilerOptions":{"strict":true}}'),
        text('postcss.config.mjs', 'export default { plugins: { "@tailwindcss/postcss": {} } };'),
        text('public/weblab-preload-script.js', '// Trusted deployment supplies this bundle\n'),
        text('public/weblab-ix-runtime.js', '// Trusted deployment supplies this runtime\n'),
        text('src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'),
        text('src/app/page.tsx', 'export default function Page() { return <main>Source</main>; }'),
        text('src/components/heading.tsx', 'export function Heading() { return <p>Hello</p>; }'),
        text('.env.example', 'NEXT_PUBLIC_API_URL=\n'),
        { path: 'public/movie.mp4', kind: 'file', storageId: 'owned-media', bytes: 22_695_161, hash: 'a'.repeat(64) },
    ];
}
function replace(files: ImportedNextFile[], path: string, value: string): ImportedNextFile[] {
    return files.map(file => file.path === path ? text(path, value) : file);
}
function withPackage(value: unknown): ImportedNextFile[] { return replace(source(), 'package.json', JSON.stringify(value)); }
function withLock(value: unknown): ImportedNextFile[] { return replace(source(), 'bun.lock', JSON.stringify(value)); }

describe('prepared imported Next runtime policy', () => {
    it('preserves a locked Next application and generates canonical sorted pins without executing source', () => {
        const files = source(), before = JSON.stringify(files);
        const policy = validateImportedNextProfile(files);
        expect(policy).toMatchObject({
            kind: 'next-app-bun-v1', node: 'node24', bun: '1.3.11', next: '16.3.1',
            dev: 'next-dev', build: 'next-build-webpack', install: 'frozen-ignore-scripts',
            bunArchiveSha256: IMPORTED_BUN_ARCHIVE_SHA256,
        });
        const { policyHash, ...body } = policy;
        expect(policyHash).toBe(hash(JSON.stringify(body)));
        expect(validateImportedNextProfile([...files].reverse())).toEqual(policy);
        expect(policy.pinnedFiles.map(file => file.path)).toEqual([
            '.env.example', 'bun.lock', 'bunfig.toml', 'next.config.ts', 'package.json',
            'postcss.config.mjs', 'public/weblab-ix-runtime.js', 'public/weblab-preload-script.js',
            'src/app/layout.tsx', 'tsconfig.json',
        ]);
        expect(JSON.stringify(files)).toBe(before);
        expect(() => assertImportedNextPins(files, policy)).not.toThrow();
    });

    it('supports the root App Router and an absent optional bunfig without inventing config', () => {
        const files = source().filter(file => file.path !== 'bunfig.toml')
            .map(file => file.path.startsWith('src/app/') ? { ...file, path: file.path.slice(4) } : file);
        expect(validateImportedNextProfile(files).pinnedFiles.some(file => file.path === 'app/layout.tsx')).toBe(true);
    });

    it('requires the exact package manager, Next version and direct dev/build command forms', () => {
        for (const patch of [
            { packageManager: 'bun@1.3.10' },
            { scripts: { ...pkg.scripts, dev: 'bun run prepare && next dev' } },
            { scripts: { ...pkg.scripts, build: 'next build' } },
            { dependencies: { ...pkg.dependencies, next: '^16.3.1' } },
        ]) expect(() => validateImportedNextProfile(withPackage({ ...pkg, ...patch }))).toThrow('CLOUD_IMPORT_RUNTIME_INVALID');
        const lock = lockfile(); lock.packages.next[0] = 'next@16.3.2';
        expect(() => validateImportedNextProfile(withLock(lock))).toThrow();
    });

    it('rejects duplicate JSON keys and all executable JSONC forms instead of evaluating them', () => {
        const duplicatePackage = JSON.stringify(pkg).replace('"private":true', '"private":true,"private":false');
        expect(() => validateImportedNextProfile(replace(source(), 'package.json', duplicatePackage))).toThrow();
        for (const lock of [
            '{"lockfileVersion": 1, "lockfileVersion": 1}',
            '{"a": globalThis.process.exit(1)}', '{"a": (function(){return 1})()}',
            '{"a": `template`}', '{"a": undefined}', '{"a": 0x1}',
            '{"a": [1,,2]}', '{...{"a": 1}}', '{["a"]: 1}',
            '{get "a"(){return 1}}', '{"__proto__": {}}', '{unquoted: 1}',
            '{"a": "\\x41"}',
            "{'single': 1}", '{"a": 1}); throw new Error("executed"); ({"b": 2}',
        ]) expect(() => validateImportedNextProfile(replace(source(), 'bun.lock', lock))).toThrow('CLOUD_IMPORT_RUNTIME_INVALID');
    });

    it('requires exactly one lock root and exact dependency maps', () => {
        const mismatch = lockfile(); mismatch.workspaces[''].dependencies.react = '19.2.7';
        expect(() => validateImportedNextProfile(withLock(mismatch))).toThrow();
        const version = lockfile(); version.configVersion = 0;
        expect(() => validateImportedNextProfile(withLock(version))).toThrow();
        const extra = lockfile();
        expect(() => validateImportedNextProfile(withLock({ ...extra, workspaces: { ...extra.workspaces, nested: extra.workspaces[''] } }))).toThrow();
        const missing = lockfile(); Reflect.deleteProperty(missing.packages, 'react');
        expect(() => validateImportedNextProfile(withLock(missing))).toThrow();
        expect(() => validateImportedNextProfile(withLock({ ...lockfile(), trustedDependencies: [] }))).toThrow();
    });

    it('rejects remote, local and alias dependencies in both declared and transitive references', () => {
        for (const range of ['file:../pkg', 'link:../pkg', 'workspace:*', 'npm:other@1.0.0', 'git+https://example.test/repo', 'https://example.test/pkg.tgz', 'owner/repo', '../pkg']) {
            expect(() => validateImportedNextProfile(withPackage({ ...pkg, dependencies: { ...pkg.dependencies, react: range } }))).toThrow();
            const lock = lockfile();
            lock.packages.react = ['react@19.2.8', '', { dependencies: { child: range } }, integrity];
            expect(() => validateImportedNextProfile(withLock(lock))).toThrow();
        }
    });

    it('requires every resolved registry tuple and canonical sha512 integrity, including nested packages', () => {
        for (const entry of [
            ['react@19.2.8', 'https://example.test/react.tgz', {}, integrity],
            ['git+https://example.test/react', '', {}, integrity],
            ['other@19.2.8', '', {}, integrity],
            ['react@latest', '', {}, integrity], ['react@19.2.8', '', {}],
            ['react@19.2.8', '', {}, `sha256-${'a'.repeat(64)}`],
            ['react@19.2.8', '', {}, 'sha512-invalid'],
            ['react@19.2.8', '', { resolutions: {} }, integrity],
            ['react@19.2.8', '', { bin: '../../escape' }, integrity],
        ]) {
            const lock = lockfile(); lock.packages.react = entry;
            expect(() => validateImportedNextProfile(withLock(lock))).toThrow();
        }
    });

    it('rejects workspace, override and registry settings without rewriting inert scripts', () => {
        for (const key of ['workspaces', 'overrides', 'resolutions', 'catalogs', 'patchedDependencies', 'installConfig', 'pnpm']) {
            expect(() => validateImportedNextProfile(withPackage({ ...pkg, [key]: {} }))).toThrow();
        }
        for (const config of [
            '[install]\nregistry = "https://example.test"', '[install]\nignoreScripts = false',
            '[install.scopes]\nteam = "https://example.test"', '[test]\npreload = ["./setup.ts"]',
            '[install]\nexact = true\nexact = false', '[install]\nexact = true\n[install]\nexact = true',
        ]) expect(() => validateImportedNextProfile(replace(source(), 'bunfig.toml', config))).toThrow();
    });

    it('rejects alternate or nested runtime/config inventory and missing required pins', () => {
        for (const path of [
            '.npmrc', '.yarnrc.yml', '.babelrc', '.browserslistrc', '.pnp.cjs', 'yarn.lock',
            'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'npm-shrinkwrap.json',
            'next.config.js', 'webpack.config.js', 'postcss.config.js', 'tsconfig.build.json',
            'src/package.json', 'nested/bunfig.toml', 'src/next.config.ts',
        ]) expect(() => validateImportedNextProfile([...source(), text(path, '{}')])).toThrow();
        for (const path of ['bun.lock', 'package.json', 'next.config.ts', 'tsconfig.json', 'public/weblab-preload-script.js', 'public/weblab-ix-runtime.js', 'src/app/layout.tsx']) {
            expect(() => validateImportedNextProfile(source().filter(file => file.path !== path))).toThrow();
        }
        expect(() => validateImportedNextProfile([...source(), text('pages/index.tsx', 'export default () => null')])).toThrow();
        expect(() => validateImportedNextProfile([...source(), text('app/page.tsx', 'export default () => null')])).toThrow();
    });

    it('checks all source paths, text byte/hash identities and existing secret scans', () => {
        for (const path of ['../escape', '.env', '.git/config', 'node_modules/a.js']) {
            expect(() => validateImportedNextProfile([...source(), text(path, 'source')])).toThrow();
        }
        for (const value of ['\ud800', `ghp_${'x'.repeat(30)}`]) {
            expect(() => validateImportedNextProfile([...source(), text('src/secret.ts', value)])).toThrow('CLOUD_IMPORT_RUNTIME_INVALID');
        }
        const changed = source(); changed[0] = { ...changed[0]!, hash: '0'.repeat(64) };
        expect(() => validateImportedNextProfile(changed)).toThrow();
        expect(() => validateImportedNextProfile([...source(), text('src', 'collision')])).toThrow();
        expect(() => validateImportedNextProfile([...source(), source()[0]!])).toThrow();
    });

    it('enforces 400 files, 750k text, 4 MB inline, 32 MiB media and 64 MiB total', () => {
        expect(() => validateImportedNextProfile([...source(), ...Array.from({ length: 400 }, (_, index) => text(`source/${index}.txt`, ''))])).toThrow();
        expect(() => validateImportedNextProfile([...source(), text('source/large.txt', 'a'.repeat(750_001))])).toThrow();
        expect(() => validateImportedNextProfile([...source(), ...Array.from({ length: 6 }, (_, index) => text(`source/${index}.txt`, 'a'.repeat(700_000)))])).toThrow();
        const binary = source().find(file => file.storageId)!;
        expect(() => validateImportedNextProfile([...source(), { ...binary, path: 'public/too-large.mp4', bytes: 32 * 1024 * 1024 + 1 }])).toThrow();
        const files = source().filter(file => !file.storageId);
        expect(() => validateImportedNextProfile([...files,
            { ...binary, bytes: 32 * 1024 * 1024 }, { ...binary, path: 'public/second.mp4', bytes: 32 * 1024 * 1024 },
        ])).toThrow();
    });

    it('allows changed ordinary source but rejects changed, new, missing or forged runtime pins', () => {
        const files = source(), policy = validateImportedNextProfile(files);
        expect(() => assertImportedNextPins(replace(files, 'src/components/heading.tsx', 'export function Heading() { return <p>Saved</p>; }'), policy)).not.toThrow();
        for (const pin of policy.pinnedFiles) {
            const original = files.find(file => file.path === pin.path)!;
            expect(() => assertImportedNextPins(replace(files, pin.path, `${original.text}\n`), policy)).toThrow('CLOUD_IMPORT_RUNTIME_PINS_CHANGED');
            expect(() => assertImportedNextPins(files.filter(file => file.path !== pin.path), policy)).toThrow('CLOUD_IMPORT_RUNTIME_PINS_CHANGED');
        }
        expect(() => assertImportedNextPins([...files, text('eslint.config.mjs', 'export default [];')], policy)).toThrow('CLOUD_IMPORT_RUNTIME_PINS_CHANGED');
        for (const patch of [{ bun: '1.3.10' }, { policyHash: '0'.repeat(64) }, { extra: true }, { pinnedFiles: [] }]) {
            expect(() => assertImportedNextPins(files, { ...policy, ...patch } as ImportedNextPolicy)).toThrow('CLOUD_IMPORT_RUNTIME_PINS_CHANGED');
        }
    });
});
