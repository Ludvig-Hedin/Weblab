import { assertContentCloudProfile, isImportedCloudProfile } from './lib/cloudImportManifest';
import { makeFunctionReference } from 'convex/server';
import { v, type Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { cloudImageTarget, cloudImageV2Pin, cloudImageValue, type CloudImageV2Pin } from './cloudEditorContentImageSchema';
import { contentBinding, contentImageBinding } from './cloudEditorContentSchema';
import { assertCloudRevision, assertOperationId, cloudError, MAX_CLOUD_FILES, MAX_CLOUD_PROJECT_BYTES, MAX_CLOUD_INLINE_BYTES, inlineSourceBytes } from './lib/cloudEditor';
import { requireCloudProjectCapability } from './lib/cloudProjectAdmission';
import { assertImportedTextChanges } from './lib/cloudImportedState';
import { MAX_IMPORT_BYTES } from './lib/cloudImportManifest';
import { assertSnapshotBudget, snapshotCanonicalJson, snapshotDocumentBytes } from './lib/cloudImportedRelease';
import { assertImportedImageApproval, assertImportedMediaAsset, hasImportedImageAdmission, importedImageApprovalIdentity, readImportedImageAsset, recordImportedMediaUpload } from './lib/cloudImportedMedia';
import { storageSha256Matches } from './lib/storageHash';
const DAY = 86_400_000;
const collectRef = makeFunctionReference<'mutation', { attemptId: Id<'cloudEditorContentImageAttempts'> }, null>('cloudEditorContentImages:_collect');
type Target = { projectId: Id<'projects'>; branchId: Id<'branches'>; actorId: Id<'users'>; path: string; oid: string; expectedRevision: number; generation: number };
async function admitted(ctx: MutationCtx | QueryCtx, target: Target) {
    const access = await requireCloudAccess(ctx, target, 'content');
    if (isImportedCloudProfile(access.state.profile)) cloudError('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
    assertContentCloudProfile(access.state.profile);
    if (access.user._id !== target.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    assertCloudRevision(target.expectedRevision);
    const contract = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', target.branchId).eq('path', target.path)).unique();
    const binding = contract?.bindings.find(b => b.oid === target.oid);
    if (!contract || contract.version !== 1 || contract.projectId !== target.projectId || !contract.active || contract.generation !== target.generation || !binding?.fields.includes('src') || !binding.allowImageUploads) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    return { ...access, contract };
}
async function owned(ctx: MutationCtx | QueryCtx, attemptId: Id<'cloudEditorContentImageAttempts'>) {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt || 'version' in attempt) return cloudError('CLOUD_INVALID_UPLOAD');
    const access = await requireCloudAccess(ctx, attempt, 'content');
    if (isImportedCloudProfile(access.state.profile)) cloudError('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
    assertContentCloudProfile(access.state.profile);
    if (access.user._id !== attempt.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    return { attempt, ...access };
}
export const reserve = mutation({
    args: { ...cloudImageTarget, operationId: v.string() },
    handler: async (ctx, args) => {
        const { state } = await admitted(ctx, args);
        assertOperationId(args.operationId);
        if (state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
        const previous = await ctx.db.query('cloudEditorContentImageAttempts').withIndex('by_branchId_and_operationId', q => q.eq('branchId', args.branchId).eq('operationId', args.operationId)).unique();
        if (previous) cloudError('CLOUD_INVALID_UPLOAD');
        const recent = await ctx.db.query('cloudEditorContentImageAttempts').withIndex('by_projectId_and_createdAt', q => q.eq('projectId', args.projectId).gte('createdAt', Date.now() - DAY)).take(21);
        if (recent.length >= 20 || recent.filter(row => row.status === 'open' || row.status === 'ready').length >= 4) cloudError('CLOUD_UPLOAD_LIMIT');
        const attemptId = await ctx.db.insert('cloudEditorContentImageAttempts', { ...args, status: 'open', createdAt: Date.now(), expiresAt: Date.now() + DAY });
        await ctx.scheduler.runAfter(DAY, collectRef, { attemptId });
        return attemptId;
    },
});
/** Failed decoding releases the active slot but keeps its daily budget charge. */
export const cancelPreparation = mutation({ args: { attemptId: v.id('cloudEditorContentImageAttempts') }, handler: async (ctx, { attemptId }) => {
    const { attempt } = await owned(ctx, attemptId);
    if (attempt.status === 'open' || attempt.status === 'ready') await ctx.db.patch(attemptId, { status: 'closed' });
    return null;
}});
export const _preparation = internalQuery({ args: { attemptId: v.id('cloudEditorContentImageAttempts') }, handler: async (ctx, { attemptId }) => {
    const { attempt } = await owned(ctx, attemptId);
    const { state } = await admitted(ctx, attempt);
    if (attempt.expiresAt <= Date.now() || !['open', 'ready'].includes(attempt.status)) cloudError('CLOUD_UPLOAD_EXPIRED');
    if (state.revision !== attempt.expectedRevision) cloudError('CLOUD_CONFLICT');
    return attempt;
}});
/** Storage registration is separate from authorization: even a revoked attempt retains its own GC handle. */
export const _ready = internalMutation({ args: { attemptId: v.id('cloudEditorContentImageAttempts'), storageId: v.id('_storage'), hash: v.string(), bytes: v.number(), assetPath: v.string() }, handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || 'version' in attempt || attempt.storageId || attempt.status !== 'open') return false;
    const blob = await ctx.db.system.get(args.storageId);
    if (!blob || blob.size !== args.bytes || args.bytes > 600_000 || args.assetPath !== `public/weblab-upload-${args.hash}.webp` || !/^[a-f0-9]{64}$/.test(args.hash)) return false;
    await ctx.db.patch(attempt._id, { storageId: args.storageId, hash: args.hash, bytes: args.bytes, assetPath: args.assetPath, status: 'ready' });
    return true;
}});
export const _input = internalQuery({ args: { attemptId: v.id('cloudEditorContentImageAttempts'), operationId: v.string(), fingerprint: v.string() }, handler: async (ctx, args) => {
    const { attempt, state } = await owned(ctx, args.attemptId);
    assertOperationId(args.operationId);
    const receipt = await ctx.db.query('cloudEditorOperations').withIndex('by_branchId_operationId', q => q.eq('branchId', attempt.branchId).eq('operationId', args.operationId)).unique();
    if (receipt) {
        if (receipt.projectId !== attempt.projectId || receipt.userId !== attempt.actorId || receipt.fingerprint !== args.fingerprint) cloudError('CLOUD_INVALID_OPERATION');
        return { receipt: { revision: receipt.revision, currentRevision: state.revision }, snapshot: null };
    }
    const { contract } = await admitted(ctx, attempt);
    if (state.revision !== attempt.expectedRevision) cloudError('CLOUD_CONFLICT');
    if (attempt.status !== 'ready' || attempt.expiresAt <= Date.now() || !attempt.storageId || !attempt.assetPath || !attempt.hash) cloudError('CLOUD_UPLOAD_EXPIRED');
    const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', attempt.branchId)).take(MAX_CLOUD_FILES + 1);
    if (files.length > MAX_CLOUD_FILES || files.some(f => f.projectId !== attempt.projectId)) cloudError('CLOUD_FILE_LIMIT');
    return { receipt: null, snapshot: { attempt, contract, files } };
}});
export const _commit = internalMutation({ args: {
    attemptId: v.id('cloudEditorContentImageAttempts'), operationId: v.string(), fingerprint: v.string(),
    source: v.string(), sourceHash: v.string(), contractFingerprint: v.string(), nextFingerprint: v.string(), bindings: v.array(contentBinding),
}, handler: async (ctx, args) => {
    const { attempt, state } = await owned(ctx, args.attemptId);
    const previous = await ctx.db.query('cloudEditorOperations').withIndex('by_branchId_operationId', q => q.eq('branchId', attempt.branchId).eq('operationId', args.operationId)).unique();
    if (previous) {
        if (previous.projectId !== attempt.projectId || previous.userId !== attempt.actorId || previous.fingerprint !== args.fingerprint) cloudError('CLOUD_INVALID_OPERATION');
        return { revision: previous.revision, currentRevision: state.revision };
    }
    const { contract } = await admitted(ctx, attempt);
    if (state.revision !== attempt.expectedRevision) cloudError('CLOUD_CONFLICT');
    if (contract.fingerprint !== args.contractFingerprint) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    if (attempt.status !== 'ready' || attempt.expiresAt <= Date.now() || !attempt.storageId || !attempt.assetPath || !attempt.hash || !attempt.bytes) cloudError('CLOUD_UPLOAD_EXPIRED');
    const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', attempt.branchId)).take(MAX_CLOUD_FILES + 1);
    const source = files.find(f => f.path === attempt.path);
    const asset = files.find(f => f.path === attempt.assetPath);
    if (!source || source.kind !== 'file' || source.storageId || typeof source.text !== 'string' || files.some(f => f.projectId !== attempt.projectId)) cloudError('CLOUD_CONTENT_INVALID_TARGET');
    if (asset && (asset.kind !== 'file' || asset.hash !== attempt.hash || asset.bytes !== attempt.bytes || !asset.storageId)) cloudError('CLOUD_CONFLICT');
    const bytes = new TextEncoder().encode(args.source).byteLength;
    const total = state.bytes - source.bytes + bytes + (asset ? 0 : attempt.bytes);
    if (!Number.isSafeInteger(total) || total < 0 || total > MAX_CLOUD_PROJECT_BYTES || files.length + (asset ? 0 : 1) > MAX_CLOUD_FILES || inlineSourceBytes(files.map(f => f._id === source._id ? { text: args.source } : f)) > MAX_CLOUD_INLINE_BYTES) cloudError('CLOUD_PROJECT_TOO_LARGE');
    const revision = state.revision + 1;
    assertCloudRevision(revision);
    await ctx.db.patch(source._id, { text: args.source, hash: args.sourceHash, bytes });
    if (!asset) await ctx.db.insert('cloudEditorFiles', { projectId: attempt.projectId, branchId: attempt.branchId, path: attempt.assetPath, kind: 'file', storageId: attempt.storageId, hash: attempt.hash, bytes: attempt.bytes });
    await ctx.db.patch(contract._id, { bindings: args.bindings, fingerprint: args.nextFingerprint });
    await ctx.db.patch(state._id, { revision, bytes: total, fileCount: files.length + (asset ? 0 : 1), updatedAt: Date.now() });
    await ctx.db.patch(attempt._id, { status: 'committed', expiresAt: Date.now() + 31 * DAY });
    await ctx.db.insert('cloudEditorOperations', { projectId: attempt.projectId, branchId: attempt.branchId, userId: attempt.actorId, operationId: args.operationId, fingerprint: args.fingerprint, revision, storageIds: [attempt.storageId], createdAt: Date.now() });
    await ctx.db.patch(attempt.projectId, { updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, makeFunctionReference<'action', { projectId: Id<'projects'>; branchId: Id<'branches'> }, null>('cloudEditorRuntime:sync'), { projectId: attempt.projectId, branchId: attempt.branchId });
    return { revision, currentRevision: revision };
}});
/** Storage, source and release-reference checks share one transaction. */
export const _collect = internalMutation({ args: { attemptId: v.id('cloudEditorContentImageAttempts') }, handler: async (ctx, { attemptId }) => {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt) return null;
    if (attempt.expiresAt > Date.now()) { await ctx.scheduler.runAfter(attempt.expiresAt - Date.now(), collectRef, { attemptId }); return null; }
    const storageId = attempt.storageId;
    if (!storageId) { await ctx.db.delete(attemptId); return null; }
    const source = await ctx.db.query('cloudEditorFiles').withIndex('by_storageId', q => q.eq('storageId', storageId)).first();
    const release = await ctx.db.query('cloudReleaseAssets').withIndex('by_storageId', q => q.eq('storageId', storageId)).first();
    if (source || release) {
        await ctx.db.patch(attemptId, { status: 'closed', expiresAt: Date.now() + DAY });
        await ctx.scheduler.runAfter(DAY, collectRef, { attemptId });
    } else {
        await ctx.storage.delete(storageId);
        await ctx.db.delete(attemptId);
    }
    return null;
}});

export const sweep = internalMutation({ args: {}, handler: async (ctx) => {
    const due = await ctx.db.query('cloudEditorContentImageAttempts').withIndex('by_expiresAt', q => q.lte('expiresAt', Date.now())).take(50);
    for (const row of due) await ctx.scheduler.runAfter(0, collectRef, { attemptId: row._id });
    return null;
}});

// Imported image v2 is explicit. Legacy entry points above never accept these attempts.
type ScopeV2 = { projectId: Id<'projects'>; branchId: Id<'branches'>; actorId: Id<'users'> };
type ContextV2 = MutationCtx | QueryCtx;
const scopeV2 = { projectId: v.id('projects'), branchId: v.id('branches'), actorId: v.id('users') };
const imageKind = v.union(v.object({ kind: v.literal('values') }), v.object({ kind: v.literal('upload'), attemptId: v.id('cloudEditorContentImageAttempts') }));
const operationV2 = { ...scopeV2, expectedRevision: v.number(), operationId: v.string(), fingerprint: v.string(), pin: cloudImageV2Pin, image: imageKind };
function imageFamily(row: Doc<'cloudEditorContentContracts'>): boolean { return row.version === 2 && !!row.imageBindings?.length && !row.textBindings?.length && !row.bindings.length; }
function generationV2(value: number, zero = false): void { if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value >= Number.MAX_SAFE_INTEGER) cloudError('CLOUD_CONTENT_INVALID_GENERATION'); }
function hashV2(value: string): void { if (value.length !== 64 || /[^a-f0-9]/.test(value)) cloudError('CLOUD_INVALID_OPERATION'); }
async function digestV2(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join(''); }
/** Receipt visibility needs ordinary access, not a still-enabled image gate or grant. */
async function ordinaryV2(ctx: ContextV2, scope: ScopeV2) {
    const access = await requireCloudProjectCapability(ctx, scope);
    if (access.user._id !== scope.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    const branch = await ctx.db.get(scope.branchId);
    const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (!branch || branch.projectId !== scope.projectId || !state || state.projectId !== scope.projectId || state.workspaceId !== access.workspace._id) return cloudError('CLOUD_NOT_ENROLLED');
    return { ...access, state };
}
async function accessV2(ctx: ContextV2, scope: ScopeV2, revision?: number, designer = false) {
    if (process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true' || process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED !== 'true' || process.env.WEBLAB_CLOUD_IMPORTED_IMAGES_ENABLED !== 'true') cloudError('CLOUD_IMPORTED_IMAGES_DISABLED');
    const access = await requireCloudAccess(ctx, scope);
    if (access.user._id !== scope.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    if (access.state.profile !== 'imported-next-v1') cloudError('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
    if (!access.role || (designer && !access.canDesign)) cloudError('CLOUD_ROLE_REQUIRED');
    if (!access.preparation || !access.importedAuthority || access.importedAuthority.designRevision !== access.state.designRevision) return cloudError('CLOUD_IMPORT_PREPARATION_INVALID');
    if (revision !== undefined) { assertCloudRevision(revision); if (access.state.revision !== revision) cloudError('CLOUD_CONFLICT'); }
    return { ...access, preparation: access.preparation, designRevision: access.importedAuthority.designRevision };
}
async function rowV2(ctx: ContextV2, scope: ScopeV2, path: string) {
    const row = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', scope.branchId).eq('path', path)).unique();
    if (row && row.projectId !== scope.projectId) cloudError('CLOUD_NOT_ENROLLED');
    return row;
}
async function filesV2(ctx: ContextV2, scope: ScopeV2) {
    await assertSnapshotBudget(ctx, { readBytes: 4_500_000, readDocs: MAX_CLOUD_FILES + 1, readCalls: 1 });
    const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', scope.branchId)).take(MAX_CLOUD_FILES + 1);
    if (!files.length || files.length > MAX_CLOUD_FILES || files.some(file => file.projectId !== scope.projectId)) cloudError('CLOUD_FILE_LIMIT');
    return files;
}
function approvalV2(pin: CloudImageV2Pin) { return { ownerPath: pin.path, bindingId: pin.binding.bindingId, generation: pin.generation, designRevision: pin.designRevision, fingerprint: pin.fingerprint }; }
async function pinV2(ctx: ContextV2, scope: ScopeV2, pin: CloudImageV2Pin, epoch: number, upload = false) {
    assertImportedImageApproval(approvalV2(pin));
    const row = await rowV2(ctx, scope, pin.path);
    const matches = row?.imageBindings?.filter(binding => binding.bindingId === pin.binding.bindingId);
    if (pin.version !== 2 || !row || !imageFamily(row) || !row.active || row.generation !== pin.generation || row.designRevision !== epoch || pin.designRevision !== epoch ||
        row.fingerprint !== pin.fingerprint || matches?.length !== 1 || snapshotCanonicalJson(matches[0]) !== snapshotCanonicalJson(pin.binding) ||
        (upload && (!pin.binding.allowImageUploads || !pin.binding.fields.includes('src')))) return cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    return row;
}
async function receiptV2(ctx: ContextV2, args: ScopeV2 & { operationId: string; fingerprint: string }) {
    const { state } = await ordinaryV2(ctx, args); assertOperationId(args.operationId); hashV2(args.fingerprint);
    const row = await ctx.db.query('cloudEditorOperations').withIndex('by_branchId_operationId', q => q.eq('branchId', args.branchId).eq('operationId', args.operationId)).unique();
    if (row && (row.projectId !== args.projectId || row.userId !== args.actorId || row.fingerprint !== args.fingerprint)) cloudError('CLOUD_INVALID_OPERATION');
    return row ? { revision: row.revision, currentRevision: state.revision } : null;
}
async function assetV2(ctx: ContextV2, scope: ScopeV2, access: Awaited<ReturnType<typeof accessV2>>, path: string, expectedHash?: string) {
    return readImportedImageAsset(ctx, { ...scope, preparationId: access.preparation._id, revision: access.state.revision, path, expectedHash });
}
async function admittedAssetV2(ctx: ContextV2, scope: ScopeV2, access: Awaited<ReturnType<typeof accessV2>>, pin: CloudImageV2Pin, path: string) {
    const facts = await assetV2(ctx, scope, access, path);
    const initial = pin.binding.allowedAssets.some(asset => asset.path === path && asset.hash === facts.file.hash && asset.bytes === facts.file.bytes);
    const admitted = facts.media ? await hasImportedImageAdmission(ctx, scope, approvalV2(pin), facts.media.asset) : false;
    if (!initial && !admitted) cloudError('CLOUD_CONTENT_UNAPPROVED_CHANGE');
    if (facts.media && facts.media.asset.width * pin.binding.aspectRatio.height !== facts.media.asset.height * pin.binding.aspectRatio.width) cloudError('CLOUD_IMAGE_RATIO_MISMATCH');
    return facts;
}
async function attemptV2(ctx: ContextV2, attemptId: Id<'cloudEditorContentImageAttempts'>, actorId: Id<'users'>) {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt || !('version' in attempt) || attempt.version !== 2) return cloudError('CLOUD_INVALID_UPLOAD');
    if (attempt.actorId !== actorId) cloudError('CLOUD_ACTOR_CHANGED');
    await ordinaryV2(ctx, { ...attempt, actorId });
    return attempt;
}
async function readyAttemptV2(ctx: ContextV2, args: Infer<typeof vOperationV2>, epoch: number) {
    if (args.image.kind !== 'upload') return null;
    const attempt = await attemptV2(ctx, args.image.attemptId, args.actorId);
    if (attempt.projectId !== args.projectId || attempt.branchId !== args.branchId || attempt.expectedRevision !== args.expectedRevision || attempt.operationId !== args.operationId ||
        snapshotCanonicalJson(attempt.pin) !== snapshotCanonicalJson(args.pin)) cloudError('CLOUD_INVALID_UPLOAD');
    await pinV2(ctx, args, args.pin, epoch, true);
    if (attempt.status !== 'ready' || attempt.expiresAt <= Date.now() || !attempt.storageId || !attempt.hash || !attempt.bytes || !attempt.assetPath || !attempt.width || !attempt.height) return cloudError('CLOUD_UPLOAD_EXPIRED');
    const asset = { path: attempt.assetPath, storageId: attempt.storageId, hash: attempt.hash, bytes: attempt.bytes, mime: 'image/webp' as const, width: attempt.width, height: attempt.height };
    assertImportedMediaAsset(asset);
    if (asset.width * args.pin.binding.aspectRatio.height !== asset.height * args.pin.binding.aspectRatio.width) cloudError('CLOUD_IMAGE_RATIO_MISMATCH');
    return { attempt, asset };
}
const vOperationV2 = v.object(operationV2);
export const imageContracts = query({ args: { projectId: v.id('projects'), branchId: v.id('branches') }, handler: async (ctx, scope) => {
    const user = await requireCloudProjectCapability(ctx, scope);
    const access = await accessV2(ctx, { ...scope, actorId: user.user._id });
    const rows = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', scope.branchId)).take(MAX_CLOUD_FILES + 1);
    if (rows.length > MAX_CLOUD_FILES || rows.some(row => row.projectId !== scope.projectId)) cloudError('CLOUD_FILE_LIMIT');
    return { actorId: access.user._id, revision: access.state.revision, designRevision: access.designRevision,
        contracts: rows.filter(row => imageFamily(row) && (access.canDesign || (row.active && row.designRevision === access.designRevision))).map(row => ({
            path: row.path, version: 2 as const, generation: row.generation, designRevision: row.designRevision ?? null, active: row.active,
            current: row.active && row.designRevision === access.designRevision, bindings: row.imageBindings!, fingerprint: row.fingerprint })) };
}});
export const _selectionInputV2 = internalQuery({ args: { ...scopeV2, expectedRevision: v.number() }, handler: async (ctx, args) => {
    const access = await accessV2(ctx, args, args.expectedRevision, true);
    const contracts = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
    if (contracts.length > MAX_CLOUD_FILES || contracts.some(row => row.projectId !== args.projectId)) cloudError('CLOUD_FILE_LIMIT');
    return { actorId: access.user._id, revision: access.state.revision, designRevision: access.designRevision, files: await filesV2(ctx, args), contracts };
}});
export const _assetFactsV2 = internalQuery({ args: { ...scopeV2, expectedRevision: v.number(), path: v.string(), expectedHash: v.optional(v.string()), pin: v.optional(cloudImageV2Pin) }, handler: async (ctx, args) => {
    const access = await accessV2(ctx, args, args.expectedRevision, args.pin === undefined);
    if (args.pin) await pinV2(ctx, args, args.pin, access.designRevision);
    const facts = args.pin ? await admittedAssetV2(ctx, args, access, args.pin, args.path) : await assetV2(ctx, args, access, args.path, args.expectedHash);
    return { path: facts.file.path, hash: facts.file.hash, bytes: facts.file.bytes, storageId: facts.file.storageId!, media: facts.media };
}});
export const _inspectionAssetV2 = query({ args: { ...scopeV2, expectedRevision: v.number(), path: v.string(), expectedHash: v.string(), secret: v.string() }, handler: async (ctx, args) => {
    const secret = process.env.WEBLAB_CLOUD_IMAGE_SECRET;
    if (!secret || secret.length < 32 || args.secret !== secret) cloudError('CLOUD_INVALID_UPLOAD');
    const access = await accessV2(ctx, args, args.expectedRevision, true);
    const { file } = await assetV2(ctx, args, access, args.path, args.expectedHash);
    const url = await ctx.storage.getUrl(file.storageId!);
    if (!url) return cloudError('CLOUD_IMPORT_ASSET_CHANGED');
    return { url, bytes: file.bytes, hash: file.hash };
}});
export const _approveV2 = internalMutation({ args: { ...scopeV2, expectedRevision: v.number(), expectedGeneration: v.number(), designRevision: v.number(),
    path: v.string(), bindings: v.array(contentImageBinding), fingerprint: v.string() }, handler: async (ctx, args) => {
    const access = await accessV2(ctx, args, args.expectedRevision, true); generationV2(args.expectedGeneration, true); hashV2(args.fingerprint);
    const prior = await rowV2(ctx, args, args.path);
    if ((prior?.generation ?? 0) !== args.expectedGeneration || (prior && prior.version !== 2) || args.designRevision !== access.designRevision) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    if (prior?.active && prior.textBindings?.length) cloudError('CLOUD_CONTENT_TEXT_APPROVAL_EXISTS');
    if (prior?.active && !imageFamily(prior)) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    if (!args.bindings.length || args.bindings.length > 100 || new Set(args.bindings.map(row => row.bindingId)).size !== args.bindings.length) cloudError('CLOUD_CONTENT_INVALID_TARGET');
    for (const binding of args.bindings) assertImportedImageApproval({ ownerPath: args.path, bindingId: binding.bindingId, generation: args.expectedGeneration + 1, designRevision: access.designRevision, fingerprint: args.fingerprint });
    const files = await filesV2(ctx, args), owner = files.find(file => file.path === args.path);
    if (!owner || owner.text === undefined || owner.storageId) return cloudError('CLOUD_CONTENT_INVALID_TARGET');
    await assertImportedTextChanges(files, [{ path: owner.path, kind: 'file', text: owner.text, hash: owner.hash, bytes: owner.bytes }], access.preparation.policy);
    const assets = new Map(args.bindings.flatMap(binding => [binding.originalAsset, ...binding.allowedAssets]).map(asset => [asset.path, asset]));
    if (assets.size > MAX_CLOUD_FILES) cloudError('CLOUD_FILE_LIMIT');
    for (const asset of assets.values()) { const facts = await assetV2(ctx, args, access, asset.path, asset.hash); if (facts.file.bytes !== asset.bytes) cloudError('CLOUD_IMPORTED_MEDIA_INVALID'); }
    if (!prior && (await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES)).length >= MAX_CLOUD_FILES) cloudError('CLOUD_FILE_LIMIT');
    const next = { projectId: args.projectId, branchId: args.branchId, path: args.path, version: 2 as const, generation: args.expectedGeneration + 1,
        active: true, bindings: [], imageBindings: args.bindings, designRevision: access.designRevision, fingerprint: args.fingerprint,
        approvedByUserId: args.actorId, approvedRevision: args.expectedRevision, updatedAt: Date.now() };
    await assertSnapshotBudget(ctx, { writeDocs: 1, writeBytes: snapshotDocumentBytes(next) });
    if (prior) await ctx.db.replace(prior._id, next); else await ctx.db.insert('cloudEditorContentContracts', next);
    return { path: args.path, version: 2 as const, generation: next.generation, designRevision: next.designRevision, fingerprint: next.fingerprint };
}});
export const revokeV2 = mutation({ args: { ...scopeV2, path: v.string(), expectedGeneration: v.number() }, handler: async (ctx, args) => {
    await accessV2(ctx, args, undefined, true); generationV2(args.expectedGeneration);
    const row = await rowV2(ctx, args, args.path);
    if (!row || !imageFamily(row) || row.generation !== args.expectedGeneration) return cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    await ctx.db.patch(row._id, { active: false, generation: row.generation + 1, updatedAt: Date.now() });
    return { path: row.path, generation: row.generation + 1 };
}});
export const reserveV2 = mutation({ args: { ...scopeV2, expectedRevision: v.number(), operationId: v.string(), pin: cloudImageV2Pin }, handler: async (ctx, args) => {
    const access = await accessV2(ctx, args, args.expectedRevision); assertOperationId(args.operationId);
    await pinV2(ctx, args, args.pin, access.designRevision, true);
    const previous = await ctx.db.query('cloudEditorContentImageAttempts').withIndex('by_branchId_and_operationId', q => q.eq('branchId', args.branchId).eq('operationId', args.operationId)).unique();
    if (previous) {
        if (!('version' in previous) || previous.actorId !== args.actorId || previous.projectId !== args.projectId || previous.expectedRevision !== args.expectedRevision ||
            snapshotCanonicalJson(previous.pin) !== snapshotCanonicalJson(args.pin)) cloudError('CLOUD_INVALID_UPLOAD');
        return previous._id;
    }
    const identity = await importedImageApprovalIdentity(args, approvalV2(args.pin));
    if ((await ctx.db.query('cloudEditorImportedImageAdmissions').withIndex('by_branchId_and_approvalIdentity', q => q.eq('branchId', args.branchId).eq('approvalIdentity', identity)).take(65)).length > 64) cloudError('CLOUD_IMPORTED_MEDIA_INVALID');
    const recent = await ctx.db.query('cloudEditorContentImageAttempts').withIndex('by_projectId_and_createdAt', q => q.eq('projectId', args.projectId).gte('createdAt', Date.now() - DAY)).take(21);
    if (recent.length >= 20 || recent.filter(row => row.status === 'open' || row.status === 'ready').length >= 4) cloudError('CLOUD_UPLOAD_LIMIT');
    const attemptId = await ctx.db.insert('cloudEditorContentImageAttempts', { ...args, path: args.pin.path, version: 2, status: 'open', createdAt: Date.now(), expiresAt: Date.now() + DAY });
    await ctx.scheduler.runAfter(DAY, collectRef, { attemptId }); return attemptId;
}});
export const cancelPreparationV2 = mutation({ args: { attemptId: v.id('cloudEditorContentImageAttempts'), actorId: v.id('users') }, handler: async (ctx, args) => {
    const attempt = await attemptV2(ctx, args.attemptId, args.actorId);
    if (attempt.status === 'open' || attempt.status === 'ready') await ctx.db.patch(attempt._id, { status: 'closed' });
    return null;
}});
export const _preparationV2 = internalQuery({ args: { attemptId: v.id('cloudEditorContentImageAttempts'), actorId: v.id('users') }, handler: async (ctx, args) => {
    const attempt = await attemptV2(ctx, args.attemptId, args.actorId);
    const access = await accessV2(ctx, attempt, attempt.expectedRevision); await pinV2(ctx, attempt, attempt.pin, access.designRevision, true);
    if (attempt.expiresAt <= Date.now() || !['open', 'ready'].includes(attempt.status)) cloudError('CLOUD_UPLOAD_EXPIRED');
    return attempt;
}});
export const _readyV2 = internalMutation({ args: { attemptId: v.id('cloudEditorContentImageAttempts'), storageId: v.id('_storage'), hash: v.string(), bytes: v.number(), width: v.number(), height: v.number() }, handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || !('version' in attempt)) return false;
    const assetPath = `public/weblab-upload-${args.hash}.webp`;
    assertImportedMediaAsset({ path: assetPath, storageId: args.storageId, hash: args.hash, bytes: args.bytes, width: args.width, height: args.height, mime: 'image/webp' });
    if (attempt.storageId) return attempt.storageId === args.storageId && attempt.hash === args.hash && attempt.bytes === args.bytes && attempt.width === args.width && attempt.height === args.height;
    if (!['open', 'closed'].includes(attempt.status)) return false;
    const blob = await ctx.db.system.get(args.storageId);
    if (!blob || blob.size !== args.bytes || !storageSha256Matches(blob.sha256, args.hash)) return false;
    await ctx.db.patch(attempt._id, { storageId: args.storageId, hash: args.hash, bytes: args.bytes, width: args.width, height: args.height, assetPath,
        status: attempt.status === 'open' ? 'ready' : 'closed' }); return true;
}});
export const _inputV2 = internalQuery({ args: operationV2, handler: async (ctx, args) => {
    const receipt = await receiptV2(ctx, args); if (receipt) return { receipt, snapshot: null };
    const access = await accessV2(ctx, args, args.expectedRevision);
    const contract = await pinV2(ctx, args, args.pin, access.designRevision);
    const upload = await readyAttemptV2(ctx, args, access.designRevision);
    return { receipt: null, snapshot: { files: await filesV2(ctx, args), contract, upload } };
}});
export const _commitV2 = internalMutation({ args: { ...operationV2, content: v.string(), sourceHash: v.string(), sourceBytes: v.number(), value: cloudImageValue,
    fields: v.array(v.union(v.literal('src'), v.literal('alt'))), binary: v.optional(v.object({ path: v.string(), hash: v.string(), bytes: v.number() })) }, handler: async (ctx, args) => {
    const receipt = await receiptV2(ctx, args); if (receipt) return receipt;
    const access = await accessV2(ctx, args, args.expectedRevision);
    await pinV2(ctx, args, args.pin, access.designRevision);
    const upload = await readyAttemptV2(ctx, args, access.designRevision);
    if (args.fields.some(field => !args.pin.binding.fields.includes(field)) || (!upload && !args.fields.length) || new Set(args.fields).size !== args.fields.length) cloudError('CLOUD_CONTENT_UNAPPROVED_CHANGE');
    if (args.sourceBytes !== new TextEncoder().encode(args.content).byteLength || await digestV2(args.content) !== args.sourceHash) cloudError('CLOUD_INVALID_CHANGES');
    const files = await filesV2(ctx, args), owner = files.find(file => file.path === args.pin.path);
    if (!owner || owner.text === undefined || owner.storageId) return cloudError('CLOUD_CONTENT_INVALID_TARGET');
    await assertImportedTextChanges(files, [{ path: owner.path, kind: 'file', text: args.content, hash: args.sourceHash, bytes: args.sourceBytes }], access.preparation.policy);
    let effective = upload?.asset;
    if (upload) {
        if (args.value.src !== upload.asset.path.slice(6)) cloudError('CLOUD_INVALID_UPLOAD');
        if (args.binary && (args.binary.path !== upload.asset.path || args.binary.hash !== upload.asset.hash || args.binary.bytes !== upload.asset.bytes)) cloudError('CLOUD_INVALID_UPLOAD');
        const existing = files.find(file => file.path === upload.asset.path);
        if (existing) {
            const facts = await assetV2(ctx, args, access, upload.asset.path, upload.asset.hash);
            if (!facts.media || facts.file.bytes !== upload.asset.bytes || facts.media.asset.width !== upload.asset.width || facts.media.asset.height !== upload.asset.height) cloudError('CLOUD_IMPORTED_MEDIA_INVALID');
            effective = facts.media.asset;
        } else if (!args.binary) cloudError('CLOUD_INVALID_CHANGES');
        const metadata = await ctx.db.system.get(upload.asset.storageId);
        if (!metadata || metadata.size !== upload.asset.bytes || !storageSha256Matches(metadata.sha256, upload.asset.hash)) cloudError('CLOUD_INVALID_UPLOAD');
    } else {
        if (args.binary) cloudError('CLOUD_INVALID_CHANGES');
        await admittedAssetV2(ctx, args, access, args.pin, `public${args.value.src}`);
    }
    const extra = effective && !files.some(file => file.path === effective!.path) ? effective : null;
    const nextFiles = files.map(file => file._id === owner._id ? { ...file, text: args.content, bytes: args.sourceBytes, hash: args.sourceHash } : file);
    const total = nextFiles.reduce((sum, file) => sum + file.bytes, extra?.bytes ?? 0);
    if (!Number.isSafeInteger(total) || total > MAX_IMPORT_BYTES || nextFiles.length + Number(!!extra) > MAX_CLOUD_FILES || inlineSourceBytes(nextFiles) > MAX_CLOUD_INLINE_BYTES) cloudError('CLOUD_PROJECT_TOO_LARGE');
    const revision = access.state.revision + 1; assertCloudRevision(revision);
    await assertSnapshotBudget(ctx, { writeDocs: 9, writeBytes: args.sourceBytes + 40_000 });
    await ctx.db.patch(owner._id, { text: args.content, bytes: args.sourceBytes, hash: args.sourceHash });
    if (extra) await ctx.db.insert('cloudEditorFiles', { projectId: args.projectId, branchId: args.branchId, path: extra.path, kind: 'file', storageId: extra.storageId, hash: extra.hash, bytes: extra.bytes });
    if (upload && effective) {
        await recordImportedMediaUpload(ctx, { ...args, approval: approvalV2(args.pin), asset: effective, attemptId: upload.attempt._id });
        await ctx.db.patch(upload.attempt._id, { status: 'committed', expiresAt: Date.now() + 31 * DAY });
    }
    await ctx.db.patch(access.state._id, { revision, bytes: total, fileCount: nextFiles.length + Number(!!extra), updatedAt: Date.now() });
    await ctx.db.insert('cloudEditorOperations', { projectId: args.projectId, branchId: args.branchId, userId: args.actorId, operationId: args.operationId,
        fingerprint: args.fingerprint, revision, storageIds: effective ? [effective.storageId] : [], createdAt: Date.now() });
    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, makeFunctionReference<'action', { projectId: Id<'projects'>; branchId: Id<'branches'> }, null>('cloudEditorRuntime:sync'), { projectId: args.projectId, branchId: args.branchId });
    await assertSnapshotBudget(ctx); return { revision, currentRevision: revision };
}});
