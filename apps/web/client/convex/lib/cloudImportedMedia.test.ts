import { describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { ImportedMediaAsset, ImportedMediaProvenance } from '../cloudEditorContentImageSchema';
import { assertImportedMediaAsset, assertImportedMediaProvenance, hasImportedImageAdmission, importedImageApprovalIdentity, importedMediaManifestHash, recordImportedMediaUpload, restoredImportedMedia, validateImportedMediaInventory } from './cloudImportedMedia';
import type { ImportedSnapshotFile } from './cloudImportedRelease';

const scope = { projectId: 'projects:site' as Id<'projects'>, branchId: 'branches:site' as Id<'branches'> };
const approval = { ownerPath: 'src/content/about.ts', bindingId: 'hero', generation: 2, designRevision: 3, fingerprint: 'a'.repeat(64) };
const asset: ImportedMediaAsset = { path: `public/weblab-upload-${'b'.repeat(64)}.webp`, storageId: '_storage:image' as Id<'_storage'>,
    hash: 'b'.repeat(64), bytes: 123, mime: 'image/webp', width: 1600, height: 900 };
const media: ImportedMediaProvenance = { version: 1, asset, origin: { version: 1, kind: 'upload', approval, sourceRevision: 4,
    actorId: 'users:agency' as Id<'users'>, attemptId: 'cloudEditorContentImageAttempts:attempt' as Id<'cloudEditorContentImageAttempts'>, operationId: 'upload_operation_0001' } };
const file: ImportedSnapshotFile = { path: asset.path, kind: 'file', hash: asset.hash, storageId: asset.storageId, bytes: asset.bytes, media };
function fixture() {
    const tables: Record<string, Record<string, unknown>[]> = {
        cloudEditorStates: [{ ...scope, profile: 'imported-next-v1', revision: 3, designRevision: 3, preparationId: 'prep' }],
        cloudEditorContentContracts: [{ ...scope, path: approval.ownerPath, active: true, version: 2, generation: 2, designRevision: 3,
            fingerprint: approval.fingerprint, bindings: [], imageBindings: [{ bindingId: approval.bindingId, allowImageUploads: true, fields: ['src'], aspectRatio: { width: 16, height: 9 } }] }],
        cloudEditorFiles: [{ ...scope, ...file, media: undefined }], cloudEditorImportedMedia: [], cloudEditorImportedImageAdmissions: [],
    };
    const metric = { used: 0, remaining: 20_000_000 };
    const ctx = { meta: { getTransactionMetrics: async () => ({ bytesRead: metric, bytesWritten: metric, documentsRead: metric, documentsWritten: metric, databaseQueries: metric }) },
        db: { get: async (id: string) => id === 'prep' ? { baselineAttemptId: 'baseline' } : { ...scope, files: [] },
            system: { get: async () => ({ size: asset.bytes, sha256: asset.hash }) },
            insert: async (table: string, row: Record<string, unknown>) => { tables[table]!.push(row); return 'inserted'; },
            query: (table: string) => {
                const filters: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { filters.push([key, value]); return index; } };
                const rows = () => tables[table]!.filter(row => filters.every(([key, value]) => {
                    const actual = key === 'asset.path' ? (row.asset as ImportedMediaAsset).path : row[key]; return actual === value;
                }));
                const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; }, unique: async () => rows()[0] ?? null, take: async (n: number) => rows().slice(0, n) };
                return query;
            },
        },
    } as unknown as MutationCtx;
    const input = { ...scope, asset, approval, expectedRevision: 3, actorId: media.origin.kind === 'upload' ? media.origin.actorId : '' as Id<'users'>,
        attemptId: 'cloudEditorContentImageAttempts:attempt' as Id<'cloudEditorContentImageAttempts'>, operationId: 'upload_operation_0001' };
    return { ctx, tables, input };
}
describe('imported media ownership and target admission', () => {
    it('rejects malformed uploaded assets and future origin revisions', () => {
        for (const change of [{ path: 'public/original.webp' }, { width: 8193 }, { width: 8192, height: 8192 }, { bytes: 600001 }, { hash: `${asset.hash}\n` }])
            expect(() => assertImportedMediaAsset({ ...asset, ...change })).toThrow();
        expect(() => assertImportedMediaProvenance(media, 3)).toThrow();
    });
    it('binds every immutable approval field and ignores unrelated operation fields', async () => {
        const identity = await importedImageApprovalIdentity(scope, approval);
        expect(await importedImageApprovalIdentity({ ...scope, ignored: 'operation' } as typeof scope, approval)).toBe(identity);
        for (const change of [{ generation: 3 }, { designRevision: 4 }, { bindingId: 'other' }, { fingerprint: 'c'.repeat(64) }, { ownerPath: 'src/content/security.ts' }])
            expect(await importedImageApprovalIdentity(scope, { ...approval, ...change })).not.toBe(identity);
    });
    it('requires extra binary provenance and retains every original tuple exactly', () => {
        const original = { path: 'public/original.webp', kind: 'file' as const, hash: 'c'.repeat(64), bytes: 12, storageId: 'original' };
        expect(() => validateImportedMediaInventory([original, file], [original], 4)).not.toThrow();
        expect(() => validateImportedMediaInventory([file], [original], 4)).toThrow();
        expect(() => validateImportedMediaInventory([{ ...file, media: undefined }], [], 4)).toThrow();
        expect(() => validateImportedMediaInventory([{ ...file, storageId: 'swapped' }], [], 4)).toThrow();
        expect(() => validateImportedMediaInventory([{ ...original, media }], [original], 4)).toThrow();
        expect(() => validateImportedMediaInventory([original], [{ ...original, text: 'original text', storageId: undefined }], 4)).toThrow();
    });
    it('hashes provenance, and creates bounded restore ancestry without admissions', async () => {
        const first = await importedMediaManifestHash([file]);
        expect(await importedMediaManifestHash([{ ...file, media: { ...media, asset: { ...asset, width: 800 } } }])).not.toBe(first);
        const restored = await restoredImportedMedia([file], 'cloudReleases:backup' as Id<'cloudReleases'>, 7);
        expect(restored[0]!.origin).toMatchObject({ kind: 'restore', sourceRevision: 7, backupId: 'cloudReleases:backup' });
        expect(JSON.stringify(restored)).not.toContain('upload_operation');
        expect(() => assertImportedMediaProvenance(restored[0]!, 7)).not.toThrow();
    });
    it('reuses the exact target admission and ownership across separate operations', async () => {
        const f = fixture(); await recordImportedMediaUpload(f.ctx, f.input);
        f.tables.cloudEditorStates![0]!.revision = 4;
        await recordImportedMediaUpload(f.ctx, { ...f.input, expectedRevision: 4, operationId: 'upload_operation_0002' });
        expect(f.tables.cloudEditorImportedMedia).toHaveLength(1);
        expect(f.tables.cloudEditorImportedImageAdmissions).toHaveLength(1);
        expect(await hasImportedImageAdmission(f.ctx, scope, approval, asset)).toBe(true);
        expect(await hasImportedImageAdmission(f.ctx, scope, { ...approval, generation: 3 }, asset)).toBe(false);
        expect(await hasImportedImageAdmission(f.ctx, scope, { ...approval, bindingId: 'other' }, asset)).toBe(false);
    });
    it('does not admit a 65th distinct asset and writes nothing on a stale approval', async () => {
        const f = fixture(), approvalIdentity = await importedImageApprovalIdentity(scope, approval);
        f.tables.cloudEditorImportedImageAdmissions = Array.from({ length: 64 }, (_, i) => ({ ...scope, approval, approvalIdentity, asset: { ...asset, hash: i.toString(16).padStart(64, '0'), path: `public/weblab-upload-${i.toString(16).padStart(64, '0')}.webp` } }));
        await expect(recordImportedMediaUpload(f.ctx, f.input)).rejects.toThrow('CLOUD_IMPORTED_IMAGE_ADMISSION_LIMIT');
        expect(f.tables.cloudEditorImportedMedia).toHaveLength(0);
        const g = fixture(); g.tables.cloudEditorContentContracts![0]!.generation = 3;
        await expect(recordImportedMediaUpload(g.ctx, g.input)).rejects.toThrow();
        expect(g.tables.cloudEditorImportedImageAdmissions).toHaveLength(0);
    });
});
