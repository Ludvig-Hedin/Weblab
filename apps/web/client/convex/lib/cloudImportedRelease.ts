import { getConvexSize, getDocumentSize, type Value } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { ImportedMediaProvenance } from '../cloudEditorContentImageSchema';
import { importedMediaManifestHash, validateImportedMediaInventory } from './cloudImportedMedia';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import { cloudError, inlineSourceBytes, MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, MAX_CLOUD_TEXT_BYTES } from './cloudEditor';
import { importSourcePath, MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_BYTES, validateCloudImportManifest } from './cloudImportManifest';
import { hashPreparationPolicy } from './cloudImportedState';
import { assertReleaseText } from './cloudReleasePolicy';
import { requireCap } from './permissions';
import { storageSha256Matches } from './storageHash';
import { IMPORTED_STUDIO_CONFIG_BYTES, IMPORTED_STUDIO_CONFIG_PATH, parseImportedStudioConfig } from './cloudImportedStudioState';

export const IMPORTED_ARTIFACT_PROFILE = 'imported-next-private-v1' as const;
export const IMPORTED_MEDIA_ARTIFACT_PROFILE = 'imported-next-private-v2' as const;
export const IMPORTED_PUBLIC_ARTIFACT_PROFILE = 'imported-next-public-v1' as const;
export const IMPORTED_PUBLICATION_INTENT = 'eligible-public-version' as const;
export type ImportedArtifactPurpose = 'backup' | 'private-artifact' | 'release';
export const importedArtifactProfile = (metadata: ImportedReleaseMetadata, purpose: ImportedArtifactPurpose = 'private-artifact') =>
    purpose === 'release' ? IMPORTED_PUBLIC_ARTIFACT_PROFILE : metadata.version === 2 ? IMPORTED_MEDIA_ARTIFACT_PROFILE : IMPORTED_ARTIFACT_PROFILE;
/** Source artifact format is independent of project profile and retained-media version. */
export function assertImportedArtifactFormat(input: {
    metadata: ImportedReleaseMetadata; purpose: ImportedArtifactPurpose; artifactProfile: unknown; publicationIntent?: unknown;
}): void {
    if (![1, 2].includes(input.metadata.version) || !['backup', 'private-artifact', 'release'].includes(input.purpose) ||
        input.artifactProfile !== importedArtifactProfile(input.metadata, input.purpose) ||
        (input.purpose === 'release' ? input.publicationIntent !== IMPORTED_PUBLICATION_INTENT : input.publicationIntent !== undefined)) invalid();
}
export const IMPORTED_SNAPSHOT_LIMITS = {
    document: 800_000, metadata: 131_072, sourceStage: 4_500_000, originalStage: 1_000_000,
    readBytes: 12_000_000, writeBytes: 6_000_000, documents: 1_400, calls: 512,
    envelope: 6_000_000, sealArgs: 4_900_000,
} as const;
export type ImportedSnapshotFile = { path: string; kind: 'file' | 'directory'; text?: string; storageId?: string; bytes: number; hash: string; media?: ImportedMediaProvenance };
export type ImportedPrivateDerivation = { path: string; kind: 'restore-original' | 'remove-introduced-runtime' | 'remove-introduced-editor-config'; beforeHash: string; afterHash: string | null };
export const importedDerivationVersion = (metadata: ImportedReleaseMetadata) => metadata.studioConfig === undefined ? 1 : 2;
type Context = QueryCtx | MutationCtx;
/** Must precede profile dispatch: completed tombstones deliberately omit profile payloads. */
export function releaseIsRemoving(row: Pick<Doc<'cloudReleases'>, 'removal' | 'removedAt'>): boolean {
    return row.removal !== undefined || row.removedAt !== undefined;
}
export function assertReleaseAvailable(row: Pick<Doc<'cloudReleases'>, 'removal' | 'removedAt'>): void {
    if (releaseIsRemoving(row)) cloudError('CLOUD_RELEASE_REMOVED');
}
const encoder = new TextEncoder();
const validHash = (hash: string) => hash.length === 64 && !/[^a-f0-9]/.test(hash);
function invalid(): never { return cloudError('CLOUD_IMPORTED_ARTIFACT_INVALID'); }
function tooLarge(): never { return cloudError('CLOUD_IMPORTED_SNAPSHOT_TOO_LARGE'); }

/** A tuple identifies retained editor data, never Studio approval. */
function validateStudioConfig(source: readonly ImportedSnapshotFile[], original: readonly ImportedSnapshotFile[], marker: NonNullable<ImportedReleaseMetadata['studioConfig']>): void {
    if (!marker || Object.keys(marker).sort().join(',') !== 'bytes,hash,path' || marker.path !== IMPORTED_STUDIO_CONFIG_PATH ||
        typeof marker.hash !== 'string' || !validHash(marker.hash) || !Number.isSafeInteger(marker.bytes) || marker.bytes < 1 || marker.bytes > IMPORTED_STUDIO_CONFIG_BYTES) invalid();
    const matches = source.filter(file => file.path === marker.path), file = matches[0];
    if (matches.length !== 1 || !file || file.kind !== 'file' || file.text === undefined || file.storageId !== undefined || file.media !== undefined ||
        file.hash !== marker.hash || file.bytes !== marker.bytes || encoder.encode(file.text).byteLength !== marker.bytes ||
        original.some(entry => entry.path === marker.path || entry.path.startsWith(`${marker.path}/`) || marker.path.startsWith(`${entry.path}/`))) invalid();
    try { parseImportedStudioConfig(file.text); } catch { invalid(); }
}

/** Only fresh capture may discover a marker. Frozen legacy snapshots never infer one. */
export function captureImportedStudioConfig(source: readonly ImportedSnapshotFile[], original: readonly ImportedSnapshotFile[]): ImportedReleaseMetadata['studioConfig'] {
    const file = source.find(entry => entry.path === IMPORTED_STUDIO_CONFIG_PATH);
    // A customer-owned original at this path is ordinary source, even if it resembles Studio JSON.
    if (!file || original.some(entry => entry.path === IMPORTED_STUDIO_CONFIG_PATH)) return undefined;
    const marker: NonNullable<ImportedReleaseMetadata['studioConfig']> = { path: IMPORTED_STUDIO_CONFIG_PATH, hash: file.hash, bytes: file.bytes };
    validateStudioConfig(source, original, marker);
    return marker;
}

function validateSnapshotStudioConfig(source: readonly ImportedSnapshotFile[], original: readonly ImportedSnapshotFile[], metadata: ImportedReleaseMetadata): void {
    if (metadata.studioConfig === undefined) return;
    validateStudioConfig(source, original, metadata.studioConfig);
    if (metadata.preparation.policy.pinnedFiles.some(file => file.path === IMPORTED_STUDIO_CONFIG_PATH) ||
        metadata.preparation.instrumentation.some(file => file.path === IMPORTED_STUDIO_CONFIG_PATH)) invalid();
}

export function importedSnapshotsEnabled(): boolean {
    return process.env.WEBLAB_CLOUD_IMPORTED_BACKUPS_ENABLED === 'true' &&
        process.env.WEBLAB_CLOUD_IMPORTS_ENABLED === 'true' && process.env.WEBLAB_CLOUD_EDITOR_ENABLED === 'true';
}
export function requireImportedSnapshotsEnabled(): void {
    if (!importedSnapshotsEnabled()) cloudError('CLOUD_IMPORTED_BACKUPS_DISABLED');
}
export function assertSnapshotActor(actual: Id<'users'>, expected?: Id<'users'>): void {
    if (!expected || actual !== expected) cloudError('CLOUD_ACTOR_CHANGED');
}
export function isImportedRelease(release: Pick<Doc<'cloudReleases'>, 'artifactProfile' | 'imported' | 'purpose' | 'publicationIntent'>): boolean {
    return release.artifactProfile !== undefined || release.imported !== undefined || release.purpose === 'private-artifact' || release.publicationIntent !== undefined;
}
export function importedMetadata(release: Doc<'cloudReleases'>): ImportedReleaseMetadata {
    if (!release.imported || release.revision !== release.imported.capturedRevision || release.importedHosting !== undefined ||
        release.importedHostingRequest !== undefined || release.importedHostingBuildPolicyJson !== undefined) invalid();
    assertImportedArtifactFormat({ metadata: release.imported, purpose: release.purpose, artifactProfile: release.artifactProfile, publicationIntent: release.publicationIntent });
    return release.imported;
}
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
export async function importedInventoryHash(files: readonly ImportedSnapshotFile[]): Promise<string> {
    const tuples = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
        .map(file => [file.path, file.text === undefined ? 'binary' : 'text', file.bytes, file.hash]);
    return digest(JSON.stringify(tuples));
}
async function digest(text: string): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function originalImportFiles(files: readonly ImportedSnapshotFile[]) {
    return files.map(file => ({ path: file.path, kind: file.text === undefined ? 'binary' as const : 'text' as const,
        bytes: file.bytes, hash: file.hash, ...(file.text === undefined ? {} : { text: file.text }) }));
}
export async function validateSnapshotStage(files: readonly ImportedSnapshotFile[], stage: 'source' | 'original' | 'deploy'): Promise<void> {
    if (!files.length || files.length > MAX_CLOUD_FILES || inlineSourceBytes(files) > MAX_CLOUD_INLINE_BYTES) tooLarge();
    const paths = new Set<string>();
    let bytes = 0, documentBytes = 0;
    for (const file of files) {
        importSourcePath(file.path);
        if (paths.has(file.path) || file.kind !== 'file' || !validHash(file.hash) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) invalid();
        paths.add(file.path);
        if (file.text !== undefined) {
            if (file.storageId !== undefined || file.bytes > MAX_CLOUD_TEXT_BYTES || encoder.encode(file.text).byteLength !== file.bytes ||
                new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(encoder.encode(file.text)) !== file.text || await digest(file.text) !== file.hash) invalid();
            assertReleaseText(file.path === '.env.example' ? 'env-example.txt' : file.path, file.text);
        } else if (file.bytes > MAX_IMPORT_ASSET_BYTES || !file.storageId || file.storageId.length > 128 || /[\u0000-\u0020\u007f]/.test(file.storageId)) invalid();
        bytes += file.bytes;
        documentBytes += snapshotDocumentBytes({ ...file, releaseId: 'x'.repeat(128), stage });
    }
    if (bytes > MAX_IMPORT_BYTES || documentBytes > (stage === 'original' ? IMPORTED_SNAPSHOT_LIMITS.originalStage : IMPORTED_SNAPSHOT_LIMITS.sourceStage)) tooLarge();
    for (const path of paths) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) if (paths.has(parts.slice(0, i).join('/'))) invalid();
    }
}
export async function validateImportedReleaseSnapshot({ source, original, metadata }: {
    source: readonly ImportedSnapshotFile[]; original: readonly ImportedSnapshotFile[]; metadata: ImportedReleaseMetadata;
}): Promise<void> {
    snapshotDocumentBytes(metadata, IMPORTED_SNAPSHOT_LIMITS.metadata);
    const p = metadata.preparation;
    if ((metadata.version !== 1 && metadata.version !== 2) || !Number.isSafeInteger(metadata.capturedRevision) || !p ||
        !Number.isSafeInteger(p.inputRevision) || p.inputRevision < 1 || p.preparedRevision !== p.inputRevision + 1 ||
        p.preparedRevision > metadata.capturedRevision || !validHash(metadata.originalManifestHash) ||
        p.inputManifestHash !== metadata.originalManifestHash || !validHash(p.preparedManifestHash) ||
        !Array.isArray(p.instrumentation) || p.instrumentation.length > MAX_CLOUD_FILES ||
        !Array.isArray(p.policy.pinnedFiles) || p.policy.pinnedFiles.length < 7 || p.policy.pinnedFiles.length > 32 ||
        await hashPreparationPolicy(p.policy) !== p.policy.policyHash) invalid();
    await validateSnapshotStage(source, 'source');
    await validateSnapshotStage(original, 'original');
    validateSnapshotStudioConfig(source, original, metadata);
    const manifest = await validateCloudImportManifest(originalImportFiles(original));
    if (manifest.manifestHash !== metadata.originalManifestHash) invalid();
    if (metadata.capturedRevision === p.preparedRevision && await importedInventoryHash(source) !== p.preparedManifestHash) invalid();
    const binary = (files: readonly ImportedSnapshotFile[]) => files.filter(file => file.text === undefined)
        .map(file => [file.path, file.hash, file.bytes, file.storageId]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (metadata.version === 1) {
        if ([...source, ...original].some(file => file.media !== undefined) || JSON.stringify(binary(source)) !== JSON.stringify(binary(original))) invalid();
    } else {
        validateImportedMediaInventory(source, original, metadata.capturedRevision);
        if (!source.some(file => file.media !== undefined) || !validHash(metadata.mediaManifestHash) || await importedMediaManifestHash(source) !== metadata.mediaManifestHash) invalid();
    }
    const sourcePaths = new Map(source.map(file => [file.path, file]));
    const originalPaths = new Map(original.map(file => [file.path, file]));
    const pins = new Set<string>();
    for (const pin of p.policy.pinnedFiles) {
        const file = sourcePaths.get(pin.path);
        if (pins.has(pin.path) || !file || file.text === undefined || file.hash !== pin.hash || file.bytes !== pin.bytes) invalid();
        pins.add(pin.path);
    }
    const paths = new Set<string>(), oids = new Set<string>();
    for (const entry of p.instrumentation) {
        importSourcePath(entry.path);
        if (paths.has(entry.path) || !validHash(entry.afterHash) || (entry.beforeHash !== null && !validHash(entry.beforeHash)) ||
            !Array.isArray(entry.addedOids) || entry.addedOids.length > 8192 || !sourcePaths.has(entry.path) ||
            (entry.beforeHash === null ? originalPaths.has(entry.path) : originalPaths.get(entry.path)?.hash !== entry.beforeHash)) invalid();
        if ((metadata.capturedRevision === p.preparedRevision || pins.has(entry.path)) && sourcePaths.get(entry.path)?.hash !== entry.afterHash) invalid();
        paths.add(entry.path);
        for (const oid of entry.addedOids) {
            if (!oid.length || oid.length > 100 || /[^a-zA-Z0-9_.:-]/.test(oid) || oids.has(oid)) invalid();
            oids.add(oid);
            if (oids.size > 20_000) tooLarge();
        }
    }
}

/** Frozen data authorization deliberately never reads current preparation or source pins. */
export async function importedProjectAccess(ctx: Context, scope: { projectId: Id<'projects'>; branchId: Id<'branches'> }, retained = false) {
    const access = await requireCap(ctx, 'project.update', { projectId: scope.projectId });
    await requireCap(ctx, 'project.view', { projectId: scope.projectId });
    const branch = await ctx.db.get(scope.branchId);
    const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (!state || (!branch && !retained) || (branch && branch.projectId !== scope.projectId) ||
        state.projectId !== scope.projectId || state.workspaceId !== access.workspace._id) invalid();
    const grant = await ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', scope.projectId).eq('userId', access.user._id)).unique();
    const role = grant?.role ?? (state.createdByUserId === access.user._id ? 'responsible' : null);
    if (role !== 'responsible' && role !== 'designer') cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    await assertSnapshotBudget(ctx);
    return { ...access, state, role };
}

export async function retainedImportedAccess(ctx: Context, release: Doc<'cloudReleases'>) {
    assertReleaseAvailable(release);
    importedMetadata(release);
    const project = await ctx.db.get(release.projectId);
    const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).unique();
    if (!project || !state) {
        const access = await requireCap(ctx, 'workspace.update', { workspaceId: release.workspaceId });
        await assertSnapshotBudget(ctx);
        return access;
    }
    if (project.workspaceId !== release.workspaceId || state.projectId !== project._id || state.workspaceId !== release.workspaceId) invalid();
    return importedProjectAccess(ctx, release, true);
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
        if (!metadata || metadata.size !== file.bytes || !storageSha256Matches(metadata.sha256, file.hash)) cloudError('CLOUD_BACKUP_FILE_MISSING');
    }
    await assertSnapshotBudget(ctx);
}

export function snapshotCanonicalJson(input: unknown): string {
    const sort = (item: Value): Value => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, sort(child)])) : item;
    return JSON.stringify(sort(value(input)));
}
export async function importedReleaseSourceHash(files: readonly ImportedSnapshotFile[]): Promise<string> {
    return digest(JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path)).map(({ path, kind, hash, bytes }) => [path, kind, hash, bytes])));
}
/** Independently bind a Node-produced seal to the immutable database capture. */
export async function validateImportedSeal(release: Doc<'cloudReleases'>, stages: {
    source: readonly ImportedSnapshotFile[]; original: readonly ImportedSnapshotFile[]; metadata: ImportedReleaseMetadata;
}, seal: { sourceHash: string; hash: string; artifactJson: string; files: readonly ImportedSnapshotFile[] }): Promise<void> {
    importedMetadata(release);
    await validateImportedReleaseSnapshot(stages);
    if (snapshotCanonicalJson(release.imported) !== snapshotCanonicalJson(stages.metadata)) invalid();
    const publicArtifact = release.purpose === 'release';
    if (seal.files.some(file => file.media !== undefined)) invalid();
    let descriptor: Record<string, unknown>;
    try { descriptor = JSON.parse(seal.artifactJson) as Record<string, unknown>; } catch { return invalid(); }
    if (!descriptor || Array.isArray(descriptor) || Object.keys(descriptor).length !== (publicArtifact ? 11 : 10) ||
        descriptor.version !== stages.metadata.version || descriptor.artifactProfile !== importedArtifactProfile(stages.metadata, release.purpose) || descriptor.purpose !== release.purpose ||
        descriptor.publicEligible !== publicArtifact ||
        (publicArtifact ? descriptor.publicationIntent !== IMPORTED_PUBLICATION_INTENT : descriptor.publicationIntent !== undefined) || descriptor.derivationVersion !== importedDerivationVersion(stages.metadata) || !Array.isArray(descriptor.derivation) ||
        descriptor.sourceHash !== seal.sourceHash || await importedReleaseSourceHash(stages.source) !== seal.sourceHash ||
        descriptor.originalHash !== stages.metadata.originalManifestHash ||
        snapshotCanonicalJson(descriptor.metadata) !== snapshotCanonicalJson(stages.metadata) ||
        snapshotCanonicalJson(descriptor) !== seal.artifactJson || await digest(seal.artifactJson) !== seal.hash) invalid();
    if (release.purpose === 'backup') {
        if (seal.files.length || descriptor.deployHash !== null || descriptor.derivation.length) invalid();
    } else {
        if (!['private-artifact', 'release'].includes(release.purpose) || descriptor.deployHash !== await importedReleaseSourceHash(seal.files)) invalid();
        const expected = deriveImportedPrivateFiles(stages.source, stages.original, stages.metadata);
        const clean = (file: ImportedSnapshotFile) => ({ path: file.path, kind: file.kind, hash: file.hash, bytes: file.bytes, text: file.text, storageId: file.storageId });
        const files = [...seal.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(clean);
        if (snapshotCanonicalJson(files) !== snapshotCanonicalJson(expected.files.map(clean)) ||
            snapshotCanonicalJson(descriptor.derivation) !== snapshotCanonicalJson(expected.derivation)) invalid();
    }
}

/** The only admitted source-to-private-artifact transformation, shared across runtimes. */
export function deriveImportedPrivateFiles(source: readonly ImportedSnapshotFile[], original: readonly ImportedSnapshotFile[], metadata: ImportedReleaseMetadata) {
    validateSnapshotStudioConfig(source, original, metadata);
    const originals = new Map(original.map(file => [file.path, file]));
    const current = new Map(source.map(file => [file.path, file]));
    const pins = new Map(metadata.preparation.policy.pinnedFiles.map(pin => [pin.path, pin]));
    const receipts = new Map(metadata.preparation.instrumentation.map(row => [row.path, row]));
    const clean = (file: ImportedSnapshotFile): ImportedSnapshotFile => ({ path: file.path, kind: file.kind, hash: file.hash, bytes: file.bytes,
        ...(file.text === undefined ? {} : { text: file.text }), ...(file.storageId === undefined ? {} : { storageId: file.storageId }) });
    const files = new Map(source.map(file => [file.path, clean(file)]));
    const derivation: ImportedPrivateDerivation[] = [];
    const layouts = source.filter(file => /^(?:src\/)?app\/layout\.tsx$/.test(file.path));
    if (layouts.length !== 1) invalid();
    const layout = layouts[0]!;
    for (const path of [layout.path, 'next.config.ts', 'next-env.d.ts']) {
        const before = originals.get(path), after = current.get(path), pin = pins.get(path), receipt = receipts.get(path);
        if (!before || !after || !pin || before.text === undefined || after.text === undefined || after.hash !== pin.hash || after.bytes !== pin.bytes) invalid();
        if (!receipt) {
            if (path !== 'next-env.d.ts' || before.hash !== after.hash || before.bytes !== after.bytes) invalid();
            continue;
        }
        if (receipt.beforeHash !== before.hash || receipt.afterHash !== after.hash ||
            (path === layout.path && !receipt.bootstrapChanges) || (path !== layout.path && receipt.addedOids.length)) invalid();
        files.set(path, clean(before));
        derivation.push({ path, kind: 'restore-original', beforeHash: after.hash, afterHash: before.hash });
    }
    for (const path of ['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js']) {
        const after = current.get(path), pin = pins.get(path), receipt = receipts.get(path);
        if (originals.has(path) || !after || after.text === undefined || !pin || !receipt || receipt.beforeHash !== null ||
            receipt.afterHash !== after.hash || after.hash !== pin.hash || after.bytes !== pin.bytes || !receipt.bootstrapChanges || receipt.addedOids.length) invalid();
        files.delete(path);
        derivation.push({ path, kind: 'remove-introduced-runtime', beforeHash: after.hash, afterHash: null });
    }
    if (metadata.studioConfig !== undefined) {
        files.delete(IMPORTED_STUDIO_CONFIG_PATH);
        derivation.push({ path: IMPORTED_STUDIO_CONFIG_PATH, kind: 'remove-introduced-editor-config', beforeHash: metadata.studioConfig.hash, afterHash: null });
    }
    const compare = (a: { path: string }, b: { path: string }) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    return { files: [...files.values()].sort(compare), derivation: derivation.sort(compare) };
}
