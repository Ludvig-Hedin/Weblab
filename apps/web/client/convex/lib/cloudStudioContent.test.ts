import { describe, expect, it } from 'bun:test';
import { assertCloudStudioSource, draftStudioArtifact, materializeCloudStudioRelease, serializeStudioArtifact,
    STUDIO_JSON_PATH, studioRendererFiles, updateJournalItem, type CloudStudioFreezeInput, type JournalItem } from './cloudStudioContent';

const entry = (key = 'journal_item_0001'): JournalItem => ({ key, slug: 'first-story', revision: 1, status: 'ready', archived: false,
    values: { title: 'Original title', excerpt: 'Summary', body: 'First paragraph.\nSecond paragraph.' } });
const input = (items = [entry()]): CloudStudioFreezeInput => ({ settings: { profile: 'cloud-studio-v1', generation: 1, active: true,
    allowPages: true, allowedBlocks: ['text-v1'], slots: [] }, items, assets: [{ path: 'public/images/cover.png', hash: 'a'.repeat(64) }] });
describe('Cloud Journal immutable projection', () => {
    it('keeps a live revision during a draft edit and excludes new drafts', () => {
        const baseline = materializeCloudStudioRelease(input(), null).artifact;
        const next = input([{ ...entry(), revision: 2, status: 'draft', values: { ...entry().values, title: 'Unreviewed title' } },
            { ...entry('journal_item_0002'), slug: 'new-story', status: 'draft' }]);
        expect(draftStudioArtifact(next).items).toHaveLength(2);
        const release = materializeCloudStudioRelease(next, baseline);
        expect(release.artifact.items).toEqual(baseline.items);
        expect(release.files.find(file => file.path === STUDIO_JSON_PATH)?.content).not.toContain('Unreviewed title');
        expect(baseline.items[0]!.values.title).toBe('Original title');
    });
    it('archives explicitly, then keeps restored draft unpublished', () => {
        const baseline = materializeCloudStudioRelease(input(), null).artifact;
        const archived = updateJournalItem([entry()], { kind: 'archive', key: entry().key, expectedItemRevision: 1 }, new Set());
        const removed = materializeCloudStudioRelease(input(archived), baseline).artifact;
        expect(removed.items).toHaveLength(0);
        const restored = updateJournalItem(archived, { kind: 'restore', key: entry().key, expectedItemRevision: 2 }, new Set());
        expect(restored[0]?.status).toBe('draft');
        expect(materializeCloudStudioRelease(input(restored), removed).artifact.items).toHaveLength(0);
    });
    it('requires native-style item CAS and reserves archived slugs', () => {
        expect(() => updateJournalItem([entry()], { kind: 'archive', key: entry().key, expectedItemRevision: 0 }, new Set())).toThrow();
        expect(() => updateJournalItem([{ ...entry(), archived: true }], { kind: 'save', key: 'journal_item_0002', expectedItemRevision: 0,
            slug: entry().slug, values: entry().values, status: 'draft' }, new Set())).toThrow('CLOUD_STUDIO_INVALID_ITEM');
    });
    it('refuses a live baseline with lost rows or conflicting preserved slugs', () => {
        const baseline = materializeCloudStudioRelease(input(), null).artifact;
        expect(() => materializeCloudStudioRelease(input([]), baseline)).toThrow('CLOUD_STUDIO_MISSING_LIVE_ITEM');
        expect(() => materializeCloudStudioRelease(input([{ ...entry(), slug: 'draft-renamed', status: 'draft' },
            { ...entry('journal_item_0002'), slug: 'first-story' }]), baseline)).toThrow('CLOUD_STUDIO_LIVE_SLUG_CONFLICT');
    });
    it('validates owned raster images and emits only fixed local data readers', () => {
        const save = { kind: 'save' as const, key: entry().key, expectedItemRevision: 1, slug: entry().slug, status: 'ready' as const,
            values: { ...entry().values, cover: { path: '/images/cover.png', alt: 'A field' } } };
        expect(() => updateJournalItem([entry()], save, new Set())).toThrow('CLOUD_STUDIO_INVALID_ASSET');
        const result = updateJournalItem([entry()], save, new Set(['/images/cover.png']));
        expect(materializeCloudStudioRelease(input(result), null).assetPaths).toEqual(['public/images/cover.png']);
        for (const file of studioRendererFiles()) { expect(file.content).not.toContain('fetch('); expect(file.content).not.toContain('dangerouslySetInnerHTML'); }
    });
    it('keeps a prior live cover when draft source reuses its path with new bytes', () => {
        const withCover = { ...entry(), values: { ...entry().values, cover: { path: '/images/cover.png', alt: 'Original' } } };
        const baseline = materializeCloudStudioRelease(input([withCover]), null).artifact;
        const next = input([{ ...withCover, revision: 2, status: 'draft' }]);
        next.assets[0]!.hash = 'b'.repeat(64);
        const release = materializeCloudStudioRelease(next, baseline);
        expect(release.assetRequirements).toEqual([{ path: 'public/images/cover.png', hash: 'a'.repeat(64), targetPath: `public/_weblab-assets/${'a'.repeat(64)}.png` }]);
        expect(release.artifact.items[0]!.values.cover?.path).toBe(`/_weblab-assets/${'a'.repeat(64)}.png`);
    });
    it('can archive an item after its source image is removed, but cannot silently restore it', () => {
        const withCover = { ...entry(), values: { ...entry().values, cover: { path: '/images/missing.png', alt: '' } } };
        const archived = updateJournalItem([withCover], { kind: 'archive', key: withCover.key, expectedItemRevision: 1 }, new Set());
        expect(archived[0]!.archived).toBe(true);
        expect(() => updateJournalItem(archived, { kind: 'restore', key: withCover.key, expectedItemRevision: 2 }, new Set())).toThrow('CLOUD_STUDIO_INVALID_ASSET');
        expect(updateJournalItem(archived, { kind: 'restore', key: withCover.key, expectedItemRevision: 2, values: entry().values }, new Set())[0]!.status).toBe('draft');
    });
    it('refuses edited or missing generated projection and renderer source', () => {
        const snapshot = input();
        const files = [...studioRendererFiles(), { path: STUDIO_JSON_PATH, content: serializeStudioArtifact(draftStudioArtifact(snapshot)) }];
        expect(() => assertCloudStudioSource(snapshot, files)).not.toThrow();
        expect(() => assertCloudStudioSource(snapshot, files.slice(1))).toThrow('CLOUD_STUDIO_PROJECTION_CHANGED');
        expect(() => assertCloudStudioSource(snapshot, files.map(file => file.path === STUDIO_JSON_PATH ? { ...file, content: '{}' } : file))).toThrow('CLOUD_STUDIO_PROJECTION_CHANGED');
    });
});
