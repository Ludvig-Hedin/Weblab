import { describe, expect, it } from 'bun:test';
import { createCloudEditorFiles } from './cloudEditorTemplate';
import { draftStudioArtifact, serializeStudioArtifact, studioRendererFiles, STUDIO_JSON_PATH } from './cloudStudioContent';
import type { CloudStudioFreezeInput } from './cloudStudioContent';
import { prepareReleaseArtifact, sha256 } from './cloudReleaseArtifact';
import type { ArtifactFile } from './cloudReleaseArtifact';

const input = (): CloudStudioFreezeInput => ({ settings: { profile: 'cloud-studio-v1', active: true, generation: 1, allowPages: true, allowedBlocks: ['text-v1'], slots: [] },
    items: [
        { key: 'journal_ready', slug: 'ready', revision: 1, archived: false, status: 'ready', values: { title: 'Public story', excerpt: '', body: 'Public text' } },
        { key: 'journal_draft', slug: 'draft', revision: 1, archived: false, status: 'draft', values: { title: 'Unreleased secret story', excerpt: '', body: 'Private draft body' } },
    ], assets: [] });
function source(studio: CloudStudioFreezeInput): ArtifactFile[] {
    return [...createCloudEditorFiles('Test site'), { path: 'bun.lock', content: '{"lockfileVersion":1}' },
        ...studioRendererFiles(), { path: STUDIO_JSON_PATH, content: serializeStudioArtifact(draftStudioArtifact(studio)) }]
        .map(({ path, content }) => ({ path, kind: 'file', text: content, hash: sha256(content), bytes: Buffer.byteLength(content) }));
}
describe('immutable cloud release materialization', () => {
    it('replaces draft content and removes editor bridge from deployment bytes', () => {
        const studio = input(), files = source(studio);
        const prepared = prepareReleaseArtifact(files, studio, null);
        const deployed = prepared.files.map(file => file.text ?? '').join('\n');
        expect(deployed).toContain('Public story');
        expect(deployed).not.toContain('Unreleased secret story');
        expect(deployed).not.toContain('Private draft body');
        expect(deployed).not.toContain('weblab-preload-script');
        expect(files.find(file => file.path === STUDIO_JSON_PATH)?.text).toContain('Private draft body');
        expect(prepared.files.some(file => file.path === 'next.config.ts')).toBe(false);
        expect(deployed).not.toContain('WEBLAB_PREVIEW_HOST');
        for (const path of ['package.json', 'bun.lock', 'postcss.config.mjs', 'tsconfig.json', 'next-env.d.ts',
            'src/app/layout.tsx', 'src/app/globals.css', 'src/app/page.tsx', 'src/app/about/page.tsx',
            'src/app/journal/page.tsx', 'src/app/journal/[slug]/page.tsx']) {
            expect(prepared.files.some(file => file.path === path)).toBe(true);
        }
    });
    it('refuses any changed Next config instead of ignoring an arbitrary deployment setting', () => {
        const studio = input(), files = source(studio);
        const config = files.find(file => file.path === 'next.config.ts')!;
        config.text += '\n// Edited configuration\n';
        expect(() => prepareReleaseArtifact(files, studio, null)).toThrow('CLOUD_RELEASE_UNSUPPORTED_CONFIG');
    });
    it('refuses missing build inputs and a modified PostCSS execution path', () => {
        const studio = input(), files = source(studio);
        expect(() => prepareReleaseArtifact(files.filter(file => file.path !== 'src/app/globals.css'), studio, null)).toThrow('CLOUD_RELEASE_BUILD_FILE_MISSING');
        files.find(file => file.path === 'postcss.config.mjs')!.text = 'export default { plugins: {} };';
        expect(() => prepareReleaseArtifact(files, studio, null)).toThrow('CLOUD_RELEASE_UNSUPPORTED_CONFIG');
    });
    it('keeps the starter toolchain pinned and does not silently remove configured interactions', () => {
        const studio = input(), files = source(studio);
        const packageFile = files.find(file => file.path === 'package.json')!;
        const packageJson = JSON.parse(packageFile.text!);
        packageJson.dependencies.next = 'latest'; packageFile.text = JSON.stringify(packageJson);
        expect(() => prepareReleaseArtifact(files, studio, null)).toThrow('CLOUD_RELEASE_UNSUPPORTED_PACKAGE');
        const interactions = source(studio);
        interactions.find(file => file.path === 'public/_weblab/interactions-initial.css')!.text = '.animated { opacity: 0; }';
        expect(() => prepareReleaseArtifact(interactions, studio, null)).toThrow('CLOUD_RELEASE_INTERACTIONS_UNSUPPORTED');
    });
    it('refuses a source projection edited outside the content contract', () => {
        const studio = input(), files = source(studio);
        files.find(file => file.path === STUDIO_JSON_PATH)!.text = '{}';
        expect(() => prepareReleaseArtifact(files, studio, null)).toThrow('CLOUD_STUDIO_PROJECTION_CHANGED');
    });
    it('pins deploy hash to the materialized bytes, independent of file enumeration', () => {
        const studio = input(), files = source(studio);
        expect(prepareReleaseArtifact(files, studio, null).hash).toBe(prepareReleaseArtifact([...files].reverse(), studio, null).hash);
        const page = files.find(file => file.path === 'src/app/page.tsx')!;
        const changed = files.map(file => file === page ? { ...file, text: file.text!.replace('Thoughtful', 'Careful') } : file);
        expect(prepareReleaseArtifact(changed, studio, null).hash).not.toBe(prepareReleaseArtifact(files, studio, null).hash);
    });
    it('refuses a CMS/network dependency and unreviewed deployment config', () => {
        const studio = input(), files = source(studio);
        const config = { path: 'vercel.json', kind: 'file' as const, text: '{}', hash: sha256('{}'), bytes: 2 };
        expect(() => prepareReleaseArtifact([...files, config], studio, null)).toThrow('CLOUD_RELEASE_UNSUPPORTED_CONFIG');
        files.find(file => file.path === 'src/app/page.tsx')!.text = 'export default async function Page() { return fetch("https://cms.example"); }';
        expect(() => prepareReleaseArtifact(files, studio, null)).toThrow('CLOUD_RELEASE_UNSUPPORTED_NETWORK_SOURCE');
    });
    it('keeps an earlier live cover when a newer draft replaced the original image path', () => {
        const studio = input();
        studio.items[0]!.values.cover = { path: '/cover.png', alt: 'Original cover' };
        const oldHash = sha256('old-image'), newHash = sha256('new-image');
        studio.assets = [{ path: 'public/cover.png', hash: oldHash }];
        const oldFile: ArtifactFile = { path: 'public/cover.png', kind: 'file', storageId: 'old_blob', hash: oldHash, bytes: 9 };
        const first = prepareReleaseArtifact([...source(studio), oldFile], studio, null);
        const changed = structuredClone(studio);
        changed.items[0]!.status = 'draft'; changed.items[0]!.revision = 2;
        changed.items[0]!.values.title = 'New private headline';
        changed.assets = [{ path: 'public/cover.png', hash: newHash }];
        const newFile = { ...oldFile, storageId: 'new_blob', hash: newHash };
        const next = prepareReleaseArtifact([...source(changed), newFile], changed, JSON.parse(first.artifactJson), first.files);
        expect(next.files.find(file => file.path === `public/_weblab-assets/${oldHash}.png`)?.storageId).toBe('old_blob');
        expect(next.files.some(file => file.storageId === 'new_blob')).toBe(false);
        expect(next.files.find(file => file.path === STUDIO_JSON_PATH)?.text).not.toContain('New private headline');
        expect(() => prepareReleaseArtifact([...source(changed), newFile], changed, JSON.parse(first.artifactJson))).toThrow('CLOUD_RELEASE_ASSET_MISSING');
    });
});
