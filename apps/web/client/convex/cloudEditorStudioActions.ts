'use node';

import { v } from 'convex/values';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { action } from './_generated/server';
import type * as Studio from './cloudEditorStudio';
import { studioOperation } from './cloudEditorStudioSchema';
import { assertContentOidUniqueness } from './cloudEditorContentActions';
import { approveCloudContentBindings, validateCloudContentCandidate, CloudContentContractError } from './lib/cloudContentContract';
import { assertCloudRevision, assertOperationId, cloudError, cloudScope, validateCloudChanges } from './lib/cloudEditor';
import { assertCloudStudioSource } from './lib/cloudStudioContent';
import { prepareStudioOperation, studioFingerprint, studioHash } from './lib/cloudStudioTemplate';

type Api = ApiFromModules<{ studio: typeof Studio }>['studio'];
const inputRef = makeFunctionReference<'query', FunctionArgs<Api['_input']>, FunctionReturnType<Api['_input']>>('cloudEditorStudio:_input');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<Api['_commit']>, FunctionReturnType<Api['_commit']>>('cloudEditorStudio:_commit');
export const commit = action({
    args: { ...cloudScope, actorId: v.id('users'), expectedRevision: v.number(), expectedGeneration: v.number(), operationId: v.string(), operation: studioOperation },
    handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
        try {
        assertOperationId(args.operationId); assertCloudRevision(args.expectedRevision);
        const envelope = { ...args, fingerprint: studioFingerprint('cloud-studio-structure-v1', args) };
        const input = await ctx.runQuery(inputRef, envelope);
        if (input.receipt) return input.receipt;
        const snapshot = input.snapshot!;
        if (snapshot.studio) assertCloudStudioSource(snapshot.studio, snapshot.files);
        const result = prepareStudioOperation({ files: snapshot.files, studio: snapshot.studio, operation: args.operation, operationId: args.operationId });
        validateCloudChanges(result.changes);
        const assets = snapshot.files.filter(file => file.path.startsWith('public/') && file.kind === 'file').map(file => file.path.slice('public'.length));
        const contracts: FunctionArgs<Api['_commit']>['contracts'] = [];
        for (const change of result.changes) {
            const previous = snapshot.contracts.find(contract => contract.path === change.path);
            const original = snapshot.files.find(file => file.path === change.path);
            const additions = result.addedBindings.get(change.path) ?? [];
            if (!previous && !additions.length) continue;
            if (previous?.active) {
                if (typeof original?.text !== 'string') cloudError('CLOUD_CONTENT_STALE_CONTRACT');
                validateCloudContentCandidate({ contract: previous, originalSource: original.text, candidateSource: original.text, approvedAssetPaths: assets });
            }
            const bindings = [...(previous?.active ? previous.bindings : []).filter(binding => !result.removedOids.has(binding.oid)), ...additions];
            const fingerprint = bindings.length ? approveCloudContentBindings({ path: change.path, source: change.content,
                bindings, approvedAssetPaths: assets }).fingerprint : studioHash(change.content);
            contracts.push({ path: change.path, expectedGeneration: previous?.generation ?? 0,
                expectedFingerprint: previous?.fingerprint ?? '', bindings, fingerprint });
        }
        const nextFiles = new Map(snapshot.files.map(file => [file.path, { path: file.path, text: file.text, kind: file.kind }]));
        for (const change of result.changes) nextFiles.set(change.path, { path: change.path, kind: 'file', text: change.content });
        assertContentOidUniqueness([...nextFiles.values()]);
        return await ctx.runMutation(commitRef, { ...envelope, settings: result.settings, contracts,
            changes: result.changes.map(change => ({ ...change, hash: studioHash(change.content), bytes: Buffer.byteLength(change.content) })) });
        } catch (error) {
            if (error instanceof CloudContentContractError) cloudError(`CLOUD_CONTENT_${error.code}`);
            throw error;
        }
    },
});
