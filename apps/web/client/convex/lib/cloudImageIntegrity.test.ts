import { describe, expect, it } from 'bun:test';
import type { QueryCtx } from '../_generated/server';
import { assertSnapshotBudget, snapshotCanonicalJson, snapshotDocumentBytes, verifySnapshotStorage } from './cloudImageIntegrity';

function fixture() {
    const metric = { used: 0, remaining: 20_000_000 };
    const metadata = { size: 3, sha256: 'a'.repeat(64) };
    const reads: string[] = [];
    const ctx = {
        meta: { getTransactionMetrics: async () => ({ bytesRead: metric, bytesWritten: metric, documentsRead: metric, documentsWritten: metric, databaseQueries: metric }) },
        db: { system: { get: async (id: string) => { reads.push(id); return metadata; } } },
    } as unknown as QueryCtx;
    return { ctx, metric, metadata, reads };
}

describe('image storage integrity and bounded transactions', () => {
    it('canonicalizes equivalent approval key order without conflating different values', () => {
        expect(snapshotCanonicalJson({ b: { d: 2, c: 1 }, a: ['x'] }))
            .toBe(snapshotCanonicalJson({ a: ['x'], b: { c: 1, d: 2 } }));
        expect(snapshotCanonicalJson({ a: ['x', 'y'] })).not.toBe(snapshotCanonicalJson({ a: ['y', 'x'] }));
        expect(() => snapshotCanonicalJson({ a: () => 1 })).toThrow('CLOUD_IMPORTED_MEDIA_INVALID');
    });

    it('reserves document overhead and refuses work beyond transaction capacity', async () => {
        expect(() => snapshotDocumentBytes({ value: 'image' }, 256)).toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
        const f = fixture();
        await assertSnapshotBudget(f.ctx, { writeDocs: 1 });
        await expect(assertSnapshotBudget(f.ctx, { writeDocs: 1_401 })).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
        f.metric.remaining = 0;
        await expect(assertSnapshotBudget(f.ctx, { readDocs: 1 })).rejects.toThrow('CLOUD_IMPORTED_IMAGE_TOO_LARGE');
    });

    it('deduplicates storage reads but rejects conflicting aliases and changed metadata', async () => {
        const f = fixture();
        const file = { path: 'public/one.webp', kind: 'file' as const, storageId: '_storage:one', bytes: 3, hash: 'a'.repeat(64) };
        await verifySnapshotStorage(f.ctx, [file, { ...file, path: 'public/two.webp' }]);
        expect(f.reads).toEqual(['_storage:one']);
        await expect(verifySnapshotStorage(f.ctx, [file, { ...file, bytes: 4 }])).rejects.toThrow('CLOUD_IMPORTED_MEDIA_INVALID');
        f.metadata.sha256 = 'b'.repeat(64);
        await expect(verifySnapshotStorage(f.ctx, [file])).rejects.toThrow('CLOUD_IMPORTED_MEDIA_INVALID');
    });
});
