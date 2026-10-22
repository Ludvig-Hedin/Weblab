import { getConvexSize, getDocumentSize, type Value } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { ImportedMediaProvenance } from '../cloudEditorContentImageSchema';
import { cloudError } from './cloudEditor';
import { storageSha256Matches } from './storageHash';

type Context = QueryCtx | MutationCtx;
export type ImportedSnapshotFile = { path: string; kind: 'file' | 'directory'; text?: string; storageId?: string; bytes: number; hash: string; media?: ImportedMediaProvenance };
const encoder = new TextEncoder();
const IMPORTED_SNAPSHOT_LIMITS = { document: 800_000, readBytes: 12_000_000, writeBytes: 6_000_000, documents: 1_400, calls: 512, envelope: 6_000_000 } as const;
function invalid(): never { return cloudError('CLOUD_IMPORTED_MEDIA_INVALID'); }
function tooLarge(): never { return cloudError('CLOUD_IMPORTED_IMAGE_TOO_LARGE'); }

function value(input: unknown): Value {
    if (input === null || typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number') return input;
    if (Array.isArray(input)) return input.map(value);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input)
        .filter(([, item]) => item !== undefined).map(([key, item]) => [key, value(item)]));
    return invalid();
}
export function snapshotValueBytes(input: unknown): number { return getConvexSize(value(input)); }
export function snapshotDocumentBytes(input: object, limit: number = IMPORTED_SNAPSHOT_LIMITS.document): number {
    // Reserve extra space for server IDs, including placeholder IDs used before insertion.
    const bytes = getDocumentSize(value(input) as Record<string, Value>) + 256;
    if (bytes > limit) tooLarge();
    return bytes;
}
export function assertSnapshotEnvelope(input: unknown, limit: number = IMPORTED_SNAPSHOT_LIMITS.envelope): void {
    if (snapshotValueBytes(input) > limit || encoder.encode(JSON.stringify(value(input))).byteLength > limit) tooLarge();
}
export async function assertSnapshotBudget(ctx: Context, reserve: {
    readBytes?: number; readDocs?: number; readCalls?: number; writeBytes?: number; writeDocs?: number;
} = {}): Promise<void> {
    const metrics = await ctx.meta.getTransactionMetrics();
    const checks = [
        [metrics.bytesRead, reserve.readBytes ?? 0, IMPORTED_SNAPSHOT_LIMITS.readBytes],
        [metrics.bytesWritten, reserve.writeBytes ?? 0, IMPORTED_SNAPSHOT_LIMITS.writeBytes],
        [metrics.documentsRead, reserve.readDocs ?? 0, IMPORTED_SNAPSHOT_LIMITS.documents],
        [metrics.documentsWritten, reserve.writeDocs ?? 0, IMPORTED_SNAPSHOT_LIMITS.documents],
        [metrics.databaseQueries, reserve.readCalls ?? 0, IMPORTED_SNAPSHOT_LIMITS.calls],
    ] as const;
    if (checks.some(([metric, extra, limit]) => metric.used + extra > limit || extra > metric.remaining)) tooLarge();
}
export async function verifySnapshotStorage(ctx: Context, files: readonly ImportedSnapshotFile[]): Promise<void> {
    const seen = new Map<string, ImportedSnapshotFile>();
    for (const file of files) if (file.storageId) {
        const previous = seen.get(file.storageId);
        if (previous && (previous.hash !== file.hash || previous.bytes !== file.bytes)) invalid();
        if (previous) continue;
        seen.set(file.storageId, file);
        await assertSnapshotBudget(ctx, { readBytes: 2048, readDocs: 1, readCalls: 1 });
        const metadata = await ctx.db.system.get(file.storageId as Id<'_storage'>);
        if (!metadata || metadata.size !== file.bytes || !storageSha256Matches(metadata.sha256, file.hash)) cloudError('CLOUD_IMPORTED_MEDIA_INVALID');
    }
    await assertSnapshotBudget(ctx);
}

export function snapshotCanonicalJson(input: unknown): string {
    const sort = (item: Value): Value => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, sort(child)])) : item;
    return JSON.stringify(sort(value(input)));
}
