'use node';

import { createHash } from 'node:crypto';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { resolveContentTextRenderMapping, ContentTextRenderMappingError } from '@weblab/parser/src/code-edit/content-render-mapping';
import { ContentTextTargetError } from '@weblab/parser/src/code-edit/content-target';
import { action } from './_generated/server';
import type * as Backend from './cloudEditorText';
import { assertContentOidUniqueness } from './cloudEditorContentActions';
import { contentCandidate, contentTextBinding, expectedTextContract, textTransport } from './cloudEditorContentSchema';
import { assertCloudRevision, assertOperationId, cloudError, cloudScope, MAX_CLOUD_CHANGE_BYTES, validateCloudChanges } from './lib/cloudEditor';
import { CloudContentContractError } from './lib/cloudContentContract';
import { createCloudTextContract, validateCloudTextCandidate, type ContentTextBinding } from './lib/cloudContentTextContract';

type Api = ApiFromModules<{ cloudEditorText: typeof Backend }>['cloudEditorText'];
const approvalInputRef = makeFunctionReference<'query', FunctionArgs<Api['_approvalInput']>, FunctionReturnType<Api['_approvalInput']>>('cloudEditorText:_approvalInput');
const selectionInputRef = makeFunctionReference<'query', FunctionArgs<Api['_selectionInput']>, FunctionReturnType<Api['_selectionInput']>>('cloudEditorText:_selectionInput');
const approveRef = makeFunctionReference<'mutation', FunctionArgs<Api['_approve']>, FunctionReturnType<Api['_approve']>>('cloudEditorText:_approve');
const inputRef = makeFunctionReference<'query', FunctionArgs<Api['_input']>, FunctionReturnType<Api['_input']>>('cloudEditorText:_input');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<Api['_commit']>, FunctionReturnType<Api['_commit']>>('cloudEditorText:_commit');
const hash = (source: string): string => createHash('sha256').update(source).digest('hex');
function validated<T>(run: () => T): T {
    try { return run(); } catch (error) {
        if (error instanceof CloudContentContractError) return cloudError(`CLOUD_CONTENT_${error.code}`);
        if (error instanceof ContentTextRenderMappingError || error instanceof ContentTextTargetError)
            return cloudError('CLOUD_CONTENT_INVALID_TARGET');
        throw error;
    }
}
function sourceInventory(files: Array<{ path: string; kind?: string; text?: string; storageId?: unknown }>): Record<string, string> {
    // A storage-backed source module is not an asset we can silently omit: it
    // could add another consumer or mutate an otherwise approved data owner.
    if (files.some(file => file.kind !== 'directory' && !file.path.startsWith('public/') && /\.[cm]?[jt]sx?$/.test(file.path)
        && (typeof file.text !== 'string' || file.storageId !== undefined))) cloudError('CLOUD_CONTENT_INVALID_TARGET');
    return Object.fromEntries(files.filter(file => typeof file.text === 'string').map(file => [file.path, file.text!]));
}
function validateMappings(path: string, bindings: ContentTextBinding[], files: Record<string, string>): void {
    for (const binding of bindings) {
        if (binding.target.kind !== 'data-leaf') continue;
        const mapping = binding.renderMapping;
        if (!mapping) cloudError('CLOUD_CONTENT_INVALID_TARGET');
        const resolved = validated(() => resolveContentTextRenderMapping({ files, oid: mapping.renderer.oid,
            mappingId: mapping.mappingId, itemId: binding.target.kind === 'data-leaf' ? binding.target.itemId : '' }));
        if (resolved.path !== path || resolved.target.exportName !== binding.target.exportName
            || resolved.target.itemId !== binding.target.itemId || resolved.target.property !== binding.target.property
            || resolved.renderMapping.kind !== mapping.kind || resolved.renderMapping.version !== mapping.version
            || resolved.renderMapping.mappingId !== mapping.mappingId
            || (['callsite', 'renderer'] as const).some(key => resolved.renderMapping[key].path !== mapping[key].path
                || resolved.renderMapping[key].exportName !== mapping[key].exportName || resolved.renderMapping[key].oid !== mapping[key].oid))
            cloudError('CLOUD_CONTENT_INVALID_TARGET');
    }
}
/** A saved-source candidate for the existing selection panel. This grants no edit authority. */
export const resolveSelection = action({
    args: { ...cloudScope, expectedRevision: v.number(), oid: v.string(), mappingId: v.string(), itemId: v.string() },
    handler: async (ctx, args) => {
        const input = await ctx.runQuery(selectionInputRef, { projectId: args.projectId, branchId: args.branchId, expectedRevision: args.expectedRevision });
        const candidate = validated(() => resolveContentTextRenderMapping({ files: sourceInventory(input.files),
            oid: args.oid, mappingId: args.mappingId, itemId: args.itemId }));
        assertContentOidUniqueness(input.files);
        const prior = input.contracts.find(row => row.path === candidate.path);
        if (prior && prior.version !== 2) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        return { ...candidate, actorId: input.actorId, revision: input.revision, designRevision: input.designRevision,
            generation: prior?.generation ?? 0 };
    },
});
/** Resolves source leaves and any rendered mappings against one complete saved revision. */
export const approve = action({
    args: { ...cloudScope, actorId: v.id('users'), path: v.string(), expectedRevision: v.number(), expectedGeneration: v.number(), bindings: v.array(contentTextBinding) },
    handler: async (ctx, args): Promise<{ path: string; version: 2; generation: number; designRevision: number; fingerprint: string }> => {
        const { bindings, ...scope } = args;
        const input = await ctx.runQuery(approvalInputRef, scope);
        const contract = validated(() => createCloudTextContract(args.path, input.source, bindings));
        validateMappings(args.path, contract.bindings, sourceInventory(input.files));
        // A rendered OID must have one source owner across the saved project.
        // Every later unrestricted source write invalidates this approval's epoch.
        assertContentOidUniqueness(input.files);
        return ctx.runMutation(approveRef, { ...scope, actorId: input.actorId, designRevision: input.designRevision,
            bindings: contract.bindings, fingerprint: contract.fingerprint });
    },
});
export const commit = action({
    args: { ...cloudScope, ...textTransport, actorId: v.id('users'), expectedRevision: v.number(), operationId: v.string(),
        changes: v.array(contentCandidate), expectedContracts: v.array(expectedTextContract) },
    handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
        assertCloudRevision(args.expectedRevision); assertOperationId(args.operationId); validateCloudChanges(args.changes);
        if (args.transport !== 'content' || args.transportVersion !== 2) cloudError('CLOUD_INVALID_OPERATION');
        if (Buffer.byteLength(JSON.stringify(args)) > MAX_CLOUD_CHANGE_BYTES) cloudError('CLOUD_CHANGE_TOO_LARGE');
        const expected = new Map<string, typeof args.expectedContracts[number]>();
        for (const entry of args.expectedContracts) {
            if (entry.version !== 2 || !Number.isSafeInteger(entry.designRevision) || entry.designRevision < 1 ||
                entry.designRevision > args.expectedRevision) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
            if (expected.has(entry.path) || !Number.isSafeInteger(entry.generation) || entry.generation < 1 || entry.generation >= Number.MAX_SAFE_INTEGER)
                cloudError('CLOUD_CONTENT_INVALID_GENERATION');
            expected.set(entry.path, entry);
        }
        if (expected.size !== args.changes.length || args.changes.some(change => !expected.has(change.path))) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        const sorted = [...args.changes].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        const fingerprint = hash(JSON.stringify({ transport: args.transport, transportVersion: args.transportVersion,
            projectId: args.projectId, branchId: args.branchId, actorId: args.actorId, expectedRevision: args.expectedRevision,
            operationId: args.operationId, changes: sorted.map(change => ({ path: change.path, hash: hash(change.content),
                version: expected.get(change.path)!.version, generation: expected.get(change.path)!.generation,
                designRevision: expected.get(change.path)!.designRevision })) }));
        const scope = { projectId: args.projectId, branchId: args.branchId, actorId: args.actorId,
            transport: args.transport, transportVersion: args.transportVersion,
            expectedRevision: args.expectedRevision, operationId: args.operationId, fingerprint };
        const input = await ctx.runQuery(inputRef, { ...scope, expectedContracts: args.expectedContracts });
        if (input.receipt) return input.receipt;
        if (!input.snapshot) return cloudError('CLOUD_CONFLICT');
        const files = new Map(input.snapshot.files.map(file => [file.path, file]));
        const contracts = new Map(input.snapshot.contracts.map(contract => [contract.path, contract]));
        const sources = sourceInventory(input.snapshot.files);
        const changes: FunctionArgs<Api['_commit']>['changes'] = [];
        for (const candidate of sorted) {
            const file = files.get(candidate.path);
            const saved = contracts.get(candidate.path);
            if (!file || typeof file.text !== 'string' || !saved || saved.version !== 2 || !saved.textBindings || saved.designRevision === undefined)
                cloudError('CLOUD_CONTENT_INVALID_TARGET');
            const contract = { version: 2 as const, path: saved.path, bindings: saved.textBindings, fingerprint: saved.fingerprint };
            validateMappings(saved.path, saved.textBindings, sources);
            const originalSource = file.text;
            const result = validated(() => validateCloudTextCandidate({ contract, originalSource, candidateSource: candidate.content }));
            const next = validated(() => createCloudTextContract(saved.path, result.source, saved.textBindings!));
            changes.push({ path: candidate.path, content: result.source, hash: hash(result.source), bytes: Buffer.byteLength(result.source),
                version: 2, generation: saved.generation, designRevision: saved.designRevision,
                contractFingerprint: saved.fingerprint, nextContractFingerprint: next.fingerprint });
        }
        return ctx.runMutation(commitRef, { ...scope, changes });
    },
});
