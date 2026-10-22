import { describe, expect, it } from 'bun:test';
import { EditorAttributes, WEBLAB_DEV_IX_RUNTIME_PATH, WEBLAB_DEV_PRELOAD_SCRIPT_PATH, WEBLAB_PRELOAD_SCRIPT_SRC } from '@weblab/constants';
import { planNextProjectPreparation } from '@weblab/parser/src/project-preparation';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import type { Doc, Id } from '../_generated/dataModel';
import { prepareImportedNextConfig, prepareImportedNextDeclarations } from './cloudImportedNextConfig';
import { validateImportedNextProfile, type ImportedNextFile } from './cloudImportedNextProfile';
import { IMPORTED_PUBLICATION_INTENT, importedArtifactProfile, captureImportedStudioConfig, deriveImportedPrivateFiles, importedInventoryHash, snapshotCanonicalJson, validateImportedReleaseSnapshot, validateImportedSeal, type ImportedSnapshotFile } from './cloudImportedRelease';
import { importedMediaManifestHash } from './cloudImportedMedia';
import { prepareImportedReleaseArtifact } from './cloudImportedReleaseArtifact';
import { manifestHash, sha256 } from './cloudReleaseArtifact';
import { prepareImportedStudioOperation } from './cloudImportedStudio';
import { IMPORTED_STUDIO_CONFIG_PATH, IMPORTED_STUDIO_PAGE_PATH, IMPORTED_STUDIO_BLOCK_PATH } from './cloudImportedStudioState';

const layoutPath = 'src/app/layout.tsx';
const pagePath = 'src/app/page.tsx';
const assets = [
    { path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH, text: '// Weblab stale domId lookup blocked:\nvoid 0;' },
    { path: WEBLAB_DEV_IX_RUNTIME_PATH, text: 'void 0;' },
];
const declarations = [
    '/// <reference types="next" />', '/// <reference types="next/image-types/global" />',
    'import "./.next/types/routes.d.ts";', 'import "./.next/types/root-params.d.ts";', '',
    '// NOTE: This file should not be edited',
    '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.', '',
].join('\r\n');
function text(path: string, content: string): ImportedNextFile {
    return { path, kind: 'file', text: content, bytes: Buffer.byteLength(content), hash: sha256(content) };
}
function originals(): ImportedNextFile[] {
    const dependencies = { next: '16.3.1', react: '19.2.8' };
    const pkg = { name: 'customer-site', private: true, packageManager: 'bun@1.3.11', dependencies,
        scripts: { dev: 'next dev', build: 'next build --webpack', prepare: 'node scripts/prepare.js' } };
    const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
    const lock = { lockfileVersion: 1, configVersion: 1, workspaces: { '': { name: pkg.name, dependencies } },
        packages: { next: ['next@16.3.1', '', {}, integrity], react: ['react@19.2.8', '', {}, integrity] } };
    return [
        text('package.json', JSON.stringify(pkg)), text('bun.lock', JSON.stringify(lock)),
        text('tsconfig.json', '{"compilerOptions":{"strict":true}}'),
        text('next.config.ts', 'import type { NextConfig } from "next";\nconst config: NextConfig = { poweredByHeader: false };\nexport default config;\n'),
        text('next-env.d.ts', declarations), text('.env.example', 'NEXT_PUBLIC_BOOKING_URL=\n'),
        text(layoutPath, 'import "./globals.css";\n// Authored comment stays byte exact.\nexport default function Layout({children}: {children: React.ReactNode}) { return <html lang="sv"><body>{children}</body></html>; }\n'),
        text(pagePath, 'export default function Page() { return <main>Original copy</main>; }\n'),
        text('src/app/globals.css', '@font-face { font-family: Customer; src: url("/fonts/customer.woff2"); }\nmain { white-space: pre-line; }\n'),
        text('src/lib/integrations.ts', 'export const integrations = { booking: "https://booking.example.test", careers: "https://jobs.example.test" };\n'),
        text('scripts/prepare.js', 'throw new Error("Customer scripts must never execute in a materializer");\n'),
        { path: 'public/movie.mp4', kind: 'file', bytes: 22_695_161, hash: 'a'.repeat(64), storageId: 'owned-movie' },
        { path: 'public/fonts/customer.woff2', kind: 'file', bytes: 128_000, hash: 'b'.repeat(64), storageId: 'owned-font' },
        { path: 'public/coverage/hero.webp', kind: 'file', bytes: 50_000, hash: 'c'.repeat(64), storageId: 'owned-hero' },
    ];
}

/** The fixture follows the actual preparation pipeline; customer source is never evaluated. */
async function fixture(original = originals()) {
    const plan = await planNextProjectPreparation({
        files: original.flatMap(file => file.text === undefined ? [] : [{ path: file.path, text: file.text }]),
        layoutPath, assets,
    });
    for (const path of ['next.config.ts', 'next-env.d.ts']) {
        const before = original.find(file => file.path === path)!.text!;
        const updated = path === 'next.config.ts' ? await prepareImportedNextConfig(before) : prepareImportedNextDeclarations(before);
        if (before !== updated) plan.files.push({ path, original: before, updated, addedOids: [], bootstrapChanges: path === 'next.config.ts' });
    }
    const sourceMap = new Map(original.map(file => [file.path, file]));
    for (const file of plan.files) sourceMap.set(file.path, text(file.path, file.updated));
    const source = [...sourceMap.values()];
    const originalManifestHash = await importedInventoryHash(original);
    const metadata: ImportedReleaseMetadata = { version: 1, capturedRevision: 2, originalManifestHash,
        preparation: { inputRevision: 1, preparedRevision: 2, inputManifestHash: originalManifestHash,
            preparedManifestHash: await importedInventoryHash(source), policy: validateImportedNextProfile(source),
            instrumentation: plan.files.map(file => ({ path: file.path,
                beforeHash: original.find(before => before.path === file.path)?.hash ?? null,
                afterHash: sha256(file.updated), addedOids: file.addedOids, bootstrapChanges: file.bootstrapChanges })) } };
    return { purpose: 'private-artifact' as const, source, original, metadata };
}

function sourceRelease(input: { metadata: ImportedReleaseMetadata }, purpose: 'backup' | 'private-artifact' | 'release'): Doc<'cloudReleases'> {
    return { purpose, revision: input.metadata.capturedRevision, imported: input.metadata,
        artifactProfile: importedArtifactProfile(input.metadata, purpose),
        ...(purpose === 'release' ? { publicationIntent: IMPORTED_PUBLICATION_INTENT } : {}) } as Doc<'cloudReleases'>;
}

describe('imported private artifact materializer', () => {
    it('restores only receipt-proven preparation files and retains current authored bytes and all media', async () => {
        const input = await fixture();
        input.metadata.capturedRevision = 3;
        input.source = input.source.map(file => file.path === pagePath
            ? text(pagePath, file.text!.replace('Original copy', 'Saved customer edit')) : file);
        const before = JSON.stringify(input);
        const result = await prepareImportedReleaseArtifact(input);
        const byPath = new Map(result.files.map(file => [file.path, file]));
        for (const path of [layoutPath, 'next.config.ts', 'next-env.d.ts']) {
            expect(byPath.get(path)).toEqual(input.original.find(file => file.path === path));
        }
        for (const file of input.source.filter(file => ![layoutPath, 'next.config.ts', 'next-env.d.ts', ...assets.map(asset => asset.path)].includes(file.path))) {
            expect(byPath.get(file.path)).toEqual(file);
        }
        expect(byPath.has(WEBLAB_DEV_PRELOAD_SCRIPT_PATH)).toBe(false);
        expect(byPath.has(WEBLAB_DEV_IX_RUNTIME_PATH)).toBe(false);
        expect(byPath.get(pagePath)!.text).toContain('Saved customer edit');
        expect(byPath.get(pagePath)!.text).toContain(EditorAttributes.DATA_WEBLAB_ID);
        expect(result.sourceHash).toBe(manifestHash(input.source));
        expect(result.originalHash).toBe(await importedInventoryHash(input.original));
        expect(JSON.stringify(input)).toBe(before);
        const descriptor = JSON.parse(result.artifactJson);
        expect(descriptor).toMatchObject({ artifactProfile: 'imported-next-private-v1', purpose: 'private-artifact',
            publicEligible: false, derivationVersion: 1, metadata: input.metadata, deployHash: manifestHash(result.files) });
        expect(descriptor.derivation).toHaveLength(5);
        expect(result.hash).toBe(sha256(result.artifactJson));
    });

    it('is independent of input file ordering and does not alias returned file objects', async () => {
        const input = await fixture();
        const first = await prepareImportedReleaseArtifact(input);
        expect(await prepareImportedReleaseArtifact({ ...input, source: [...input.source].reverse(), original: [...input.original].reverse() })).toEqual(first);
        first.files.find(file => file.path === pagePath)!.text = 'Changed result';
        expect(input.source.find(file => file.path === pagePath)!.text).not.toBe('Changed result');
    });

    it('preserves leading UTF-8 BOM bytes in restored and unchanged customer files', async () => {
        const paths = [layoutPath, 'src/app/globals.css'];
        const input = await fixture(originals().map(file => paths.includes(file.path)
            ? text(file.path, `\uFEFF${file.text}`) : file));
        const before = JSON.stringify(input);
        const artifact = await prepareImportedReleaseArtifact(input);
        const backup = await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' });
        for (const path of paths) {
            const original = input.original.find(file => file.path === path)!;
            const restored = artifact.files.find(file => file.path === path)!;
            expect(restored).toEqual(original);
            expect(Buffer.from(restored.text!).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
            expect(restored.bytes).toBe(Buffer.byteLength(restored.text!));
            expect(restored.hash).toBe(sha256(restored.text!));
        }
        expect(backup.files).toEqual([]);
        expect(backup.sourceHash).toBe(manifestHash(input.source));
        expect(backup.originalHash).toBe(await importedInventoryHash(input.original));
        expect(JSON.stringify(input)).toBe(before);
    });

    it('seals backups without a deploy stage and binds purpose and captured revision', async () => {
        const input = await fixture();
        const artifact = await prepareImportedReleaseArtifact(input);
        const backup = await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' });
        expect(backup.files).toEqual([]);
        expect(JSON.parse(backup.artifactJson)).toMatchObject({ purpose: 'backup', publicEligible: false, deployHash: null, derivation: [] });
        expect(backup.sourceHash).toBe(artifact.sourceHash);
        expect(backup.originalHash).toBe(artifact.originalHash);
        expect(backup.hash).not.toBe(artifact.hash);
        input.metadata.capturedRevision++;
        expect((await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' })).hash).not.toBe(backup.hash);
    });

    it('retains already-dev declarations without inventing a restoration receipt', async () => {
        const input = await fixture(originals().map(file => file.path === 'next-env.d.ts'
            ? text(file.path, prepareImportedNextDeclarations(file.text!)) : file));
        expect(input.metadata.preparation.instrumentation.some(row => row.path === 'next-env.d.ts')).toBe(false);
        const output = await prepareImportedReleaseArtifact(input);
        expect(output.files.find(file => file.path === 'next-env.d.ts')).toEqual(input.original.find(file => file.path === 'next-env.d.ts'));
    });

    it('allows a retained backup with preexisting editor assets but refuses to remove customer-owned files', async () => {
        const input = await fixture([...originals(), ...assets.map(file => text(file.path, file.text))]);
        expect((await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' })).files).toEqual([]);
        await expect(prepareImportedReleaseArtifact(input)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it('does not restore a layout containing an older bridge into a private artifact', async () => {
        const input = await fixture(originals().map(file => file.path === layoutPath
            ? text(file.path, `import Script from "next/script";\n${file.text!.replace('{children}</body>', `{children}<Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" /></body>`)}`) : file));
        expect((await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' })).files).toEqual([]);
        await expect(prepareImportedReleaseArtifact(input)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it.each([layoutPath, 'next.config.ts', 'next-env.d.ts', ...assets.map(file => file.path)])('requires the exact restoration/removal receipt for %s', async path => {
        const input = await fixture();
        input.metadata.preparation.instrumentation = input.metadata.preparation.instrumentation.filter(row => row.path !== path);
        await expect(prepareImportedReleaseArtifact(input)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it('rejects altered receipt hashes even when the current policy pins still match', async () => {
        const input = await fixture();
        input.metadata.preparation.instrumentation.find(row => row.path === 'next.config.ts')!.afterHash = 'f'.repeat(64);
        await expect(prepareImportedReleaseArtifact(input)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it('refuses forged nonpinned preparation output at the exact prepared revision, including backups', async () => {
        const input = await fixture();
        input.metadata.preparation.instrumentation.find(row => row.path === pagePath)!.afterHash = 'f'.repeat(64);
        await expect(prepareImportedReleaseArtifact({ ...input, purpose: 'backup' })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it('refuses forged pinned preparation output after later source edits, including backups', async () => {
        const input = await fixture();
        input.metadata.capturedRevision++;
        input.metadata.preparation.instrumentation.find(row => row.path === layoutPath)!.afterHash = 'f'.repeat(64);
        await expect(prepareImportedReleaseArtifact({ ...input, purpose: 'backup' })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it.each(['missing-media', 'altered-text', 'replaced-storage'] as const)('refuses a fully rehashed seal with %s against its captured inventory', async change => {
        const input = await fixture();
        const release = sourceRelease(input, 'private-artifact');
        const valid = await prepareImportedReleaseArtifact(input);
        await validateImportedSeal(release, input, valid);
        const files = change === 'missing-media' ? valid.files.filter(file => file.path !== 'public/movie.mp4')
            : valid.files.map(file => change === 'altered-text' && file.path === pagePath ? text(file.path, 'export default function Page() { return null; }')
                : change === 'replaced-storage' && file.path === 'public/movie.mp4' ? { ...file, storageId: 'forged-storage' } : file);
        const descriptor = JSON.parse(valid.artifactJson);
        descriptor.deployHash = manifestHash(files);
        const artifactJson = snapshotCanonicalJson(descriptor);
        await expect(validateImportedSeal(release, input, { ...valid, files, artifactJson, hash: sha256(artifactJson) }))
            .rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it('rejects pinned source drift, original provenance mismatch and unsupported purposes', async () => {
        const input = await fixture();
        await expect(prepareImportedReleaseArtifact({ ...input, source: input.source.map(file => file.path === 'next.config.ts'
            ? text(file.path, `${file.text}\n// changed`) : file) })).rejects.toThrow();
        const metadata = structuredClone(input.metadata);
        metadata.originalManifestHash = 'f'.repeat(64);
        await expect(prepareImportedReleaseArtifact({ ...input, metadata })).rejects.toThrow();
        await expect(prepareImportedReleaseArtifact({ ...input, purpose: 'publish' as 'private-artifact' })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it.each(['missing', 'hash', 'bytes', 'storageId'] as const)('rejects binary %s drift rather than stripping media', async change => {
        const input = await fixture();
        input.metadata.capturedRevision++;
        const path = 'public/movie.mp4';
        if (change === 'missing') input.source = input.source.filter(file => file.path !== path);
        else input.source = input.source.map(file => file.path !== path ? file : { ...file,
            ...(change === 'hash' ? { hash: 'f'.repeat(64) } : change === 'bytes' ? { bytes: file.bytes + 1 } : { storageId: 'other-movie' }) });
        await expect(prepareImportedReleaseArtifact(input)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });
});

describe('imported private artifact v2 media', () => {
    async function uploaded() {
        const input = await fixture();
        const hash = sha256('normalized WebP');
        const asset = { path: `public/weblab-upload-${hash}.webp`, hash, bytes: 14, storageId: 'owned-upload' as Id<'_storage'>,
            mime: 'image/webp' as const, width: 1600, height: 900 };
        const source: ImportedSnapshotFile[] = [...input.source, { ...asset, kind: 'file', media: { version: 1, asset,
            origin: { version: 1, kind: 'upload', actorId: 'actor' as Id<'users'>, attemptId: 'attempt' as Id<'cloudEditorContentImageAttempts'>,
                operationId: 'image_upload_operation_1', sourceRevision: 3,
                approval: { ownerPath: 'src/content/about.ts', bindingId: 'hero', generation: 1, designRevision: 2, fingerprint: 'd'.repeat(64) } } } }];
        const metadata: ImportedReleaseMetadata = { ...input.metadata, version: 2, capturedRevision: 3, mediaManifestHash: await importedMediaManifestHash(source) };
        return { ...input, source, metadata, asset };
    }
    it('keeps original and uploaded media while binding portable ownership into the v2 seal', async () => {
        const input = await uploaded(), result = await prepareImportedReleaseArtifact(input);
        expect(JSON.parse(result.artifactJson)).toMatchObject({ version: 2, artifactProfile: 'imported-next-private-v2', metadata: input.metadata, publicEligible: false, derivationVersion: 1 });
        const legacyJson = snapshotCanonicalJson({ version: 2, artifactProfile: 'imported-next-private-v2', purpose: 'private-artifact', publicEligible: false,
            derivationVersion: 1, sourceHash: manifestHash(input.source), originalHash: await importedInventoryHash(input.original),
            deployHash: manifestHash(result.files), metadata: input.metadata, derivation: deriveImportedPrivateFiles(input.source, input.original, input.metadata).derivation });
        expect(result.artifactJson).toBe(legacyJson);
        expect(result.hash).toBe(sha256(legacyJson));
        expect(result.files.find(file => file.path === input.asset.path)).toEqual({ path: input.asset.path, kind: 'file', storageId: input.asset.storageId, hash: input.asset.hash, bytes: input.asset.bytes });
        for (const original of input.original.filter(file => file.storageId)) expect(result.files).toContainEqual(original);
        await validateImportedSeal(sourceRelease(input, 'private-artifact'), input, result);
        const publicSeal = await prepareImportedReleaseArtifact({ ...input, purpose: 'release', publicationIntent: IMPORTED_PUBLICATION_INTENT });
        expect(publicSeal.files).toEqual(result.files);
        expect(JSON.parse(publicSeal.artifactJson)).toMatchObject({ version: input.metadata.version, artifactProfile: 'imported-next-public-v1', publicEligible: true });
        await validateImportedSeal(sourceRelease(input, 'release'), input, publicSeal);
        const backup = await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' });
        expect(backup.files).toHaveLength(0);
        expect(backup.hash).not.toBe(result.hash);
    });
    it('rejects rehashed omission of an uploaded binary independently of the caller descriptor', async () => {
        const input = await uploaded(), result = await prepareImportedReleaseArtifact(input);
        const files = result.files.filter(file => file.path !== input.asset.path);
        const descriptor = { ...JSON.parse(result.artifactJson), deployHash: manifestHash(files) };
        const artifactJson = snapshotCanonicalJson(descriptor);
        await expect(validateImportedSeal(sourceRelease(input, 'private-artifact'), input, { ...result, files, artifactJson, hash: sha256(artifactJson) })).rejects.toThrow();
    });
    it('refuses original removal, unbound provenance changes, and disguising v2 assets as v1', async () => {
        const input = await uploaded();
        await expect(prepareImportedReleaseArtifact({ ...input, source: input.source.filter(file => file.path !== 'public/movie.mp4') })).rejects.toThrow();
        const altered = structuredClone(input); altered.source.at(-1)!.media!.asset.width = 800;
        await expect(prepareImportedReleaseArtifact(altered)).rejects.toThrow();
        const metadata: ImportedReleaseMetadata = { version: 1, capturedRevision: 3, originalManifestHash: input.metadata.originalManifestHash, preparation: input.metadata.preparation };
        await expect(prepareImportedReleaseArtifact({ ...input, metadata })).rejects.toThrow();
    });
});

async function studioArtifactFixture(withMedia = false) {
    const cssPath = 'src/styles/agency.module.css';
    const pageRecipe = 'import styles from "@/styles/agency.module.css";\nexport function BasicPage() { return <main data-oid="recipe-page" className={styles.page}><h1 data-oid="recipe-title" data-weblab-studio-text="title">Agency title</h1><div data-oid="recipe-body" data-weblab-studio-slot="body"></div></main>; }\n';
    const blockRecipe = 'import styles from "@/styles/agency.module.css";\nexport function TextBlock() { return <section data-oid="recipe-block" className={styles.block}><h2 data-oid="recipe-heading" data-weblab-studio-text="title">Heading</h2><p data-oid="recipe-copy" data-weblab-studio-text="body">Body</p></section>; }\n';
    const base = await fixture([...originals().map(file => file.path === 'tsconfig.json'
        ? text(file.path, '{"compilerOptions":{"strict":true,"paths":{"@/*":["./src/*"]}}}') : file),
    text(IMPORTED_STUDIO_PAGE_PATH, pageRecipe), text(IMPORTED_STUDIO_BLOCK_PATH, blockRecipe), text(cssPath, '.page { color: black; }\n.block { color: inherit; }\n')]);
    let source: ImportedSnapshotFile[] = base.source;
    const originalPaths = base.original.map(file => file.path);
    const apply = (changes: Array<{ path: string; content: string }>) => {
        const next = new Map(source.map(file => [file.path, file]));
        for (const change of changes) next.set(change.path, text(change.path, change.content));
        source = [...next.values()];
    };
    apply(prepareImportedStudioOperation({ files: source, originalPaths, operationId: 'studio_capture_operation_1',
        operation: { kind: 'capture', label: 'Agency page', blockLabel: 'Text', slots: [{ key: 'body', max: 3 }] } }).changes);
    const created = prepareImportedStudioOperation({ files: source, originalPaths, operationId: 'studio_create_operation_1',
        operation: { kind: 'createPage', templateId: 'basic-page-v1', slug: 'agency-page' } });
    apply(created.changes);
    apply(prepareImportedStudioOperation({ files: source, originalPaths, operationId: 'studio_insert_operation_1',
        operation: { kind: 'insertBlock', pageId: created.config.pages[0]!.id, slotKey: 'body', blockId: 'text-block-v1', position: 0 } }).changes);
    if (withMedia) {
        const hash = sha256('normalized WebP');
        const asset = { path: `public/weblab-upload-${hash}.webp`, hash, bytes: 14, storageId: 'owned-upload' as Id<'_storage'>,
            mime: 'image/webp' as const, width: 1600, height: 900 };
        source.push({ ...asset, kind: 'file', media: { version: 1, asset,
            origin: { version: 1, kind: 'upload', actorId: 'actor' as Id<'users'>, attemptId: 'attempt' as Id<'cloudEditorContentImageAttempts'>,
                operationId: 'image_upload_operation_1', sourceRevision: 3,
                approval: { ownerPath: 'src/content/about.ts', bindingId: 'hero', generation: 1, designRevision: 2, fingerprint: 'd'.repeat(64) } } } });
    }
    const metadata: ImportedReleaseMetadata = { ...base.metadata,
        ...(withMedia ? { version: 2 as const, mediaManifestHash: await importedMediaManifestHash(source) } : { version: 1 as const }),
        capturedRevision: 5, studioConfig: captureImportedStudioConfig(source, base.original) };
    return { ...base, source, metadata, ownerPath: created.config.pages[0]!.ownerPath };
}

describe('imported Studio retained source and private derivative', () => {
    it.each([false, true])('keeps exact source and media=%s while removing only marked editor config from the derivative', async withMedia => {
        const input = await studioArtifactFixture(withMedia), before = JSON.stringify(input);
        const result = await prepareImportedReleaseArtifact(input);
        const config = input.source.find(file => file.path === IMPORTED_STUDIO_CONFIG_PATH)!;
        expect(result.files.some(file => file.path === config.path)).toBe(false);
        expect(result.files.find(file => file.path === input.ownerPath)).toEqual(input.source.find(file => file.path === input.ownerPath));
        for (const file of input.source.filter(file => file.storageId)) {
            expect(result.files).toContainEqual({ path: file.path, kind: file.kind, storageId: file.storageId, hash: file.hash, bytes: file.bytes });
        }
        expect(JSON.parse(result.artifactJson)).toMatchObject({ version: withMedia ? 2 : 1, derivationVersion: 2, publicEligible: false,
            metadata: { studioConfig: { path: config.path, hash: config.hash, bytes: config.bytes } } });
        expect(JSON.parse(result.artifactJson).derivation).toContainEqual({ path: config.path, kind: 'remove-introduced-editor-config', beforeHash: config.hash, afterHash: null });
        expect(JSON.parse(result.artifactJson).derivation).toHaveLength(6);
        await validateImportedSeal(sourceRelease(input, 'private-artifact'), input, result);
        const publicSeal = await prepareImportedReleaseArtifact({ ...input, purpose: 'release', publicationIntent: IMPORTED_PUBLICATION_INTENT });
        expect(publicSeal.files).toEqual(result.files);
        expect(JSON.parse(publicSeal.artifactJson)).toMatchObject({ version: input.metadata.version, artifactProfile: 'imported-next-public-v1', publicEligible: true });
        await validateImportedSeal(sourceRelease(input, 'release'), input, publicSeal);
        const backup = await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' });
        expect(JSON.parse(backup.artifactJson)).toMatchObject({ derivationVersion: 2, deployHash: null, derivation: [], sourceHash: manifestHash(input.source) });
        expect(backup.files).toEqual([]);
        await validateImportedSeal(sourceRelease(input, 'backup'), input, backup);
        expect(JSON.stringify(input)).toBe(before);
    });

    it.each([false, true])('preserves a marker-free reserved file and the exact legacy descriptor when original-owned=%s', async originalOwned => {
        const file = text(IMPORTED_STUDIO_CONFIG_PATH, '{"customer":"untouched"}');
        const input = await fixture(originalOwned ? [...originals(), file] : originals());
        if (!originalOwned) { input.source.push(file); input.metadata.capturedRevision = 3; }
        const derived = deriveImportedPrivateFiles(input.source, input.original, input.metadata);
        const result = await prepareImportedReleaseArtifact(input);
        expect(result.files).toContainEqual(file);
        const legacyJson = snapshotCanonicalJson({ version: 1, artifactProfile: 'imported-next-private-v1', purpose: 'private-artifact', publicEligible: false,
            derivationVersion: 1, sourceHash: manifestHash(input.source), originalHash: await importedInventoryHash(input.original),
            deployHash: manifestHash(derived.files), metadata: input.metadata, derivation: derived.derivation });
        expect(result.artifactJson).toBe(legacyJson);
        expect(result.hash).toBe(sha256(legacyJson));
        expect(derived.derivation).toHaveLength(5);
        await validateImportedSeal(sourceRelease(input, 'private-artifact'), input, result);
    });

    it.each(['path', 'hash', 'bytes', 'extra-key', 'original', 'pin', 'instrumentation'] as const)('refuses invalid marked %s provenance in shared validation', async variant => {
        const input = await studioArtifactFixture(), marker = input.metadata.studioConfig!;
        if (variant === 'path') Object.assign(marker, { path: 'src/weblab/other.json' });
        if (variant === 'hash') marker.hash += '\n';
        if (variant === 'bytes') marker.bytes++;
        if (variant === 'extra-key') Object.assign(marker, { active: true });
        if (variant === 'original') input.original.push(input.source.find(file => file.path === marker.path)!);
        if (variant === 'pin') {
            input.metadata.preparation.policy.pinnedFiles.push(marker);
            // Direct shared derivation checks this even without a valid recomputed preparation policy.
            expect(() => deriveImportedPrivateFiles(input.source, input.original, input.metadata)).toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        }
        if (variant === 'instrumentation') input.metadata.preparation.instrumentation.push({ path: marker.path, beforeHash: null, afterHash: marker.hash, addedOids: [], bootstrapChanges: false });
        await expect(validateImportedReleaseSnapshot(input)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });

    it('refuses a reserved JSON reference introduced by restoring the original layout', async () => {
        const input = await studioArtifactFixture();
        input.original = input.original.map(file => file.path === layoutPath
            ? text(file.path, `${file.text}\nexport const editorData = "../weblab/studio.json";\n`) : file);
        input.metadata.originalManifestHash = await importedInventoryHash(input.original);
        input.metadata.preparation.inputManifestHash = input.metadata.originalManifestHash;
        input.metadata.preparation.instrumentation.find(row => row.path === layoutPath)!.beforeHash = input.original.find(file => file.path === layoutPath)!.hash;
        // The source remains valid; only the private derivative reintroduces the consumer.
        expect((await prepareImportedReleaseArtifact({ ...input, purpose: 'backup' })).files).toEqual([]);
        await expect(prepareImportedReleaseArtifact(input)).rejects.toThrow('CLOUD_IMPORTED_STUDIO_INVALID_INVENTORY');
    });

    it.each(['hidden-consumer', 'owner-drift'] as const)('refuses %s before freezing either purpose', async change => {
        const input = await studioArtifactFixture();
        if (change === 'hidden-consumer') input.source.push(text('public/extra.ts', 'import data from "@/weblab/studio.json"; export { data };'));
        else input.source = input.source.map(file => file.path === input.ownerPath ? text(file.path, file.text!.replace('styles.page', 'styles.block')) : file);
        for (const purpose of ['backup', 'private-artifact'] as const) await expect(prepareImportedReleaseArtifact({ ...input, purpose })).rejects.toThrow();
    });

    it.each(['retain-config', 'remove-owner', 'version'] as const)('independent seal rejects rehashed %s transformation', async change => {
        const input = await studioArtifactFixture(), result = await prepareImportedReleaseArtifact(input);
        const files = change === 'retain-config' ? [...result.files, input.source.find(file => file.path === IMPORTED_STUDIO_CONFIG_PATH)!]
            : change === 'remove-owner' ? result.files.filter(file => file.path !== input.ownerPath) : result.files;
        const descriptor = JSON.parse(result.artifactJson);
        descriptor.deployHash = manifestHash(files);
        if (change === 'retain-config') descriptor.derivation = descriptor.derivation.filter((entry: { path: string }) => entry.path !== IMPORTED_STUDIO_CONFIG_PATH);
        if (change === 'version') descriptor.derivationVersion = 1;
        const artifactJson = snapshotCanonicalJson(descriptor);
        await expect(validateImportedSeal(sourceRelease(input, 'private-artifact'), input,
            { ...result, files, artifactJson, hash: sha256(artifactJson) })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });
});


describe('eligible imported source artifact format', () => {
    it('creates a distinct explicitly eligible descriptor while preserving exact legacy private bytes', async () => {
        const input = await fixture(), before = JSON.stringify(input);
        const legacy = await prepareImportedReleaseArtifact(input);
        const derived = deriveImportedPrivateFiles(input.source, input.original, input.metadata);
        const legacyJson = snapshotCanonicalJson({ version: 1, artifactProfile: 'imported-next-private-v1', purpose: 'private-artifact', publicEligible: false,
            derivationVersion: 1, sourceHash: manifestHash(input.source), originalHash: input.metadata.originalManifestHash,
            deployHash: manifestHash(derived.files), metadata: input.metadata, derivation: derived.derivation });
        expect(legacy.artifactJson).toBe(legacyJson); expect(legacy.hash).toBe(sha256(legacyJson));
        const result = await prepareImportedReleaseArtifact({ ...input, purpose: 'release', publicationIntent: IMPORTED_PUBLICATION_INTENT });
        expect(result.files).toEqual(legacy.files); expect(result.hash).not.toBe(legacy.hash);
        expect(JSON.parse(result.artifactJson)).toMatchObject({ artifactProfile: 'imported-next-public-v1', purpose: 'release',
            publicEligible: true, publicationIntent: IMPORTED_PUBLICATION_INTENT, metadata: input.metadata });
        await validateImportedSeal(sourceRelease(input, 'release'), input, result);
        expect(JSON.stringify(input)).toBe(before);
        expect(await prepareImportedReleaseArtifact(input)).toEqual(legacy);
    });

    it('requires explicit intent and refuses promotion or mixed public/private seals', async () => {
        const input = await fixture(), privateSeal = await prepareImportedReleaseArtifact(input);
        await expect(prepareImportedReleaseArtifact({ ...input, purpose: 'release' })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        await expect(prepareImportedReleaseArtifact({ ...input, publicationIntent: IMPORTED_PUBLICATION_INTENT })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        const publicSeal = await prepareImportedReleaseArtifact({ ...input, purpose: 'release', publicationIntent: IMPORTED_PUBLICATION_INTENT });
        await expect(validateImportedSeal(sourceRelease(input, 'release'), input, privateSeal)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        await expect(validateImportedSeal(sourceRelease(input, 'private-artifact'), input, publicSeal)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        for (const purpose of ['backup', 'private-artifact'] as const) {
            const malformed = { ...sourceRelease(input, 'release'), purpose };
            await expect(validateImportedSeal(malformed, input, publicSeal)).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
        }
        const descriptor = JSON.parse(publicSeal.artifactJson); descriptor.publicEligible = false;
        const artifactJson = snapshotCanonicalJson(descriptor);
        await expect(validateImportedSeal(sourceRelease(input, 'release'), input, { ...publicSeal, artifactJson, hash: sha256(artifactJson) })).rejects.toThrow('CLOUD_IMPORTED_ARTIFACT_INVALID');
    });
});
