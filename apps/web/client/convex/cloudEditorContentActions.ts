'use node';

import { createHash } from 'node:crypto';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { EditorAttributes } from '@weblab/constants';
import { parse, t } from '@weblab/parser/src/packages';
import { action } from './_generated/server';
import type * as Backend from './cloudEditorContent';
import { contentBinding, contentCandidate, contentTransport, expectedContract } from './cloudEditorContentSchema';
import { assertCloudRevision, assertOperationId, cloudError, cloudScope, validateCloudChanges } from './lib/cloudEditor';
import { approveCloudContentBindings, validateCloudContentCandidate, CloudContentContractError, type CloudContentContract } from './lib/cloudContentContract';

type Api = ApiFromModules<{ cloudEditorContent: typeof Backend }>['cloudEditorContent'];
const approvalInputRef = makeFunctionReference<'query', FunctionArgs<Api['_approvalInput']>, FunctionReturnType<Api['_approvalInput']>>('cloudEditorContent:_approvalInput');
const approveRef = makeFunctionReference<'mutation', FunctionArgs<Api['_approve']>, FunctionReturnType<Api['_approve']>>('cloudEditorContent:_approve');
const inputRef = makeFunctionReference<'query', FunctionArgs<Api['_input']>, FunctionReturnType<Api['_input']>>('cloudEditorContent:_input');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<Api['_commit']>, FunctionReturnType<Api['_commit']>>('cloudEditorContent:_commit');
const hash = (source: string): string => createHash('sha256').update(source).digest('hex');

function validated<T>(run: () => T): T {
    try { return run(); } catch (error) {
        if (error instanceof CloudContentContractError) return cloudError(`CLOUD_CONTENT_${error.code}`);
        throw error;
    }
}

/** The supplied files are the complete enrolled branch, never a global OID lookup. */
export function assertContentOidUniqueness(files: ReadonlyArray<{ path: string; text?: string; kind: string }>): void {
    const ids = new Set<string>();
    for (const file of files) {
        if (file.kind !== 'file' || !/\.[cm]?[jt]sx?$/.test(file.path)) continue;
        if (typeof file.text !== 'string') cloudError('CLOUD_CONTENT_INVALID_SOURCE');
        let ast: ReturnType<typeof parse>;
        try {
            ast = parse(file.text, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx', ['decorators', { decoratorsBeforeExport: true }], 'classStaticBlock', 'dynamicImport', 'importMeta'] });
        } catch { return cloudError('CLOUD_CONTENT_INVALID_SOURCE'); }
        t.traverseFast(ast, node => {
            if (!t.isJSXOpeningElement(node)) return;
            const attrs = node.attributes.filter(attribute => t.isJSXAttribute(attribute) &&
                t.isJSXIdentifier(attribute.name, { name: EditorAttributes.DATA_WEBLAB_ID }));
            if (!attrs.length) return;
            const attr = attrs[0];
            if (attrs.length !== 1 || !t.isJSXAttribute(attr) || !t.isStringLiteral(attr.value) ||
                !/^[A-Za-z0-9_.:-]{1,160}$/.test(attr.value.value) || ids.has(attr.value.value)) cloudError('CLOUD_CONTENT_DUPLICATE_OID');
            ids.add(attr.value.value);
        });
    }
}

export const approve = action({
    args: { ...cloudScope, path: v.string(), expectedRevision: v.number(), expectedGeneration: v.number(),
        oids: v.optional(v.array(v.string())), bindings: v.optional(v.array(contentBinding)) },
    handler: async (ctx, args): Promise<{ path: string; generation: number; fingerprint: string }> => {
        const { oids, bindings, ...scope } = args;
        if ((oids === undefined) === (bindings === undefined)) cloudError('CLOUD_CONTENT_INVALID_TARGET');
        const selected = bindings ?? oids!.map(oid => ({ oid, fields: ['text'] as Array<'text'> }));
        if (!selected.length || selected.length > 100 || new Set(selected.map(binding => binding.oid)).size !== selected.length)
            cloudError('CLOUD_CONTENT_INVALID_TARGET');
        const input = await ctx.runQuery(approvalInputRef, scope);
        const contract = validated(() => approveCloudContentBindings({ path: args.path, source: input.source,
            bindings: selected, approvedAssetPaths: input.approvedAssetPaths }));
        assertContentOidUniqueness(input.files);
        return ctx.runMutation(approveRef, { ...scope, actorId: input.actorId,
            bindings: contract.bindings,
            fingerprint: contract.fingerprint });
    },
});

export const commit = action({
    args: { ...cloudScope, ...contentTransport, actorId: v.id('users'), expectedRevision: v.number(), operationId: v.string(),
        changes: v.array(contentCandidate), expectedContracts: v.array(expectedContract) },
    handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
        assertCloudRevision(args.expectedRevision); assertOperationId(args.operationId); validateCloudChanges(args.changes);
        // A durable recovery operation carries its original transport; UI mode cannot reinterpret it.
        if (args.transport !== 'content' || args.transportVersion !== 1) cloudError('CLOUD_INVALID_OPERATION');
        const expected = new Map<string, number>();
        for (const entry of args.expectedContracts) {
            if (expected.has(entry.path) || !Number.isSafeInteger(entry.generation) || entry.generation < 1)
                cloudError('CLOUD_CONTENT_INVALID_GENERATION');
            expected.set(entry.path, entry.generation);
        }
        if (expected.size !== args.changes.length || args.changes.some(change => !expected.has(change.path)))
            cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        const sorted = [...args.changes].sort((a, b) => a.path.localeCompare(b.path));
        const fingerprint = hash(JSON.stringify({ transport: args.transport, transportVersion: args.transportVersion,
            projectId: args.projectId, branchId: args.branchId, actorId: args.actorId, revision: args.expectedRevision,
            changes: sorted.map(change => ({ path: change.path, hash: hash(change.content), generation: expected.get(change.path) })) }));
        const scope = { projectId: args.projectId, branchId: args.branchId, actorId: args.actorId,
            transport: args.transport, transportVersion: args.transportVersion,
            expectedRevision: args.expectedRevision, operationId: args.operationId, fingerprint };
        const input = await ctx.runQuery(inputRef, { ...scope, expectedContracts: args.expectedContracts });
        if (input.receipt) return input.receipt;
        if (!input.snapshot) return cloudError('CLOUD_CONFLICT');
        const files = new Map(input.snapshot.files.map(file => [file.path, file]));
        const contracts = new Map(input.snapshot.contracts.map(contract => [contract.path, contract]));
        const changes: FunctionArgs<Api['_commit']>['changes'] = [];
        for (const candidate of sorted) {
            const file = files.get(candidate.path);
            const saved = contracts.get(candidate.path);
            if (!file || typeof file.text !== 'string' || !saved) cloudError('CLOUD_CONTENT_INVALID_TARGET');
            const contract: CloudContentContract = { version: saved.version, path: saved.path, bindings: saved.bindings, fingerprint: saved.fingerprint };
            const originalSource = file.text;
            const result = validated(() => validateCloudContentCandidate({ contract, originalSource,
                candidateSource: candidate.content, approvedAssetPaths: input.snapshot.approvedAssetPaths }));
            // The comparison may accept compiler-empty JSX formatting changes.
            // Bind the next contract to the actual saved bytes with the existing
            // fingerprint algorithm, without changing the designer's approval.
            const nextContract = validated(() => approveCloudContentBindings({ path: saved.path,
                source: result.source, bindings: saved.bindings, approvedAssetPaths: input.snapshot.approvedAssetPaths }));
            changes.push({ path: candidate.path, content: result.source, hash: hash(result.source),
                bytes: Buffer.byteLength(result.source), generation: saved.generation,
                contractFingerprint: saved.fingerprint, nextContractFingerprint: nextContract.fingerprint });
            files.set(candidate.path, { ...file, text: result.source });
        }
        // Includes every changed file together and unchanged source, including generated br IDs.
        assertContentOidUniqueness([...files.values()]);
        return ctx.runMutation(commitRef, { ...scope, changes });
    },
});
