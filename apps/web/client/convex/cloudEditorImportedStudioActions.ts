'use node';

import { createHash } from 'node:crypto';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { action } from './_generated/server';
import type * as Backend from './cloudEditorImportedStudio';
import { importedStudioOperation, importedStudioPin } from './cloudEditorImportedStudioSchema';
import { assertOperationId, cloudError, cloudScope } from './lib/cloudEditor';
import { CloudContentContractError } from './lib/cloudContentContract';
import { snapshotCanonicalJson } from './lib/cloudImageIntegrity';
import { assertImportedStudioSource, prepareImportedStudioOperation } from './lib/cloudImportedStudio';
import { ImportedStudioError } from './lib/cloudImportedStudioState';

type Api = ApiFromModules<{ cloudEditorImportedStudio: typeof Backend }>['cloudEditorImportedStudio'];
const inputRef = makeFunctionReference<'query', FunctionArgs<Api['_input']>, FunctionReturnType<Api['_input']>>('cloudEditorImportedStudio:_input');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<Api['_commit']>, FunctionReturnType<Api['_commit']>>('cloudEditorImportedStudio:_commit');
const approvalRef = makeFunctionReference<'query', FunctionArgs<Api['_approvalInput']>, FunctionReturnType<Api['_approvalInput']>>('cloudEditorImportedStudio:_approvalInput');
const approveRef = makeFunctionReference<'mutation', FunctionArgs<Api['_approve']>, FunctionReturnType<Api['_approve']>>('cloudEditorImportedStudio:_approve');
const scopedPin = { ...cloudScope, actorId: v.id('users'), ...importedStudioPin };
type Contract = ReturnType<typeof assertImportedStudioSource>['owners'][number];
type SavedContract = NonNullable<FunctionReturnType<Api['_input']>['snapshot']>['contracts'][number];

function validated<T>(run: () => T): T {
    try { return run(); } catch (error) {
        if (error instanceof ImportedStudioError) return cloudError(`CLOUD_IMPORTED_STUDIO_${error.code}`);
        if (error instanceof CloudContentContractError) return cloudError(`CLOUD_CONTENT_${error.code}`);
        throw error;
    }
}
/** The exact current row is pinned, including active state and the complete leaf policy. */
function contractPlan(next: Contract, saved: SavedContract | undefined, before: Contract | undefined, designRevision: number, reapprove: boolean): FunctionArgs<Api['_commit']>['contracts'][number] {
    if (saved && (saved.version !== 2 || saved.bindings.length || saved.imageBindings?.length)) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    if (!reapprove && (before ? !saved?.active || saved.designRevision !== designRevision || saved.fingerprint !== before.fingerprint ||
        snapshotCanonicalJson(saved.textBindings ?? []) !== snapshotCanonicalJson(before.bindings) : saved !== undefined))
        cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    return { path: next.path, bindings: next.bindings, fingerprint: next.fingerprint,
        previous: saved ? snapshotCanonicalJson(saved) : null,
        before: before ? { bindings: before.bindings, fingerprint: before.fingerprint } : null };
}

export const commit = action({ args: { ...scopedPin, transport: v.literal('studio'), transportVersion: v.literal(2),
    operationId: v.string(), operation: importedStudioOperation }, handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
    assertOperationId(args.operationId);
    const fingerprint = createHash('sha256').update(snapshotCanonicalJson({ domain: 'cloud-imported-studio-v1', ...args })).digest('hex');
    const { transport: _transport, transportVersion: _version, ...request } = args;
    const input = await ctx.runQuery(inputRef, { ...request, fingerprint });
    if (input.receipt) return input.receipt;
    if (!input.snapshot) return cloudError('CLOUD_CONFLICT');
    const snapshot = input.snapshot;
    const before = args.operation.kind === 'capture' ? [] : validated(() => assertImportedStudioSource(snapshot)).owners;
    const result = validated(() => prepareImportedStudioOperation({ ...snapshot, operation: args.operation, operationId: args.operationId }));
    const contracts = result.textContracts.map(next => contractPlan(next, snapshot.contracts.find(row => row.path === next.path),
        before.find(row => row.path === next.path), snapshot.designRevision, false));
    return ctx.runMutation(commitRef, { ...request, fingerprint, sourceFingerprint: snapshot.sourceFingerprint,
        recipeFingerprint: result.recipeFingerprint, changes: result.changes, contracts });
} });

/** Explicit agency reactivation of unchanged captured recipes, including restored copies. */
export const reapprove = action({ args: scopedPin, handler: async (ctx, args): Promise<{ generation: number; recipeFingerprint: string; active: boolean; revision: number }> => {
    const input = await ctx.runQuery(approvalRef, args);
    const result = validated(() => assertImportedStudioSource(input));
    if (result.recipeFingerprint !== args.expectedRecipeFingerprint) cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    const contracts = result.owners.map(owner => contractPlan(owner, input.contracts.find(row => row.path === owner.path), undefined, input.designRevision, true));
    return ctx.runMutation(approveRef, { ...args, sourceFingerprint: input.sourceFingerprint, contracts });
} });
