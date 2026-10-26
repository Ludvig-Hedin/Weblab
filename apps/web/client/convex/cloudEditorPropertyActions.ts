'use node';

import { createHash } from 'node:crypto';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { ContentPropertyTargetError, resolveContentPropertyTarget } from '@weblab/parser/src/code-edit/content-property-target';
import { ContentImageRenderMappingError } from '@weblab/parser/src/code-edit/content-image-render-mapping';
import { ContentImageTargetError } from '@weblab/parser/src/code-edit/content-image-target';
import { ContentTextTargetError } from '@weblab/parser/src/code-edit/content-target';
import { action } from './_generated/server';
import type * as Backend from './cloudEditorProperties';
import { propertyApprovalArgs, propertyCommitArgs, propertyScope, propertySelection } from './cloudEditorPropertySchema';
import { cloudError } from './lib/cloudEditor';
import { CloudContentContractError } from './lib/cloudContentContract';
import { CloudPropertyContractError, createCloudPropertyContract, validateCloudPropertyCandidate } from './lib/cloudContentPropertyContract';
import { createCloudTextContract } from './lib/cloudContentTextContract';
import { snapshotCanonicalJson } from './lib/cloudImageIntegrity';

type Api = ApiFromModules<{ cloudEditorProperties: typeof Backend }>['cloudEditorProperties'];
const selectionInput = makeFunctionReference<'query', FunctionArgs<Api['_selectionInput']>, FunctionReturnType<Api['_selectionInput']>>('cloudEditorProperties:_selectionInput');
const approvalInput = makeFunctionReference<'query', FunctionArgs<Api['_approvalInput']>, FunctionReturnType<Api['_approvalInput']>>('cloudEditorProperties:_approvalInput');
const approveMutation = makeFunctionReference<'mutation', FunctionArgs<Api['_approve']>, FunctionReturnType<Api['_approve']>>('cloudEditorProperties:_approve');
const input = makeFunctionReference<'query', FunctionArgs<Api['_input']>, FunctionReturnType<Api['_input']>>('cloudEditorProperties:_input');
const commitMutation = makeFunctionReference<'mutation', FunctionArgs<Api['_commit']>, FunctionReturnType<Api['_commit']>>('cloudEditorProperties:_commit');
const hash = (source: string): string => createHash('sha256').update(source).digest('hex');
function validated<T>(run: () => T): T {
    try { return run(); } catch (error) {
        if (error instanceof CloudPropertyContractError) return cloudError(`CLOUD_PROPERTY_${error.code}`);
        if (error instanceof CloudContentContractError) return cloudError(`CLOUD_CONTENT_${error.code}`);
        if (error instanceof ContentPropertyTargetError || error instanceof ContentImageRenderMappingError
            || error instanceof ContentImageTargetError || error instanceof ContentTextTargetError) return cloudError('CLOUD_PROPERTY_INVALID_TARGET');
        throw error;
    }
}
function sources(files: Array<{ path: string; kind?: string; text?: string; storageId?: unknown }>): Record<string, string> {
    // Never omit a stored executable module that could supply a second consumer.
    if (files.some(file => file.kind !== 'directory' && /\.[cm]?[jt]sx?$/.test(file.path)
        && (typeof file.text !== 'string' || file.storageId !== undefined))) cloudError('CLOUD_PROPERTY_INVALID_TARGET');
    return Object.fromEntries(files.filter(file => typeof file.text === 'string').map(file => [file.path, file.text!]));
}

/** A designer's candidate, not an approval or a new source marker. */
export const resolveSelection = action({ args: { ...propertyScope, expectedRevision: v.number(), selection: propertySelection }, handler: async (ctx, args) => {
    const { selection, ...scope } = args;
    const snapshot = await ctx.runQuery(selectionInput, scope);
    const candidate = validated(() => resolveContentPropertyTarget(sources(snapshot.files), selection));
    return { ...candidate, actorId: snapshot.actorId, revision: snapshot.revision, preparationId: snapshot.preparationId,
        designRevision: snapshot.designRevision, generation: snapshot.contracts.find(row => row.path === candidate.path)?.generation ?? 0 };
}});
export const approve = action({ args: propertyApprovalArgs, handler: async (ctx, args): Promise<FunctionReturnType<Api['_approve']>> => {
    const snapshot = await ctx.runQuery(approvalInput, args);
    const contract = validated(() => createCloudPropertyContract(args.path, sources(snapshot.files), args.bindings));
    return ctx.runMutation(approveMutation, { ...args, bindings: contract.bindings, definitionHash: contract.definitionHash,
        sourceFingerprint: snapshot.sourceFingerprint, ownerHash: snapshot.ownerHash, ownerBytes: snapshot.ownerBytes });
}});
export const commit = action({ args: propertyCommitArgs, handler: async (ctx, args): Promise<FunctionReturnType<Api['_commit']>> => {
    // Current role and gates precede an exact receipt; source CAS and parsing follow it.
    // A retry retains the original intent and exact owner bytes.
    const queried = await ctx.runQuery(input, args);
    if (queried.receipt) return queried.receipt;
    if (!queried.snapshot) return cloudError('CLOUD_CONFLICT');
    const snapshot = queried.snapshot, saved = snapshot.contract, files = sources(snapshot.files);
    const result = validated(() => validateCloudPropertyCandidate({
        contract: { version: 1, path: saved.path, bindings: saved.bindings, definitionHash: saved.definitionHash }, files,
        bindingId: args.pin.bindingId, previousValue: args.previousValue, choiceId: args.choiceId, candidateSource: args.changes[0]!.content,
    }));
    const sibling = snapshot.sibling;
    let nextFingerprint: string | null = null;
    if (sibling?.active && sibling.version === 2 && sibling.designRevision === args.pin.designRevision
        && sibling.textBindings?.length && !sibling.bindings.length && !sibling.imageBindings?.length) {
        const original = files[saved.path];
        if (typeof original !== 'string') return cloudError('CLOUD_PROPERTY_INVALID_TARGET');
        const current = validated(() => createCloudTextContract(saved.path, original, sibling.textBindings!));
        if (current.fingerprint !== sibling.fingerprint) return cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        nextFingerprint = validated(() => createCloudTextContract(saved.path, result.source, sibling.textBindings!)).fingerprint;
    }
    return ctx.runMutation(commitMutation, { ...args, sourceFingerprint: snapshot.sourceFingerprint,
        ownerHash: snapshot.ownerHash, ownerBytes: snapshot.ownerBytes, nextHash: hash(result.source), nextBytes: Buffer.byteLength(result.source),
        sibling: sibling ? { id: sibling._id, identity: snapshotCanonicalJson(sibling), nextFingerprint } : null });
}});
