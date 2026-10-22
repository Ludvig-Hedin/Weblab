import { describe, expect, it } from 'bun:test';
import { WEBLAB_DEV_IX_RUNTIME_PATH, WEBLAB_DEV_PRELOAD_SCRIPT_PATH } from '@weblab/constants';
import { planNextProjectPreparation } from '@weblab/parser/src/project-preparation';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import type { Id } from '../_generated/dataModel';
import { prepareImportedNextConfig, prepareImportedNextDeclarations } from './cloudImportedNextConfig';
import { validateImportedNextProfile } from './cloudImportedNextProfile';
import { importedInventoryHash, type ImportedSnapshotFile } from './cloudImportedRelease';
import { importedMediaManifestHash } from './cloudImportedMedia';
import { prepareImportedReleaseArtifact } from './cloudImportedReleaseArtifact';
import { manifestHash, sha256 } from './cloudReleaseArtifact';
import { prepareImportedHostingCandidate, type ImportedHostingInput } from './cloudImportedHosting';
import { assertImportedHostingSeal } from './cloudImportedHostingState';

const originalNextConfig = `import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false, devIndicators: false,
  turbopack: { root: process.cwd() },
  images: { formats: ["image/avif", "image/webp"], qualities: [40, 75, 85, 100] },
  async headers() { return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" }
  ] }]; }
};
export default nextConfig;`;
const originalTsConfig = JSON.stringify({ compilerOptions: {
    target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: false, skipLibCheck: true, strict: true,
    noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true,
    isolatedModules: true, jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }],
    paths: { '@/*': ['./src/*'] }, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, types: ['bun'],
}, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'], exclude: ['node_modules', '_*.ts', '_reference'] });
const declarations = ['/// <reference types="next" />', '/// <reference types="next/image-types/global" />',
    'import "./.next/types/routes.d.ts";', 'import "./.next/types/root-params.d.ts";', '',
    '// NOTE: This file should not be edited', '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.', ''].join('\n');
const text = (path: string, value: string): ImportedSnapshotFile => ({ path, kind: 'file', text: value, hash: sha256(value), bytes: Buffer.byteLength(value) });

/** Genuine preparation and private derivation; storage descriptors here are synthetic, not blob proof. */
async function fixture(overrides: Record<string, string> = {}, packageOverrides: Record<string, unknown> = {}): Promise<ImportedHostingInput> {
    const dependencies = { next: '16.3.1', react: '19.2.8' };
    const devDependencies = { '@tailwindcss/postcss': '^4.1.14', tailwindcss: '^4.1.14', typescript: '^5.9.2' };
    const pkg = { name: 'hosting-test', private: true, packageManager: 'bun@1.3.11', dependencies, devDependencies,
        engines: { node: '>=20.9.0', bun: '>=1.2.0' },
        scripts: { dev: 'next dev', build: 'next build --webpack', prepare: 'node scripts/do-not-run.js' }, ...packageOverrides };
    const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
    const lock = { lockfileVersion: 1, configVersion: 1, workspaces: { '': { name: pkg.name, dependencies, devDependencies } },
        packages: Object.fromEntries([['next', '16.3.1'], ['react', '19.2.8'], ['@tailwindcss/postcss', '4.3.3'],
            ['tailwindcss', '4.3.3'], ['typescript', '5.9.3']].map(([name, version]) => [name, [`${name}@${version}`, '', {}, integrity]])) };
    const originals: Record<string, string> = {
        'package.json': JSON.stringify(pkg), 'bun.lock': JSON.stringify(lock), 'next.config.ts': originalNextConfig,
        'tsconfig.json': originalTsConfig, 'next-env.d.ts': declarations,
        'postcss.config.mjs': 'const postcssConfig = { plugins: { "@tailwindcss/postcss": {} } };\nexport default postcssConfig;',
        'bunfig.toml': '[install]\nexact = true\n\n[test]\nroot = "./tests"\n',
        'src/app/layout.tsx': 'import "./globals.css"; export default function Layout({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }',
        'src/app/page.tsx': 'export default function Page() { return <main>Actual customer page shape</main>; }',
        'src/app/globals.css': '@import "tailwindcss"; @font-face { font-family: Customer; src: url("/fonts/customer.woff2"); }',
        'scripts/do-not-run.js': 'throw new Error("Customer lifecycle script must remain inert");',
        ...overrides,
    };
    const original = Object.entries(originals).map(([path, value]) => text(path, value));
    original.push({ path: 'public/movie.mp4', kind: 'file', storageId: 'owned-movie', bytes: 22_695_161, hash: 'a'.repeat(64) });
    original.push({ path: 'public/fonts/customer.woff2', kind: 'file', storageId: 'owned-font', bytes: 128_000, hash: 'b'.repeat(64) });
    const plan = await planNextProjectPreparation({ files: original.flatMap(file => file.text === undefined ? [] : [{ path: file.path, text: file.text }]),
        layoutPath: 'src/app/layout.tsx', assets: [{ path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH, text: '// Weblab stale domId lookup blocked:\nvoid 0;' },
            { path: WEBLAB_DEV_IX_RUNTIME_PATH, text: 'void 0;' }] });
    for (const path of ['next.config.ts', 'next-env.d.ts']) {
        const before = originals[path]!;
        const updated = path === 'next.config.ts' ? await prepareImportedNextConfig(before) : prepareImportedNextDeclarations(before);
        if (before !== updated) plan.files.push({ path, original: before, updated, addedOids: [], bootstrapChanges: path === 'next.config.ts' });
    }
    const sourceMap = new Map(original.map(file => [file.path, file]));
    for (const file of plan.files) sourceMap.set(file.path, text(file.path, file.updated));
    const source = [...sourceMap.values()], originalManifestHash = await importedInventoryHash(original);
    const metadata: ImportedReleaseMetadata = { version: 1, capturedRevision: 2, originalManifestHash,
        preparation: { inputRevision: 1, preparedRevision: 2, inputManifestHash: originalManifestHash,
            preparedManifestHash: await importedInventoryHash(source), policy: validateImportedNextProfile(source),
            instrumentation: plan.files.map(file => ({ path: file.path, beforeHash: original.find(before => before.path === file.path)?.hash ?? null,
                afterHash: sha256(file.updated), addedOids: file.addedOids, bootstrapChanges: file.bootstrapChanges })) } };
    const sealed = await prepareImportedReleaseArtifact({ purpose: 'private-artifact', source, original, metadata });
    return { source, original, metadata, actorId: 'users:authorized-colleague', visibility: 'protected-only',
        artifact: { id: 'cloudReleases:historical', purpose: 'private-artifact', hash: sealed.hash, artifactJson: sealed.artifactJson,
            projectId: 'projects:one', branchId: 'branches:one', workspaceId: 'workspaces:one', revision: 2 } };
}

describe('imported hosting candidate planner', () => {
    it('accepts the real Stilta original config shape without changing its private artifact or media', async () => {
        const input = await fixture(), before = JSON.stringify(input);
        const result = await prepareImportedHostingCandidate(input);
        expect(JSON.stringify(input)).toBe(before);
        expect(result.files.find(file => file.path === 'next.config.ts')?.text).toBe(originalNextConfig);
        expect(input.source.find(file => file.path === 'next.config.ts')?.text).toContain('allowedDevOrigins');
        expect(result.files.some(file => file.path === WEBLAB_DEV_PRELOAD_SCRIPT_PATH || file.path === WEBLAB_DEV_IX_RUNTIME_PATH)).toBe(false);
        expect(result.files.find(file => file.path === 'public/movie.mp4')).toEqual(input.original.find(file => file.path === 'public/movie.mp4'));
        expect(result.importedHosting.artifactHash).toBe(input.artifact.hash);
        expect(result.importedHosting.deployHash).toBe(manifestHash(result.files));
        expect(result.hash).not.toBe(result.importedHosting.deployHash);
        expect(JSON.parse(input.artifact.artifactJson).publicEligible).toBe(false);
        expect(result.candidate.actorId).toBe('users:authorized-colleague');
        await assertImportedHostingSeal(result);
    });

    it('canonicalizes ordering and binds desired build inputs without claiming provider verification', async () => {
        const input = await fixture(), result = await prepareImportedHostingCandidate(input);
        const reversed = await prepareImportedHostingCandidate({ ...input, source: [...input.source].reverse(), original: [...input.original].reverse() });
        expect(reversed).toEqual(result);
        expect(result.buildPolicyReceipt.plugins.map(plugin => [plugin.name, plugin.version])).toEqual([
            ['@tailwindcss/postcss', '4.3.3'], ['next', '16.3.1'], ['tailwindcss', '4.3.3'], ['typescript', '5.9.3'],
        ]);
        expect(result.importedHosting.buildPolicyHash).toBe(sha256(result.buildPolicyJson));
        expect(result.buildPolicyJson).not.toContain('providerVerified');
        expect(result.files.find(file => file.path === 'scripts/do-not-run.js')?.text).toContain('must remain inert');
    });

    it('refuses missing genuine prepared bridges and changed sealed artifact facts', async () => {
        const input = await fixture();
        await expect(prepareImportedHostingCandidate({ ...input, source: input.source.filter(file => file.path !== WEBLAB_DEV_PRELOAD_SCRIPT_PATH) })).rejects.toThrow();
        await expect(prepareImportedHostingCandidate({ ...input, artifact: { ...input.artifact, artifactJson: input.artifact.artifactJson + '\n' } })).rejects.toThrow('ARTIFACT_MISMATCH');
        await expect(prepareImportedHostingCandidate({ ...input, artifact: { ...input.artifact, hash: 'e'.repeat(64) } })).rejects.toThrow('ARTIFACT_MISMATCH');
        await expect(prepareImportedHostingCandidate({ ...input, artifact: { ...input.artifact, revision: 3 } })).rejects.toThrow('ARTIFACT_MISMATCH');
        const original = input.original.map(file => file.path === 'next.config.ts' ? text(file.path, file.text! + '\n') : file);
        await expect(prepareImportedHostingCandidate({ ...input, original })).rejects.toThrow();
    });

    it('changes candidate identity for another actor or mode without making either an access grant', async () => {
        const input = await fixture(), result = await prepareImportedHostingCandidate(input);
        expect((await prepareImportedHostingCandidate({ ...input, actorId: 'users:second-colleague' })).hash).not.toBe(result.hash);
        await expect(prepareImportedHostingCandidate({ ...input, visibility: 'publishable' })).rejects.toThrow('ARTIFACT_MISMATCH');
    });

    it('preserves only the admitted runtime declarations without treating them as provider proof', async () => {
        for (const engines of [undefined, {}, { node: '24.x' }, { bun: '1.3.11' }, { node: '>=20.9.0', bun: '>=1.2.0' }]) {
            const input = await fixture({}, { engines }), result = await prepareImportedHostingCandidate(input);
            expect(result.files.find(file => file.path === 'package.json')?.text).toBe(input.original.find(file => file.path === 'package.json')?.text);
            expect(result.buildPolicyReceipt.toolchain.node).toBe('24.x');
        }
        for (const engines of [null, [], '24.x', { node: '22.x' }, { node: '>=18' }, { node: '24.x\n' },
            { bun: '1.3.10' }, { npm: '10.x' }, { node: '24.x', npm: '10.x' }]) {
            const input = await fixture({}, { engines });
            await expect(prepareImportedHostingCandidate(input)).rejects.toThrow('UNSUPPORTED_CONFIG');
        }
    });

    it('rejects all competing PostCSS rc files after genuine artifact preparation', async () => {
        for (const path of ['.postcssrc', '.postcssrc.json', '.postcssrc.js', '.postcssrc.cjs', '.postcssrc.mjs',
            '.postcssrc.yaml', 'nested/.postcssrc.json', 'nested/.POSTCSSRC.JS']) {
            const input = await fixture({ [path]: path.toLowerCase().endsWith('.js') ? 'module.exports = { plugins: { unapproved: {} } };' : '{"plugins":{"unapproved":{}}}' });
            expect(input.original.some(file => file.path === path)).toBe(true);
            await expect(prepareImportedHostingCandidate(input)).rejects.toThrow('UNSUPPORTED_CONFIG');
        }
    });

    it('retains a genuine version 2 artifact without rewriting its existing descriptor', async () => {
        const input = await fixture();
        const hash = sha256('normalized WebP');
        const asset = { path: `public/weblab-upload-${hash}.webp`, hash, bytes: 14, storageId: 'owned-upload' as Id<'_storage'>,
            mime: 'image/webp' as const, width: 1600, height: 900 };
        const source: ImportedSnapshotFile[] = [...input.source, { path: asset.path, hash, bytes: asset.bytes, storageId: asset.storageId,
            kind: 'file', media: { version: 1, asset, origin: { version: 1, kind: 'upload', actorId: 'users:uploader' as Id<'users'>,
                attemptId: 'attempt' as Id<'cloudEditorContentImageAttempts'>, operationId: 'image_upload_operation_1', sourceRevision: 3,
                approval: { ownerPath: 'src/content/about.ts', bindingId: 'hero', generation: 1, designRevision: 2, fingerprint: 'd'.repeat(64) } } } }];
        const metadata: ImportedReleaseMetadata = { ...input.metadata, version: 2, capturedRevision: 3, mediaManifestHash: await importedMediaManifestHash(source) };
        const privateArtifact = await prepareImportedReleaseArtifact({ ...input, source, purpose: 'private-artifact', metadata });
        const artifact = { ...input.artifact, revision: 3, hash: privateArtifact.hash, artifactJson: privateArtifact.artifactJson };
        const result = await prepareImportedHostingCandidate({ ...input, source, metadata, artifact });
        expect(result.importedHosting.artifactHash).toBe(privateArtifact.hash);
        expect(result.files).toEqual(privateArtifact.files);
        expect(result.files.find(file => file.path === asset.path)).toEqual({ path: asset.path, kind: 'file', storageId: asset.storageId, hash, bytes: asset.bytes });
        expect(JSON.parse(privateArtifact.artifactJson)).toMatchObject({ version: 2, publicEligible: false });
    });

    for (const [name, overrides] of Object.entries({
        'Vercel override': { 'vercel.json': '{"buildCommand":"echo override"}' },
        'server route': { 'src/app/api/customer/route.ts': 'export function GET() { return new Response("hello"); }' },
        'proxy entry': { 'src/proxy.ts': 'export function proxy() {}' },
        'arbitrary config call': { 'next.config.ts': originalNextConfig.replace('poweredByHeader: false', 'poweredByHeader: globalThis.markExecuted()') },
        'environment config': { 'next.config.ts': originalNextConfig.replace('poweredByHeader: false', 'poweredByHeader: process.env.FLAG') },
        'rewrite hook': { 'next.config.ts': originalNextConfig.replace('poweredByHeader: false', 'rewrites: async () => [], poweredByHeader: false') },
        'header side effect': { 'next.config.ts': originalNextConfig.replace('async headers() { return', 'async headers() { globalThis.markExecuted(); return') },
        'cookie response header': { 'next.config.ts': originalNextConfig.replace('X-Robots-Tag', 'Set-Cookie') },
        'computed config key': { 'next.config.ts': originalNextConfig.replace('poweredByHeader:', '["poweredByHeader"]:') },
        'spread config': { 'next.config.ts': originalNextConfig.replace('poweredByHeader: false', '...{}, poweredByHeader: false') },
        'runtime config import': { 'next.config.ts': 'import "./scripts/do-not-run.js";\n' + originalNextConfig },
        'shadowed process config binding': { 'next.config.ts': 'const process = { turbopack: { root: process.cwd() } }; export default process;' },
        'other PostCSS plugin': { 'postcss.config.mjs': 'export default { plugins: { "arbitrary-plugin": {} } };' },
        'PostCSS import': { 'postcss.config.mjs': 'import plugin from "@tailwindcss/postcss"; export default { plugins: { plugin } };' },
        'compiler extension': { 'tsconfig.json': '{"extends":"./elsewhere.json","compilerOptions":{"strict":true}}' },
        'compiler plugin': { 'tsconfig.json': '{"compilerOptions":{"plugins":[{"name":"arbitrary-plugin"}]}}' },
        'CSS build plugin': { 'src/app/globals.css': '@plugin "arbitrary-plugin";' },
        'escaped CSS build plugin': { 'src/app/globals.css': '@pl\\75gin "arbitrary-plugin";' },
    })) it(`refuses ${name} without executing imported code`, async () => {
        await expect((async () => prepareImportedHostingCandidate(await fixture(overrides)))()).rejects.toThrow();
    });
});


describe('public source to frozen publishable candidate pairing', () => {
    it('prepares public source only as publishable and never promotes private source', async () => {
        const input = await fixture(), privateBefore = JSON.stringify(input);
        await expect(prepareImportedHostingCandidate({ ...input, visibility: 'publishable' })).rejects.toThrow('ARTIFACT_MISMATCH');
        const publicSource = await prepareImportedReleaseArtifact({ ...input, purpose: 'release', publicationIntent: 'eligible-public-version' });
        const eligible: ImportedHostingInput = { ...input, visibility: 'publishable', artifact: { ...input.artifact,
            purpose: 'release', hash: publicSource.hash, artifactJson: publicSource.artifactJson } };
        const result = await prepareImportedHostingCandidate(eligible);
        expect(result.files).toEqual(publicSource.files); expect(result.importedHosting.visibility).toBe('publishable');
        expect(result.importedHosting.artifactHash).toBe(publicSource.hash);
        await assertImportedHostingSeal(result);
        await expect(prepareImportedHostingCandidate({ ...eligible, visibility: 'protected-only' })).rejects.toThrow('ARTIFACT_MISMATCH');
        await expect(prepareImportedHostingCandidate({ ...input, visibility: 'publishable', artifact: { ...input.artifact, purpose: 'release' } })).rejects.toThrow('ARTIFACT_MISMATCH');
        expect(JSON.stringify(input)).toBe(privateBefore);
    });
});
