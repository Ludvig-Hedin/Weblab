import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { cloudImageTarget } from './cloudEditorContentImageSchema';
import { contentBinding } from './cloudEditorContentSchema';
import { assertCloudRevision, assertOperationId, cloudError, MAX_CLOUD_FILES, MAX_CLOUD_PROJECT_BYTES, MAX_CLOUD_INLINE_BYTES, inlineSourceBytes } from './lib/cloudEditor';
const DAY = 86_400_000;
const collectRef = makeFunctionReference<'mutation', { attemptId: Id<'cloudEditorContentImageAttempts'> }, null>('cloudEditorContentImages:_collect');
type Target = { projectId: Id<'projects'>; branchId: Id<'branches'>; actorId: Id<'users'>; path: string; oid: string; expectedRevision: number; generation: number };
async function admitted(ctx: MutationCtx | QueryCtx, target: Target) {
    const access = await requireCloudAccess(ctx, target, 'content');
    if (access.user._id !== target.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    assertCloudRevision(target.expectedRevision);
    const contract = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', target.branchId).eq('path', target.path)).unique();
    const binding = contract?.bindings.find(b => b.oid === target.oid);
    if (!contract || contract.projectId !== target.projectId || !contract.active || contract.generation !== target.generation || !binding?.fields.includes('src') || !binding.allowImageUploads) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    return { ...access, contract };
}
async function owned(ctx: MutationCtx | QueryCtx, attemptId: Id<'cloudEditorContentImageAttempts'>) {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt) return cloudError('CLOUD_INVALID_UPLOAD');
    const access = await requireCloudAccess(ctx, attempt, 'content');
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
    if (!attempt || attempt.storageId || attempt.status !== 'open') return false;
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
