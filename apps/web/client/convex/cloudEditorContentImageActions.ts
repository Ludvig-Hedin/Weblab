'use node';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { action } from './_generated/server';
import type * as Backend from './cloudEditorContentImages';
import { cloudImagePin, cloudImageV2Operation, cloudImageSelection, cloudImageInspection } from './cloudEditorContentImageSchema';
import { cloudChange, cloudScope, cloudError, validateCloudChanges } from './lib/cloudEditor';
import { imageHash, imagePath, MAX_CLOUD_IMAGE_BYTES, validImageProof, validImageMetadataProof } from './lib/cloudContentImage';
import { approveCloudContentBindings, validateCloudContentCandidate, CloudContentContractError } from './lib/cloudContentContract';
import { resolveContentImageRenderMapping, ContentImageRenderMappingError } from '@weblab/parser/src/code-edit/content-image-render-mapping';
import { readContentImageTarget, ContentImageTargetError } from '@weblab/parser/src/code-edit/content-image-target';
import { createCloudImageContract, validateCloudImageCandidate, type ContentImageBinding } from './lib/cloudContentImageContract';
import { snapshotCanonicalJson } from './lib/cloudImageIntegrity';
import { assertContentOidUniqueness } from './cloudEditorContentActions';
function checked<T>(run: () => T): T {
    try { return run(); } catch (error) {
        if (error instanceof CloudContentContractError) return cloudError(`CLOUD_CONTENT_${error.code}`);
        if (error instanceof ContentImageRenderMappingError || error instanceof ContentImageTargetError) return cloudError('CLOUD_CONTENT_INVALID_TARGET');
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

const selectionV2Ref = makeFunctionReference<'query', FunctionArgs<B['_selectionInputV2']>, FunctionReturnType<B['_selectionInputV2']>>('cloudEditorContentImages:_selectionInputV2');
const factsV2Ref = makeFunctionReference<'query', FunctionArgs<B['_assetFactsV2']>, FunctionReturnType<B['_assetFactsV2']>>('cloudEditorContentImages:_assetFactsV2');
const approveV2Ref = makeFunctionReference<'mutation', FunctionArgs<B['_approveV2']>, FunctionReturnType<B['_approveV2']>>('cloudEditorContentImages:_approveV2');
const prepareV2Ref = makeFunctionReference<'query', FunctionArgs<B['_preparationV2']>, FunctionReturnType<B['_preparationV2']>>('cloudEditorContentImages:_preparationV2');
const readyV2Ref = makeFunctionReference<'mutation', FunctionArgs<B['_readyV2']>, FunctionReturnType<B['_readyV2']>>('cloudEditorContentImages:_readyV2');
const inputV2Ref = makeFunctionReference<'query', FunctionArgs<B['_inputV2']>, FunctionReturnType<B['_inputV2']>>('cloudEditorContentImages:_inputV2');
const commitV2Ref = makeFunctionReference<'mutation', FunctionArgs<B['_commitV2']>, FunctionReturnType<B['_commitV2']>>('cloudEditorContentImages:_commitV2');
const selectedScopeV2 = { ...cloudScope, actorId: v.id('users'), expectedRevision: v.number() };
function inventoryV2(files: Array<{ path: string; kind: string; text?: string; storageId?: unknown }>) {
    // Public source modules can also consume a binding; every executable must be inspectable.
    if (files.some(file => file.kind !== 'directory' && /\.[cm]?[jt]sx?$/.test(file.path) && (file.text === undefined || file.storageId !== undefined))) cloudError('CLOUD_CONTENT_INVALID_TARGET');
    return Object.fromEntries(files.filter(file => file.text !== undefined).map(file => [file.path, file.text!]));
}
function mappingsV2(path: string, bindings: ContentImageBinding[], files: Record<string, string>): void {
    for (const binding of bindings) {
        const candidate = checked(() => resolveContentImageRenderMapping(files, { oid: binding.renderMapping.renderer.oid, mappingId: binding.renderMapping.mappingId, itemId: 'single' }));
        if (candidate.path !== path || snapshotCanonicalJson(candidate.target) !== snapshotCanonicalJson(binding.target) || snapshotCanonicalJson(candidate.renderMapping) !== snapshotCanonicalJson(binding.renderMapping)) cloudError('CLOUD_CONTENT_INVALID_TARGET');
    }
}
function publicAsset(asset: { path: string; hash: string; bytes: number }) { return { path: asset.path, hash: asset.hash, bytes: asset.bytes }; }
function gcdV2(a: number, b: number): number { while (b) { const next = a % b; a = b; b = next; } return a; }
export const resolveSelection = action({ args: { ...selectedScopeV2, ...cloudImageSelection.fields }, handler: async (ctx, args) => {
    const { oid, mappingId, itemId, ...scope } = args;
    const input = await ctx.runQuery(selectionV2Ref, scope);
    const resolved = checked(() => resolveContentImageRenderMapping(inventoryV2(input.files), { oid, mappingId, itemId }));
    assertContentOidUniqueness(input.files);
    const asset = await ctx.runQuery(factsV2Ref, { ...scope, path: `public${resolved.value.src}` });
    const prior = input.contracts.find(row => row.path === resolved.path);
    const conflictingFamily = prior?.active ? prior.version !== 2 ? 'legacy' as const : prior.textBindings?.length ? 'text' as const
        : !prior.imageBindings?.length || prior.bindings.length ? 'invalid' as const : null : null;
    const binding = prior?.imageBindings?.find(row => snapshotCanonicalJson(row.target) === snapshotCanonicalJson(resolved.target));
    return { ...resolved, asset: publicAsset(asset), actorId: input.actorId, revision: input.revision, designRevision: input.designRevision,
        generation: prior?.generation ?? 0, bindingId: binding?.bindingId ?? mappingId, conflictingFamily };
}});
export const approveV2 = action({ args: { ...selectedScopeV2, expectedGeneration: v.number(), selection: cloudImageSelection,
    bindingId: v.string(), fields: v.array(v.union(v.literal('src'), v.literal('alt'))), allowImageUploads: v.boolean(), inspection: cloudImageInspection },
    handler: async (ctx, args) => {
        const scope = { projectId: args.projectId, branchId: args.branchId, actorId: args.actorId, expectedRevision: args.expectedRevision };
        const input = await ctx.runQuery(selectionV2Ref, scope), sources = inventoryV2(input.files);
        const resolved = checked(() => resolveContentImageRenderMapping(sources, args.selection));
        assertContentOidUniqueness(input.files);
        const prior = input.contracts.find(row => row.path === resolved.path);
        if ((prior?.generation ?? 0) !== args.expectedGeneration || (prior && prior.version !== 2)) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        if (prior?.active && prior.textBindings?.length) cloudError('CLOUD_CONTENT_TEXT_APPROVAL_EXISTS');
        if (prior?.active && (!prior.imageBindings?.length || prior.bindings.length)) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        const facts = await ctx.runQuery(factsV2Ref, { ...scope, path: `public${resolved.value.src}` });
        const inspection = args.inspection;
        if (inspection.path !== facts.path || inspection.hash !== facts.hash || inspection.bytes !== facts.bytes || !validImageMetadataProof(process.env.WEBLAB_CLOUD_IMAGE_SECRET ?? '', {
            kind: 'approval', projectId: args.projectId, branchId: args.branchId, actorId: args.actorId, revision: args.expectedRevision,
            path: facts.path, hash: facts.hash, bytes: facts.bytes, width: inspection.width, height: inspection.height,
        }, inspection.proof)) cloudError('CLOUD_INVALID_UPLOAD');
        if (facts.media && (facts.media.asset.width !== inspection.width || facts.media.asset.height !== inspection.height)) cloudError('CLOUD_IMPORTED_MEDIA_INVALID');
        const owner = sources[resolved.path]; if (owner === undefined) return cloudError('CLOUD_CONTENT_INVALID_TARGET');
        let retained: ContentImageBinding[] = [];
        if (prior?.active && prior.imageBindings) {
            const old = checked(() => createCloudImageContract(resolved.path, owner, prior.imageBindings!));
            if (old.fingerprint !== prior.fingerprint || prior.designRevision !== input.designRevision) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
            mappingsV2(resolved.path, old.bindings, sources);
            for (const binding of old.bindings) {
                const current = checked(() => readContentImageTarget(owner, binding.target));
                const currentAsset = await ctx.runQuery(factsV2Ref, { ...scope, path: `public${current.src}`, pin: { version: 2, path: resolved.path,
                    generation: prior.generation, designRevision: prior.designRevision!, fingerprint: prior.fingerprint, binding } });
                // Retained siblings cannot carry an upload admission into the new shared generation.
                if (binding.bindingId !== args.bindingId && !binding.allowedAssets.some(asset =>
                    asset.path === currentAsset.path && asset.hash === currentAsset.hash && asset.bytes === currentAsset.bytes)) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
            }
            retained = old.bindings.filter(binding => binding.bindingId !== args.bindingId);
        }
        const divisor = gcdV2(inspection.width, inspection.height), asset = publicAsset(facts);
        const binding: ContentImageBinding = { bindingId: args.bindingId, target: resolved.target, renderMapping: resolved.renderMapping,
            fields: args.fields, allowImageUploads: args.allowImageUploads, originalAsset: asset, allowedAssets: [asset],
            aspectRatio: { width: inspection.width / divisor, height: inspection.height / divisor } };
        const contract = checked(() => createCloudImageContract(resolved.path, owner, [...retained, binding]));
        mappingsV2(resolved.path, contract.bindings, sources);
        return ctx.runMutation(approveV2Ref, { ...scope, path: resolved.path, expectedGeneration: args.expectedGeneration,
            designRevision: input.designRevision, bindings: contract.bindings, fingerprint: contract.fingerprint });
    },
});
export const prepareV2 = action({ args: { attemptId: v.id('cloudEditorContentImageAttempts'), actorId: v.id('users'), bytes: v.bytes(), width: v.number(), height: v.number(), proof: v.string() }, handler: async (ctx, args) => {
    if (!args.bytes.byteLength || args.bytes.byteLength > MAX_CLOUD_IMAGE_BYTES) cloudError('CLOUD_ASSET_TOO_LARGE');
    const hash = imageHash(args.bytes), bytes = args.bytes.byteLength;
    if (!validImageMetadataProof(process.env.WEBLAB_CLOUD_IMAGE_SECRET ?? '', { kind: 'upload', attemptId: args.attemptId, hash, bytes, width: args.width, height: args.height }, args.proof)) cloudError('CLOUD_INVALID_UPLOAD');
    const attempt = await ctx.runQuery(prepareV2Ref, { attemptId: args.attemptId, actorId: args.actorId });
    if (args.width * attempt.pin.binding.aspectRatio.height !== args.height * attempt.pin.binding.aspectRatio.width) cloudError('CLOUD_IMAGE_RATIO_MISMATCH');
    const assetPath = imagePath(hash);
    const result = { attemptId: attempt._id, assetPath, hash, width: args.width, height: args.height };
    if (attempt.storageId) {
        if (attempt.hash !== hash || attempt.bytes !== bytes || attempt.width !== args.width || attempt.height !== args.height || attempt.assetPath !== assetPath) cloudError('CLOUD_INVALID_UPLOAD');
        return result;
    }
    const storageId = await ctx.storage.store(new Blob([args.bytes], { type: 'image/webp' }));
    const registration = { attemptId: attempt._id, storageId, hash, bytes, width: args.width, height: args.height };
    let accepted: boolean;
    try { accepted = await ctx.runMutation(readyV2Ref, registration); }
    catch { accepted = await ctx.runMutation(readyV2Ref, registration); } // Same storage ID; an unknown second result is retained, never blindly deleted.
    if (!accepted) { await ctx.storage.delete(storageId); cloudError('CLOUD_INVALID_UPLOAD'); }
    return result;
}});
export const commitV2 = action({ args: cloudImageV2Operation, handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
    validateCloudChanges(args.changes);
    const owners = args.changes.filter(change => change.path === args.pin.path && typeof change.content === 'string' && change.directory === undefined);
    const binaries = args.changes.filter(change => change.content instanceof ArrayBuffer && change.directory === undefined);
    if (owners.length !== 1 || binaries.length > 1 || args.changes.length !== owners.length + binaries.length || (args.image.kind === 'values' && binaries.length)) cloudError('CLOUD_INVALID_CHANGES');
    const owner = owners[0]!, content = owner.content as string;
    const binary = binaries[0] ? { path: binaries[0].path, hash: imageHash(binaries[0].content as ArrayBuffer), bytes: (binaries[0].content as ArrayBuffer).byteLength } : undefined;
    const sourceHash = imageHash(content);
    const fingerprint = imageHash(snapshotCanonicalJson({ projectId: args.projectId, branchId: args.branchId, actorId: args.actorId,
        expectedRevision: args.expectedRevision, operationId: args.operationId, transport: args.transport, transportVersion: args.transportVersion,
        pin: args.pin, previous: args.previous, image: args.image, owner: { path: owner.path, hash: sourceHash }, binary: binary ?? null }));
    const operation = { projectId: args.projectId, branchId: args.branchId, actorId: args.actorId, expectedRevision: args.expectedRevision,
        operationId: args.operationId, fingerprint, pin: args.pin, image: args.image };
    const input = await ctx.runQuery(inputV2Ref, operation);
    if (input.receipt) return input.receipt;
    if (!input.snapshot) return cloudError('CLOUD_CONFLICT');
    const { files, contract, upload } = input.snapshot, sources = inventoryV2(files), original = sources[args.pin.path];
    if (original === undefined || !contract.imageBindings) return cloudError('CLOUD_CONTENT_INVALID_TARGET');
    mappingsV2(contract.path, contract.imageBindings, sources); assertContentOidUniqueness(files);
    const previous = checked(() => readContentImageTarget(original, args.pin.binding.target));
    if (snapshotCanonicalJson(previous) !== snapshotCanonicalJson(args.previous)) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    const value = checked(() => readContentImageTarget(content, args.pin.binding.target));
    let admitted: { bindingId: string; asset: { path: string; hash: string; bytes: number } }[] = [];
    if (upload) {
        if (value.src !== upload.asset.path.slice(6) || (binary && (binary.path !== upload.asset.path || binary.hash !== upload.asset.hash || binary.bytes !== upload.asset.bytes))) cloudError('CLOUD_INVALID_UPLOAD');
        admitted = [{ bindingId: args.pin.binding.bindingId, asset: publicAsset(upload.asset) }];
    } else {
        const facts = await ctx.runQuery(factsV2Ref, { projectId: args.projectId, branchId: args.branchId, actorId: args.actorId,
            expectedRevision: args.expectedRevision, path: `public${value.src}`, pin: args.pin });
        if (facts.media && !args.pin.binding.allowedAssets.some(asset => asset.path === facts.path && asset.hash === facts.hash && asset.bytes === facts.bytes))
            admitted = [{ bindingId: args.pin.binding.bindingId, asset: publicAsset(facts) }];
    }
    const validated = checked(() => validateCloudImageCandidate({ contract: { version: 2, path: contract.path, bindings: contract.imageBindings!, fingerprint: contract.fingerprint },
        originalSource: original, candidateSource: content, verifiedUploadAdmissions: admitted }));
    if (validated.operations.some(change => change.bindingId !== args.pin.binding.bindingId)) cloudError('CLOUD_CONTENT_UNAPPROVED_CHANGE');
    return ctx.runMutation(commitV2Ref, { ...operation, content: validated.source, sourceHash, sourceBytes: Buffer.byteLength(validated.source), value,
        fields: validated.operations.map(change => change.field), ...(binary ? { binary } : {}) });
}});
