'use node';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { action } from './_generated/server';
import type * as Backend from './cloudEditorContentImages';
import { cloudImagePin } from './cloudEditorContentImageSchema';
import { cloudChange, cloudScope, cloudError, validateCloudChanges } from './lib/cloudEditor';
import { imageHash, imagePath, MAX_CLOUD_IMAGE_BYTES, validImageProof } from './lib/cloudContentImage';
import { approveCloudContentBindings, validateCloudContentCandidate, CloudContentContractError } from './lib/cloudContentContract';
import { assertContentOidUniqueness } from './cloudEditorContentActions';
function checked<T>(run: () => T): T {
    try { return run(); } catch (error) {
        if (error instanceof CloudContentContractError) return cloudError(`CLOUD_CONTENT_${error.code}`);
        throw error;
    }
}
type B = ApiFromModules<{ images: typeof Backend }>['images'];
const preparationRef = makeFunctionReference<'query', FunctionArgs<B['_preparation']>, FunctionReturnType<B['_preparation']>>('cloudEditorContentImages:_preparation');
const readyRef = makeFunctionReference<'mutation', FunctionArgs<B['_ready']>, FunctionReturnType<B['_ready']>>('cloudEditorContentImages:_ready');
const inputRef = makeFunctionReference<'query', FunctionArgs<B['_input']>, FunctionReturnType<B['_input']>>('cloudEditorContentImages:_input');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<B['_commit']>, FunctionReturnType<B['_commit']>>('cloudEditorContentImages:_commit');
export const prepare = action({ args: { attemptId: v.id('cloudEditorContentImageAttempts'), bytes: v.bytes(), proof: v.string() }, handler: async (ctx, args): Promise<{ attemptId: typeof args.attemptId; assetPath: string; hash: string }> => {
    if (!args.bytes.byteLength || args.bytes.byteLength > MAX_CLOUD_IMAGE_BYTES) cloudError('CLOUD_ASSET_TOO_LARGE');
    const hash = imageHash(args.bytes);
    if (!validImageProof(process.env.WEBLAB_CLOUD_IMAGE_SECRET ?? '', args.attemptId, hash, args.proof)) cloudError('CLOUD_INVALID_UPLOAD');
    const attempt = await ctx.runQuery(preparationRef, { attemptId: args.attemptId });
    const assetPath = imagePath(hash);
    if (attempt.storageId) {
        if (attempt.hash !== hash || attempt.assetPath !== assetPath) cloudError('CLOUD_INVALID_UPLOAD');
        return { attemptId: attempt._id, assetPath, hash };
    }
    const storageId = await ctx.storage.store(new Blob([args.bytes], { type: 'image/webp' }));
    // If registration is uncertain, do not delete a potentially accepted storage object.
    const accepted = await ctx.runMutation(readyRef, { attemptId: attempt._id, storageId, hash, assetPath, bytes: args.bytes.byteLength });
    if (!accepted) { await ctx.storage.delete(storageId); cloudError('CLOUD_INVALID_UPLOAD'); }
    return { attemptId: attempt._id, assetPath, hash };
}});
export const commit = action({ args: {
    ...cloudScope, actorId: v.id('users'), expectedRevision: v.number(), operationId: v.string(),
    transport: v.literal('content-image'), transportVersion: v.literal(1), image: cloudImagePin, changes: v.array(cloudChange),
}, handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
    validateCloudChanges(args.changes);
    if (args.changes.length < 1 || args.changes.length > 2) cloudError('CLOUD_INVALID_CHANGES');
    const source = args.changes.find(c => c.path === args.image.path);
    const image = args.changes.find(c => c.path === args.image.assetPath);
    if (!source || typeof source.content !== 'string' || source.directory !== undefined ||
        args.changes.some(c => c !== source && c !== image) ||
        (image && (!(image.content instanceof ArrayBuffer) || image.directory !== undefined))) cloudError('CLOUD_INVALID_CHANGES');
    const fingerprint = imageHash(JSON.stringify({ ...args, changes: args.changes.map(c => ({ path: c.path, hash: imageHash(c.content as string | ArrayBuffer) })).sort((a, b) => a.path.localeCompare(b.path)) }));
    const input = await ctx.runQuery(inputRef, { attemptId: args.image.attemptId, operationId: args.operationId, fingerprint });
    if (input.receipt) return input.receipt;
    if (!input.snapshot) return cloudError('CLOUD_CONFLICT');
    const { attempt, contract, files } = input.snapshot;
    if (attempt.actorId !== args.actorId || attempt.projectId !== args.projectId || attempt.branchId !== args.branchId || attempt.expectedRevision !== args.expectedRevision || attempt.path !== args.image.path || attempt.oid !== args.image.oid || attempt.generation !== args.image.generation || attempt.assetPath !== args.image.assetPath) cloudError('CLOUD_INVALID_UPLOAD');
    if (image && imageHash(image.content as ArrayBuffer) !== attempt.hash) cloudError('CLOUD_INVALID_UPLOAD');
    const existing = files.find(f => f.path === attempt.assetPath);
    if (!image && (!existing || existing.hash !== attempt.hash)) cloudError('CLOUD_INVALID_UPLOAD');
    const original = files.find(f => f.path === attempt.path);
    if (!original || typeof original.text !== 'string' || !attempt.assetPath) cloudError('CLOUD_CONTENT_INVALID_TARGET');
    const originalText = original.text, candidateSource = source.content;
    const assets = files.filter(f => f.kind === 'file' && f.path.startsWith('public/')).map(f => f.path.slice(6));
    assets.push(attempt.assetPath.slice(6));
    // First prove the stored contract still describes the old source, before extending the one upload-enabled binding.
    const oldContract = checked(() => approveCloudContentBindings({ path: contract.path, source: originalText, bindings: contract.bindings, approvedAssetPaths: assets }));
    if (oldContract.fingerprint !== contract.fingerprint) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    const bindings = structuredClone(contract.bindings);
    const binding = bindings.find(b => b.oid === attempt.oid);
    if (!binding?.allowImageUploads || !binding.fields.includes('src')) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    binding.allowedValues = { ...binding.allowedValues, src: [...new Set([...(binding.allowedValues?.src ?? []), attempt.assetPath.slice(6)])] };
    const expanded = checked(() => approveCloudContentBindings({ path: contract.path, source: originalText, bindings, approvedAssetPaths: assets }));
    const validated = checked(() => validateCloudContentCandidate({ contract: expanded, originalSource: originalText, candidateSource, approvedAssetPaths: assets }));
    if (validated.operations.length !== 1 || validated.operations[0]?.oid !== attempt.oid || validated.operations[0]?.field !== 'src' || validated.operations[0]?.value !== attempt.assetPath.slice(6)) cloudError('CLOUD_CONTENT_UNAPPROVED_CHANGE');
    const next = checked(() => approveCloudContentBindings({ path: contract.path, source: validated.source, bindings, approvedAssetPaths: assets }));
    assertContentOidUniqueness(files.map(f => f.path === original.path ? { ...f, text: validated.source } : f));
    return ctx.runMutation(commitRef, { attemptId: attempt._id, operationId: args.operationId, fingerprint, source: validated.source, sourceHash: imageHash(validated.source), contractFingerprint: contract.fingerprint, nextFingerprint: next.fingerprint, bindings });
}});
