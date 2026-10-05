'use node';

import { createHash } from 'node:crypto';
import type { CloudStudioArtifact, CloudStudioFreezeInput } from './cloudStudioContent';
import { assertCloudStudioSource, materializeCloudStudioRelease, STUDIO_JSON_PATH } from './cloudStudioContent';
import { assertReleaseText, MAX_RELEASE_BUILD_FILES_BYTES, releasePath } from './cloudReleasePolicy';
import { createCloudEditorFiles } from './cloudEditorTemplate';

export type ArtifactFile = { path: string; kind: 'file' | 'directory'; text?: string; storageId?: string; hash: string; bytes: number };
export function sha256(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function manifestHash(files: ReadonlyArray<ArtifactFile>): string {
    return sha256(JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path)).map(({ path, kind, hash, bytes }) => [path, kind, hash, bytes])));
}
const EDITOR_FILES = new Set(['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js', '__weblab-preload.js', '__weblab-ix-runtime.js']);
// Read the real starter contract rather than maintaining a second config string.
const STARTER_FILES = new Map(createCloudEditorFiles('Release validation').map(file => [file.path, file.content]));
const STARTER_PACKAGE = JSON.parse(STARTER_FILES.get('package.json')!) as { packageManager: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
const BUILD_FILES = ['package.json', 'bun.lock', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs',
    'src/app/layout.tsx', 'src/app/globals.css', 'src/app/page.tsx', 'src/app/about/page.tsx'];

/** Narrow, secret-free cloud profile. Native projects and arbitrary CMS imports are unsupported. */
export function prepareReleaseArtifact(source: ArtifactFile[], studio: CloudStudioFreezeInput | null, previous: CloudStudioArtifact | null, baseline: ArtifactFile[] = []) {
    if (!studio) throw new Error('CLOUD_RELEASE_STUDIO_REQUIRED');
    assertCloudStudioSource(studio, source);
    for (const path of BUILD_FILES) {
        const matching = source.filter(file => file.path === path && file.kind === 'file');
        if (matching.length !== 1 || matching[0]?.text === undefined) throw new Error('CLOUD_RELEASE_BUILD_FILE_MISSING');
    }
    for (const file of source) {
        const starterPath = file.path === '.weblab/interactions.json' ? 'public/_weblab/interactions.json' : file.path;
        if (['public/_weblab/interactions.json', 'public/_weblab/interactions-initial.css'].includes(starterPath) && file.text !== STARTER_FILES.get(starterPath)) {
            throw new Error('CLOUD_RELEASE_INTERACTIONS_UNSUPPORTED');
        }
    }
    const materialized = materializeCloudStudioRelease(studio, previous);
    const overlays = new Map(materialized.files.map(file => [file.path, file.content]));
    const files: ArtifactFile[] = [];
    for (const original of source) {
        if (original.kind === 'directory' || EDITOR_FILES.has(original.path) || original.path.startsWith('.weblab/')) continue;
        releasePath(original.path);
        if (original.path === 'next.config.ts' && original.text === STARTER_FILES.get('next.config.ts')) {
            // This exact starter config only sets the disposable editor's dev origin.
            // Production uses Next's defaults and receives no preview environment binding.
            continue;
        }
        if (/^(?:vercel\.json|next\.config\.|bunfig\.toml|\.npmrc|\.yarnrc|pnpm-workspace\.)/.test(original.path) || /(?:^|\/)(?:middleware|instrumentation)\.[cm]?[jt]s$/.test(original.path) || /\/api\//.test(original.path)) {
            throw new Error('CLOUD_RELEASE_UNSUPPORTED_CONFIG');
        }
        if (original.path === 'postcss.config.mjs' && original.text !== STARTER_FILES.get(original.path)) throw new Error('CLOUD_RELEASE_UNSUPPORTED_CONFIG');
        let text = overlays.get(original.path) ?? original.text;
        overlays.delete(original.path);
        if (original.path === 'src/app/layout.tsx' && text !== undefined) {
            text = text.replace(/^import Script from ['"]next\/script['"];?\s*$/m, '')
                .replace(/<Script\s+id="weblab-(?:preload-script|ix-runtime)"[^>]*\/>/g, '');
        }
        if (text !== undefined) {
            assertReleaseText(original.path, text);
            if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(|process\s*\.\s*env|['"]use server['"]|(?:from\s*|import\s*\()['"](?:https?:|node:|@sanity\/|next-sanity)/.test(text)) {
                throw new Error('CLOUD_RELEASE_UNSUPPORTED_NETWORK_SOURCE');
            }
            // No editor bridge, dynamic provider data or draft projection may reach a deployment.
            if (/weblab-preload-script|__weblab-preload/.test(text)) throw new Error('CLOUD_RELEASE_EDITOR_BRIDGE');
            files.push({ path: original.path, kind: 'file', text, bytes: Buffer.byteLength(text), hash: sha256(text) });
        } else files.push({ ...original });
    }
    for (const [path, text] of overlays) files.push({ path, kind: 'file', text, bytes: Buffer.byteLength(text), hash: sha256(text) });
    const pkg = files.find(file => file.path === 'package.json')?.text;
    const manifest = pkg ? JSON.parse(pkg) as { packageManager?: unknown; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; scripts?: Record<string, unknown> } : null;
    const matchingDependencies = (actual: Record<string, unknown> | undefined, expected: Record<string, string>) =>
        !!actual && Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([name, version]) => actual[name] === version);
    if (!manifest || manifest.packageManager !== STARTER_PACKAGE.packageManager ||
        !matchingDependencies(manifest.dependencies, STARTER_PACKAGE.dependencies) || !matchingDependencies(manifest.devDependencies, STARTER_PACKAGE.devDependencies) ||
        Object.keys(manifest).some(name => !['name', 'private', 'packageManager', 'scripts', 'dependencies', 'devDependencies'].includes(name)) ||
        Object.keys(manifest.scripts ?? {}).some(name => !['dev', 'build', 'start', 'lint', 'typecheck'].includes(name)) ||
        manifest.scripts?.build !== 'next build' || !files.some(file => file.path === 'bun.lock')) throw new Error('CLOUD_RELEASE_UNSUPPORTED_PACKAGE');
    for (const requirement of materialized.assetRequirements) {
        const asset = [...source, ...baseline].find(file => file.hash === requirement.hash && file.storageId &&
            (file.path === requirement.path || file.path === requirement.targetPath));
        if (!asset) throw new Error('CLOUD_RELEASE_ASSET_MISSING');
        files.push({ ...asset, path: requirement.targetPath });
    }
    // Draft-only uploads are not public release files. Keep only assets used by frozen source.
    const renderedText = files.flatMap(file => file.text !== undefined ? [file.text] : []).join('\n');
    const retainedFiles = files.filter(file => !file.storageId || renderedText.includes(`/${file.path.replace(/^public\//, '')}`));
    const projection = files.find(file => file.path === STUDIO_JSON_PATH);
    if (!projection?.text || projection.text !== materialized.files.find(file => file.path === STUDIO_JSON_PATH)?.content || JSON.parse(projection.text).mode !== 'release') {
        throw new Error('CLOUD_RELEASE_DRAFT_CONTENT');
    }
    if (new Set(retainedFiles.map(file => file.path)).size !== retainedFiles.length || retainedFiles.reduce((sum, file) => sum + file.bytes, 0) > MAX_RELEASE_BUILD_FILES_BYTES) throw new Error('CLOUD_RELEASE_TOO_LARGE');
    return { files: retainedFiles, artifactJson: JSON.stringify(materialized.artifact), sourceHash: manifestHash(source), hash: manifestHash(retainedFiles) };
}
