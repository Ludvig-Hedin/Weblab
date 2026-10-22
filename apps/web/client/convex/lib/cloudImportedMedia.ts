import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { ImportedImageApproval, ImportedMediaAsset, ImportedMediaProvenance } from '../cloudEditorContentImageSchema';
import { assertOperationId, cloudError, MAX_CLOUD_FILES } from './cloudEditor';
import { importSourcePath } from './cloudImportManifest';
import { assertSnapshotBudget, snapshotCanonicalJson, snapshotDocumentBytes, verifySnapshotStorage, type ImportedSnapshotFile } from './cloudImportedRelease';

type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
const hashPattern = /^[a-f0-9]{64}$/;
function validHash(value: string): boolean { return value.length === 64 && hashPattern.test(value); }
function invalid(): never { return cloudError('CLOUD_IMPORTED_MEDIA_INVALID'); }
function positive(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function id(value: string): boolean { return value.length > 0 && value.length <= 128 && !/[\u0000-\u0020\u007f]/.test(value); }
async function digest(value: unknown): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotCanonicalJson(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function assertImportedMediaAsset(asset: ImportedMediaAsset): void {
    if (!validHash(asset.hash) || asset.path !== `public/weblab-upload-${asset.hash}.webp` || !id(asset.storageId) ||
        asset.mime !== 'image/webp' || !positive(asset.bytes) || asset.bytes > 600_000 || !positive(asset.width) || !positive(asset.height) ||
        asset.width > 8192 || asset.height > 8192 || asset.width * asset.height > 16_000_000) invalid();
}
export function assertImportedImageApproval(approval: ImportedImageApproval): void {
    importSourcePath(approval.ownerPath);
    if (!approval.bindingId.length || approval.bindingId.length > 100 || /[^A-Za-z0-9_.:-]/.test(approval.bindingId) ||
        !positive(approval.generation) || !positive(approval.designRevision) || !validHash(approval.fingerprint)) invalid();
}
export function assertImportedMediaProvenance(media: ImportedMediaProvenance, capturedRevision: number): void {
    assertImportedMediaAsset(media.asset);
    const origin = media.origin;
    if (media.version !== 1 || origin.version !== 1 || !positive(origin.sourceRevision) || origin.sourceRevision > capturedRevision) invalid();
    if (origin.kind === 'upload') {
        assertImportedImageApproval(origin.approval);
        assertOperationId(origin.operationId);
        if (!id(origin.actorId) || !id(origin.attemptId) || origin.approval.designRevision >= origin.sourceRevision) invalid();
    } else if (origin.kind !== 'restore' || !id(origin.backupId) || !validHash(origin.frozenProvenanceHash)) invalid();
    snapshotDocumentBytes(media, 4096);
}
export const importedMediaProvenanceHash = (media: ImportedMediaProvenance) => digest(media);
export const importedImageApprovalIdentity = (scope: Scope, approval: ImportedImageApproval) => digest({ projectId: scope.projectId, branchId: scope.branchId, ...approval });
export async function importedMediaManifestHash(files: readonly ImportedSnapshotFile[]): Promise<string> {
    return digest(files.filter(file => file.media !== undefined).map(file => [file.path, file.media] as const)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function sameTuple(file: ImportedSnapshotFile, asset: ImportedMediaAsset): boolean {
    return file.kind === 'file' && file.text === undefined && file.path === asset.path && file.hash === asset.hash &&
        file.bytes === asset.bytes && file.storageId === asset.storageId;
}
/** Original equality remains exact. Every extra binary needs exactly one frozen ownership record. */
export function validateImportedMediaInventory(source: readonly ImportedSnapshotFile[], original: readonly ImportedSnapshotFile[], capturedRevision: number): void {
    const originals = new Map(original.map(file => [file.path, file]));
    const current = new Map(source.map(file => [file.path, file]));
    for (const file of original) {
        if (file.media !== undefined) invalid();
        if (file.text === undefined) {
            const next = current.get(file.path);
            if (!next || next.text !== undefined || next.kind !== file.kind || next.hash !== file.hash || next.bytes !== file.bytes || next.storageId !== file.storageId || next.media !== undefined) invalid();
        }
    }
    for (const file of source) {
        if (file.media !== undefined) {
            if (originals.has(file.path) || !sameTuple(file, file.media.asset)) invalid();
            assertImportedMediaProvenance(file.media, capturedRevision);
        } else if (file.text === undefined && (!originals.has(file.path) || originals.get(file.path)!.text !== undefined)) invalid();
    }
}
/** Capture ownership in the same transaction as source. Admissions are deliberately not read. */
export async function freezeImportedMedia(ctx: QueryCtx | MutationCtx, scope: Scope, source: readonly ImportedSnapshotFile[], original: readonly ImportedSnapshotFile[], revision: number) {
    await assertSnapshotBudget(ctx, { readDocs: MAX_CLOUD_FILES + 1, readBytes: (MAX_CLOUD_FILES + 1) * 4096, readCalls: 1 });
    const rows = await ctx.db.query('cloudEditorImportedMedia').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).take(MAX_CLOUD_FILES + 1);
    if (rows.length > MAX_CLOUD_FILES) invalid();
    const byPath = new Map<string, ImportedMediaProvenance>();
    for (const row of rows) {
        if (row.projectId !== scope.projectId || row.branchId !== scope.branchId || byPath.has(row.asset.path)) invalid();
        byPath.set(row.asset.path, { version: row.version, asset: row.asset, origin: row.origin });
    }
    const files = source.map(file => ({ ...file, ...(byPath.has(file.path) ? { media: byPath.get(file.path)! } : {}) }));
    if (files.filter(file => file.media !== undefined).length !== rows.length) invalid();
    validateImportedMediaInventory(files, original, revision);
    return { files, mediaManifestHash: rows.length ? await importedMediaManifestHash(files) : null };
}
/** Only a future authorized image-v2 commit may call this after resolving its current exact binding and signed image proof.
 * Source file insertion, this helper, the separate operation receipt and revision patch must be one mutation.
 * It never authenticates a caller or turns a historical ownership receipt into an approval. */
export async function recordImportedMediaUpload(ctx: MutationCtx, input: Scope & {
    expectedRevision: number; approval: ImportedImageApproval; asset: ImportedMediaAsset;
    actorId: Id<'users'>; attemptId: Id<'cloudEditorContentImageAttempts'>; operationId: string;
}): Promise<void> {
    const { approval, asset } = input;
    assertImportedMediaAsset(asset); assertImportedImageApproval(approval); assertOperationId(input.operationId);
    const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', input.branchId)).unique();
    const contract = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', input.branchId).eq('path', approval.ownerPath)).unique();
    const binding = contract?.imageBindings?.filter(row => row.bindingId === approval.bindingId);
    if (!state || state.projectId !== input.projectId || state.profile !== 'imported-next-v1' || state.revision !== input.expectedRevision || state.designRevision !== approval.designRevision ||
        !contract || contract.projectId !== input.projectId || !contract.active || contract.version !== 2 || contract.generation !== approval.generation ||
        contract.designRevision !== approval.designRevision || contract.fingerprint !== approval.fingerprint || contract.bindings.length || contract.textBindings?.length ||
        binding?.length !== 1 || !binding[0]!.allowImageUploads || !binding[0]!.fields.includes('src') ||
        asset.width * binding[0]!.aspectRatio.height !== asset.height * binding[0]!.aspectRatio.width) invalid();
    const preparation = state.preparationId ? await ctx.db.get(state.preparationId) : null;
    const baseline = preparation ? await ctx.db.get(preparation.baselineAttemptId) : null;
    if (!baseline || baseline.projectId !== input.projectId || baseline.branchId !== input.branchId || baseline.files.some(file => file.path === asset.path)) invalid();
    const file = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', input.branchId).eq('path', asset.path)).unique();
    if (!file || file.projectId !== input.projectId || !sameTuple(file, asset)) invalid();
    await verifySnapshotStorage(ctx, [file]);
    const existing = await ctx.db.query('cloudEditorImportedMedia').withIndex('by_branchId_and_path', q => q.eq('branchId', input.branchId).eq('asset.path', asset.path)).unique();
    if (existing && (existing.projectId !== input.projectId || snapshotCanonicalJson(existing.asset) !== snapshotCanonicalJson(asset))) invalid();
    if (existing) assertImportedMediaProvenance(existing, input.expectedRevision);
    const approvalIdentity = await importedImageApprovalIdentity(input, approval);
    const admissions = await ctx.db.query('cloudEditorImportedImageAdmissions').withIndex('by_branchId_and_approvalIdentity', q => q.eq('branchId', input.branchId).eq('approvalIdentity', approvalIdentity)).take(65);
    if (admissions.length > 64 || new Set(admissions.map(row => row.asset.path)).size !== admissions.length || admissions.some(row => row.projectId !== input.projectId || snapshotCanonicalJson(row.approval) !== snapshotCanonicalJson(approval))) invalid();
    for (const row of admissions) assertImportedMediaAsset(row.asset);
    const admitted = admissions.find(row => row.asset.path === asset.path);
    if (admitted && snapshotCanonicalJson(admitted.asset) !== snapshotCanonicalJson(asset)) invalid();
    if (!admitted && admissions.length === 64) cloudError('CLOUD_IMPORTED_IMAGE_ADMISSION_LIMIT');
    const scope = { projectId: input.projectId, branchId: input.branchId };
    const origin = { version: 1 as const, kind: 'upload' as const, actorId: input.actorId, attemptId: input.attemptId, operationId: input.operationId, approval, sourceRevision: input.expectedRevision + 1 };
    const ownership = { ...scope, version: 1 as const, asset, origin };
    assertImportedMediaProvenance(ownership, origin.sourceRevision);
    const admission = { ...scope, approval, approvalIdentity, asset, actorId: input.actorId, attemptId: input.attemptId, operationId: input.operationId, sourceRevision: origin.sourceRevision };
    await assertSnapshotBudget(ctx, { writeDocs: Number(!existing) + Number(!admitted), writeBytes: (existing ? 0 : snapshotDocumentBytes(ownership)) + (admitted ? 0 : snapshotDocumentBytes(admission)) });
    if (!existing) await ctx.db.insert('cloudEditorImportedMedia', ownership);
    if (!admitted) await ctx.db.insert('cloudEditorImportedImageAdmissions', admission);
    await assertSnapshotBudget(ctx);
}
/** Bounded new origin, not recursive ancestry and never copied target permission. */
export async function restoredImportedMedia(source: readonly ImportedSnapshotFile[], backupId: Id<'cloudReleases'>, sourceRevision: number): Promise<ImportedMediaProvenance[]> {
    return Promise.all(source.flatMap(file => file.media ? [file.media] : []).map(async media => ({
        version: 1 as const, asset: media.asset, origin: { version: 1 as const, kind: 'restore' as const, backupId,
            frozenProvenanceHash: await importedMediaProvenanceHash(media), sourceRevision },
    })));
}

/** A positive match is only an asset-choice check after the caller revalidates current authority. */
export async function hasImportedImageAdmission(ctx: QueryCtx | MutationCtx, scope: Scope, approval: ImportedImageApproval, asset: ImportedMediaAsset): Promise<boolean> {
    assertImportedImageApproval(approval); assertImportedMediaAsset(asset);
    const approvalIdentity = await importedImageApprovalIdentity(scope, approval);
    const rows = await ctx.db.query('cloudEditorImportedImageAdmissions').withIndex('by_branchId_and_approvalIdentity', q => q.eq('branchId', scope.branchId).eq('approvalIdentity', approvalIdentity)).take(65);
    if (rows.length > 64 || new Set(rows.map(row => row.asset.path)).size !== rows.length) invalid();
    for (const row of rows) {
        if (row.projectId !== scope.projectId || snapshotCanonicalJson(row.approval) !== snapshotCanonicalJson(approval)) invalid();
        assertImportedMediaAsset(row.asset);
    }
    const row = rows.find(row => row.asset.path === asset.path);
    return row !== undefined && snapshotCanonicalJson(row.asset) === snapshotCanonicalJson(asset);
}

/** Scoped asset facts only. Callers must establish actor, prepared profile and current approval separately. */
export async function readImportedImageAsset(ctx: QueryCtx | MutationCtx, input: Scope & {
    preparationId: Id<'cloudEditorImportPreparations'>; revision: number; path: string; expectedHash?: string;
}) {
    importSourcePath(input.path);
    if (!/^public\/.+\.(?:png|jpe?g|webp)$/i.test(input.path)) invalid();
    await assertSnapshotBudget(ctx, { readCalls: 5, readDocs: 5, readBytes: 850_000 });
    const file = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', input.branchId).eq('path', input.path)).unique();
    if (!file || file.projectId !== input.projectId || file.kind !== 'file' || file.text !== undefined || !file.storageId ||
        !validHash(file.hash) || !positive(file.bytes) || file.bytes > 32 * 1024 * 1024 || (input.expectedHash !== undefined && input.expectedHash !== file.hash)) invalid();
    const prep = await ctx.db.get(input.preparationId);
    const original = prep ? await ctx.db.get(prep.baselineAttemptId) : null;
    if (!prep || prep.projectId !== input.projectId || prep.branchId !== input.branchId || !original || original.projectId !== input.projectId ||
        original.branchId !== input.branchId || original.state !== 'finalized' || original.manifestHash !== prep.baselineManifestHash) invalid();
    const matches = original.files.map((row, index) => ({ row, index })).filter(({ row }) => row.path === input.path);
    let media: ImportedMediaProvenance | null = null;
    if (matches.length) {
        if (matches.length !== 1) invalid();
        const { row, index } = matches[0]!;
        const receipt = await ctx.db.query('cloudEditorImportFiles').withIndex('by_attemptId_index', q => q.eq('attemptId', original._id).eq('index', index)).unique();
        if (row.kind !== 'binary' || row.hash !== file.hash || row.bytes !== file.bytes || !receipt || receipt.state !== 'received' ||
            !receipt.valid || receipt.collectedAt !== undefined || receipt.path !== file.path || receipt.hash !== file.hash ||
            receipt.bytes !== file.bytes || receipt.storageId !== file.storageId) invalid();
    } else {
        const owned = await ctx.db.query('cloudEditorImportedMedia').withIndex('by_branchId_and_path', q => q.eq('branchId', input.branchId).eq('asset.path', file.path)).unique();
        if (!owned || owned.projectId !== input.projectId || !sameTuple(file, owned.asset)) invalid();
        assertImportedMediaProvenance(owned, input.revision);
        media = { version: owned.version, asset: owned.asset, origin: owned.origin };
    }
    await verifySnapshotStorage(ctx, [file]);
    return { file, media };
}
