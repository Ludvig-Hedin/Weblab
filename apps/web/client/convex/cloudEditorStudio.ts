import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { contentBinding } from './cloudEditorContentSchema';
import { studioOperation, studioSettings } from './cloudEditorStudioSchema';
import { assertCloudRevision, assertOperationId, cloudError, cloudScope, inlineSourceBytes,
    MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, MAX_CLOUD_PROJECT_BYTES, validateCloudChanges } from './lib/cloudEditor';
import { JOURNAL_LIMIT, validateJournalItems, type CloudStudioFreezeInput } from './lib/cloudStudioContent';

export type StudioScope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type Context = QueryCtx | MutationCtx;
export const studioEnvelope = { ...cloudScope, actorId: v.id('users'), expectedRevision: v.number(),
    expectedGeneration: v.number(), operationId: v.string(), fingerprint: v.string() };
export const studioFileChange = v.object({ path: v.string(), content: v.string(), hash: v.string(), bytes: v.number() });
const contractChange = v.object({ path: v.string(), expectedGeneration: v.number(), expectedFingerprint: v.string(),
    bindings: v.array(contentBinding), fingerprint: v.string() });
type Envelope = StudioScope & { actorId: Id<'users'>; expectedRevision: number; expectedGeneration: number; operationId: string; fingerprint: string };
const sync = makeFunctionReference<'action', StudioScope, null>('cloudEditorRuntime:sync');
export async function studioContract(ctx: Context, scope: StudioScope) {
    const row = await ctx.db.query('cloudEditorStudioContracts').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (row && row.projectId !== scope.projectId) cloudError('CLOUD_NOT_ENROLLED');
    return row;
}
/** Call within the same transaction that captures source, never from a later action query. */
export async function readCloudStudioFreezeInput(ctx: Context, scope: StudioScope): Promise<CloudStudioFreezeInput | null> {
    const contract = await studioContract(ctx, scope);
    if (!contract) return null;
    const rows = await ctx.db.query('cloudEditorJournalItems').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).take(JOURNAL_LIMIT + 1);
    if (rows.some(row => row.projectId !== scope.projectId)) cloudError('CLOUD_NOT_ENROLLED');
    const items = rows.map(({ key, slug, revision, status, archived, values }) => ({ key, slug, revision, status, archived, values }))
        .sort((a, b) => a.key.localeCompare(b.key));
    validateJournalItems(items);
    const { profile, generation, active, allowPages, allowedBlocks, slots } = contract;
    const assets = (await studioFiles(ctx, scope)).filter(file => file.kind === 'file' && /^public\/.+\.(?:png|jpe?g|webp|avif|gif)$/i.test(file.path))
        .map(file => ({ path: file.path, hash: file.hash }));
    return { settings: { profile, generation, active, allowPages, allowedBlocks, slots }, items, assets };
}
export async function studioFiles(ctx: Context, scope: StudioScope) {
    const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', scope.branchId)).take(MAX_CLOUD_FILES + 1);
    if (files.length > MAX_CLOUD_FILES || files.some(file => file.projectId !== scope.projectId)) cloudError('CLOUD_FILE_LIMIT');
    return files;
}
/** Current authority is always checked before a matching receipt can be returned. */
export async function studioAdmission(ctx: Context, args: Envelope, designer: boolean) {
    const access = await requireCloudAccess(ctx, args, designer ? 'designer' : 'content');
    if (access.user._id !== args.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    assertCloudRevision(args.expectedRevision); assertOperationId(args.operationId);
    if (!Number.isSafeInteger(args.expectedGeneration) || args.expectedGeneration < 0 || !/^[a-f0-9]{64}$/.test(args.fingerprint)) cloudError('CLOUD_INVALID_OPERATION');
    const contract = await studioContract(ctx, args);
    if (!designer && !contract?.active) cloudError('CLOUD_STUDIO_UNAVAILABLE');
    const prior = await ctx.db.query('cloudEditorOperations').withIndex('by_branchId_operationId', q => q.eq('branchId', args.branchId).eq('operationId', args.operationId)).unique();
    if (prior && (prior.projectId !== args.projectId || prior.userId !== args.actorId || prior.fingerprint !== args.fingerprint)) cloudError('CLOUD_INVALID_OPERATION');
    if (prior) return { ...access, contract, receipt: { revision: prior.revision, currentRevision: access.state.revision } };
    if (access.state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
    if ((contract?.generation ?? 0) !== args.expectedGeneration) cloudError('CLOUD_STUDIO_STALE_APPROVAL');
    return { ...access, contract, receipt: null };
}
export const get = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const access = await requireCloudAccess(ctx, scope, 'content');
        const studio = await readCloudStudioFreezeInput(ctx, scope);
        return { actorId: access.user._id, revision: access.state.revision, canDesign: access.canDesign,
            settings: studio?.settings ?? null };
    },
});
function designerOperation(operation: { kind: string }) {
    return ['install', 'configure', 'approveSlot'].includes(operation.kind);
}
export const _input = internalQuery({
    args: { ...studioEnvelope, operation: studioOperation },
    handler: async (ctx, args) => {
        const admitted = await studioAdmission(ctx, args, designerOperation(args.operation));
        if (admitted.receipt) return { receipt: admitted.receipt, snapshot: null };
        const files = await studioFiles(ctx, args);
        const contracts = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
        if (contracts.length > MAX_CLOUD_FILES || contracts.some(contract => contract.projectId !== args.projectId)) cloudError('CLOUD_FILE_LIMIT');
        return { receipt: null, snapshot: { files, contracts, studio: await readCloudStudioFreezeInput(ctx, args) } };
    },
});
/** Shared only by trusted semantic actions. All validation precedes writes. */
export async function commitStudioFiles(ctx: MutationCtx, args: Envelope, admitted: Awaited<ReturnType<typeof studioAdmission>>,
    changes: Array<{ path: string; content: string; hash: string; bytes: number }>) {
    validateCloudChanges(changes);
    const files = await studioFiles(ctx, args), byPath = new Map(files.map(file => [file.path, file]));
    const next = new Map(files.map(file => [file.path, { text: file.text, bytes: file.bytes }]));
    let bytes = admitted.state.bytes;
    for (const change of changes) {
        if (!/^[a-f0-9]{64}$/.test(change.hash) || change.bytes !== new TextEncoder().encode(change.content).byteLength) cloudError('CLOUD_INVALID_CHANGES');
        const old = byPath.get(change.path);
        if (old && (old.kind !== 'file' || old.storageId || old.text === undefined)) cloudError('CLOUD_INVALID_CHANGES');
        if (files.some(file => file.kind === 'file' && change.path.startsWith(file.path + '/')) ||
            files.some(file => file.path.startsWith(change.path + '/'))) cloudError('CLOUD_INVALID_CHANGES');
        next.set(change.path, { text: change.content, bytes: change.bytes }); bytes += change.bytes - (old?.bytes ?? 0);
    }
    if (next.size > MAX_CLOUD_FILES || bytes > MAX_CLOUD_PROJECT_BYTES || bytes < 0 || inlineSourceBytes(next.values()) > MAX_CLOUD_INLINE_BYTES) cloudError('CLOUD_PROJECT_TOO_LARGE');
    const revision = admitted.state.revision + 1; assertCloudRevision(revision);
    const now = Date.now();
    for (const change of changes) {
        const old = byPath.get(change.path);
        const value = { text: change.content, bytes: change.bytes, hash: change.hash };
        if (old) await ctx.db.patch(old._id, value);
        else await ctx.db.insert('cloudEditorFiles', { projectId: args.projectId, branchId: args.branchId, path: change.path, kind: 'file', ...value });
    }
    await ctx.db.patch(admitted.state._id, { revision, bytes, fileCount: next.size, updatedAt: now });
    await ctx.db.insert('cloudEditorOperations', { projectId: args.projectId, branchId: args.branchId, userId: args.actorId,
        operationId: args.operationId, fingerprint: args.fingerprint, revision, storageIds: [], createdAt: now });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    await ctx.scheduler.runAfter(0, sync, { projectId: args.projectId, branchId: args.branchId });
    return { revision, currentRevision: revision };
}
export const _commit = internalMutation({
    args: { ...studioEnvelope, operation: studioOperation, settings: v.object(studioSettings),
        changes: v.array(studioFileChange), contracts: v.array(contractChange) },
    handler: async (ctx, args) => {
        const designer = designerOperation(args.operation);
        const admitted = await studioAdmission(ctx, args, designer);
        if (admitted.receipt) return admitted.receipt;
        if ((args.operation.kind === 'install') !== (admitted.contract === null)) cloudError('CLOUD_STUDIO_UNAVAILABLE');
        if (args.settings.slots.length > 20 || args.settings.slots.some(slot => slot.instances.length > 20)) cloudError('CLOUD_STUDIO_SLOT_LIMIT');
        if (args.settings.generation !== args.expectedGeneration + (designer ? 1 : 0)) cloudError('CLOUD_STUDIO_STALE_APPROVAL');
        const contracts = [];
        if (new Set(args.contracts.map(contract => contract.path)).size !== args.contracts.length) cloudError('CLOUD_INVALID_CHANGES');
        for (const next of args.contracts) {
            const old = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId).eq('path', next.path)).unique();
            if ((old?.generation ?? 0) !== next.expectedGeneration || (old?.fingerprint ?? '') !== next.expectedFingerprint ||
                (old && old.projectId !== args.projectId)) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
            if (!args.changes.some(change => change.path === next.path) || next.bindings.length > 100 || !/^[a-f0-9]{64}$/.test(next.fingerprint)) cloudError('CLOUD_INVALID_CHANGES');
            contracts.push({ old, next });
        }
        // Source, settings and changed content approvals share one transaction.
        const receipt = await commitStudioFiles(ctx, args, admitted, args.changes);
        const row = { projectId: args.projectId, branchId: args.branchId, ...args.settings,
            approvedByUserId: designer ? args.actorId : admitted.contract!.approvedByUserId, updatedAt: Date.now() };
        if (admitted.contract) await ctx.db.replace(admitted.contract._id, row);
        else await ctx.db.insert('cloudEditorStudioContracts', row);
        for (const { old, next } of contracts) {
            const value = { projectId: args.projectId, branchId: args.branchId, path: next.path, version: 1 as const,
                generation: next.expectedGeneration + 1, active: next.bindings.length > 0, bindings: next.bindings, fingerprint: next.fingerprint,
                approvedByUserId: admitted.contract?.approvedByUserId ?? args.actorId, approvedRevision: receipt.revision, updatedAt: Date.now() };
            if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert('cloudEditorContentContracts', value);
        }
        return receipt;
    },
});
