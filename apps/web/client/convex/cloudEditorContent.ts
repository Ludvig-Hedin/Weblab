import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { contentBinding, contentTransport, expectedContract } from './cloudEditorContentSchema';
import { assertCloudRevision, assertOperationId, cloudError, cloudPath, cloudScope,
    inlineSourceBytes, MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, MAX_CLOUD_PROJECT_BYTES,
    validateCloudChanges } from './lib/cloudEditor';

type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type Context = QueryCtx | MutationCtx;
const syncRef = makeFunctionReference<'action', Scope, null>('cloudEditorRuntime:sync');
const operationArgs = { ...cloudScope, ...contentTransport, actorId: v.id('users'),
    expectedRevision: v.number(), operationId: v.string(), fingerprint: v.string() };
const validatedChange = v.object({ path: v.string(), content: v.string(), hash: v.string(), bytes: v.number(),
    generation: v.number(), contractFingerprint: v.string(), nextContractFingerprint: v.string() });

function generation(value: number, allowZero = false): void {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value >= Number.MAX_SAFE_INTEGER)
        cloudError('CLOUD_CONTENT_INVALID_GENERATION');
}
function assertHash(value: string): void {
    if (!/^[a-f0-9]{64}$/.test(value)) cloudError('CLOUD_INVALID_OPERATION');
}
async function contractFor(ctx: Context, scope: Scope, path: string) {
    cloudPath(path);
    const contract = await ctx.db.query('cloudEditorContentContracts')
        .withIndex('by_branchId_and_path', q => q.eq('branchId', scope.branchId).eq('path', path)).unique();
    if (contract && contract.projectId !== scope.projectId) cloudError('CLOUD_NOT_ENROLLED');
    return contract;
}
async function filesFor(ctx: Context, scope: Scope) {
    const files = await ctx.db.query('cloudEditorFiles')
        .withIndex('by_branchId_path', q => q.eq('branchId', scope.branchId)).take(MAX_CLOUD_FILES + 1);
    if (files.length > MAX_CLOUD_FILES) cloudError('CLOUD_FILE_LIMIT');
    if (files.some(file => file.projectId !== scope.projectId)) cloudError('CLOUD_NOT_ENROLLED');
    return files;
}
function imageAssets(files: Awaited<ReturnType<typeof filesFor>>) {
    return files.filter(file => file.kind === 'file' && /^public\/.+\.(?:avif|gif|jpe?g|png|svg|webp|ico)$/i.test(file.path)
        && !/[\\?#\s%]/.test(file.path) && !file.path.split('/').some(part => part === '.' || part === '..'))
        .map(file => ({ path: file.path, url: file.path.slice('public'.length) }));
}
/** Asset ownership is only a chooser input. Each binding must approve its own URLs. */
export const assets = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const { state } = await requireCloudAccess(ctx, scope, 'designer');
        return { revision: state.revision, assets: imageAssets(await filesFor(ctx, scope)) };
    },
});
async function checkedContracts(ctx: Context, scope: Scope, expected: Array<{ path: string; generation: number }>) {
    if (!expected.length || expected.length > MAX_CLOUD_FILES) cloudError('CLOUD_INVALID_CHANGES');
    const seen = new Set<string>();
    return Promise.all(expected.map(async entry => {
        generation(entry.generation);
        if (seen.has(entry.path)) cloudError('CLOUD_DUPLICATE_PATH');
        seen.add(entry.path);
        const row = await contractFor(ctx, scope, entry.path);
        if (!row || !row.active || row.generation !== entry.generation) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        return row;
    }));
}

export const contracts = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const access = await requireCloudAccess(ctx, scope);
        if (!access.canEditContent) cloudError('CLOUD_ROLE_REQUIRED');
        const rows = await ctx.db.query('cloudEditorContentContracts')
            .withIndex('by_branchId_and_path', q => q.eq('branchId', scope.branchId)).take(MAX_CLOUD_FILES + 1);
        if (rows.length > MAX_CLOUD_FILES) cloudError('CLOUD_FILE_LIMIT');
        if (rows.some(row => row.projectId !== scope.projectId)) cloudError('CLOUD_NOT_ENROLLED');
        return { actorId: access.user._id, revision: access.state.revision,
            contracts: rows.map(({ path, generation, bindings, fingerprint, active }) => ({ path, generation, bindings, fingerprint, active })) };
    },
});

export const _approvalInput = internalQuery({
    args: { ...cloudScope, path: v.string(), expectedRevision: v.number(), expectedGeneration: v.number() },
    handler: async (ctx, args) => {
        const { state, user } = await requireCloudAccess(ctx, args, 'designer');
        assertCloudRevision(args.expectedRevision); generation(args.expectedGeneration, true);
        if (state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
        const prior = await contractFor(ctx, args, args.path);
        if ((prior?.generation ?? 0) !== args.expectedGeneration) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        const files = await filesFor(ctx, args);
        const file = files.find(file => file.path === args.path);
        if (!file || file.kind !== 'file' || typeof file.text !== 'string') cloudError('CLOUD_CONTENT_INVALID_TARGET');
        return { actorId: user._id, source: file.text, files, approvedAssetPaths: imageAssets(files).map(asset => asset.url) };
    },
});

export const _approve = internalMutation({
    args: { ...cloudScope, actorId: v.id('users'), path: v.string(), expectedRevision: v.number(), expectedGeneration: v.number(),
        bindings: v.array(contentBinding), fingerprint: v.string() },
    handler: async (ctx, args) => {
        const { state, user } = await requireCloudAccess(ctx, args, 'designer');
        if (user._id !== args.actorId) cloudError('CLOUD_ACTOR_CHANGED');
        assertCloudRevision(args.expectedRevision); generation(args.expectedGeneration, true); assertHash(args.fingerprint);
        if (state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
        const prior = await contractFor(ctx, args, args.path);
        if ((prior?.generation ?? 0) !== args.expectedGeneration) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        if (!args.bindings.length || args.bindings.length > 100 || new Set(args.bindings.map(b => b.oid)).size !== args.bindings.length ||
            args.bindings.some(b => !b.fields.length || new Set(b.fields).size !== b.fields.length)) cloudError('CLOUD_CONTENT_INVALID_TARGET');
        const files = await filesFor(ctx, args);
        if (!files.some(file => file.path === args.path && file.kind === 'file' && typeof file.text === 'string')) cloudError('CLOUD_CONTENT_INVALID_TARGET');
        if (!prior) {
            const rows = await ctx.db.query('cloudEditorContentContracts')
                .withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES);
            if (rows.length >= MAX_CLOUD_FILES) cloudError('CLOUD_FILE_LIMIT');
        }
        const next = { projectId: args.projectId, branchId: args.branchId, path: args.path, version: 1 as const,
            generation: args.expectedGeneration + 1, active: true, bindings: args.bindings, fingerprint: args.fingerprint,
            approvedByUserId: user._id, approvedRevision: state.revision, updatedAt: Date.now() };
        if (prior) await ctx.db.replace(prior._id, next);
        else await ctx.db.insert('cloudEditorContentContracts', next);
        return { path: args.path, generation: next.generation, fingerprint: next.fingerprint };
    },
});

export const revoke = mutation({
    args: { ...cloudScope, path: v.string(), expectedGeneration: v.number() },
    handler: async (ctx, args) => {
        await requireCloudAccess(ctx, args, 'designer');
        generation(args.expectedGeneration);
        const row = await contractFor(ctx, args, args.path);
        if (!row || row.generation !== args.expectedGeneration) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        const next = row.generation + 1;
        await ctx.db.patch(row._id, { active: false, generation: next, updatedAt: Date.now() });
        return { path: args.path, generation: next };
    },
});

/** Fresh permission checks precede receipt lookup; matching receipts precede revision checks. */
async function admission(ctx: Context, args: Scope & { actorId: Id<'users'>;
    expectedRevision: number; operationId: string; fingerprint: string }) {
    const access = await requireCloudAccess(ctx, args, 'content');
    assertCloudRevision(args.expectedRevision); assertOperationId(args.operationId); assertHash(args.fingerprint);
    if (access.user._id !== args.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    const prior = await ctx.db.query('cloudEditorOperations')
        .withIndex('by_branchId_operationId', q => q.eq('branchId', args.branchId).eq('operationId', args.operationId)).unique();
    if (prior && (prior.projectId !== args.projectId || prior.userId !== access.user._id || prior.fingerprint !== args.fingerprint))
        cloudError('CLOUD_INVALID_OPERATION');
    return { ...access, receipt: prior ? { revision: prior.revision, currentRevision: access.state.revision } : null };
}

export const _input = internalQuery({
    args: { ...operationArgs, expectedContracts: v.array(expectedContract) },
    handler: async (ctx, args) => {
        const { state, receipt } = await admission(ctx, args);
        if (receipt) return { receipt, snapshot: null };
        if (state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
        const approved = await checkedContracts(ctx, args, args.expectedContracts);
        const files = await filesFor(ctx, args);
        return { receipt: null, snapshot: { revision: state.revision, files, contracts: approved,
            approvedAssetPaths: imageAssets(files).map(asset => asset.url) } };
    },
});

/** Only the Node validator may invoke this atomic publication boundary. Sync never provisions a VM. */
export const _commit = internalMutation({
    args: { ...operationArgs, changes: v.array(validatedChange) },
    handler: async (ctx, args) => {
        const { state, user, receipt } = await admission(ctx, args);
        if (receipt) return receipt;
        if (state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
        validateCloudChanges(args.changes);
        const approved = await checkedContracts(ctx, args, args.changes.map(c => ({ path: c.path, generation: c.generation })));
        const files = await filesFor(ctx, args);
        const byPath = new Map(files.map(file => [file.path, file]));
        const next = new Map(files.map(file => [file.path, { bytes: file.bytes, text: file.text }]));
        let total = state.bytes;
        // Finish all bounded validation before the first write (Convex also rolls back on throw).
        for (const change of args.changes) {
            const old = byPath.get(change.path);
            const contract = approved.find(row => row.path === change.path);
            if (!old || old.kind !== 'file' || typeof old.text !== 'string' || old.storageId) cloudError('CLOUD_CONTENT_INVALID_TARGET');
            if (!contract || contract.fingerprint !== change.contractFingerprint) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
            assertHash(change.contractFingerprint);
            assertHash(change.nextContractFingerprint);
            assertHash(change.hash);
            if (change.bytes !== new TextEncoder().encode(change.content).byteLength) cloudError('CLOUD_INVALID_CHANGES');
            total += change.bytes - old.bytes;
            next.set(change.path, { bytes: change.bytes, text: change.content });
        }
        if (!Number.isSafeInteger(total) || total < 0 || total > MAX_CLOUD_PROJECT_BYTES || inlineSourceBytes(next.values()) > MAX_CLOUD_INLINE_BYTES)
            cloudError('CLOUD_PROJECT_TOO_LARGE');
        const revision = state.revision + 1;
        assertCloudRevision(revision);
        const now = Date.now();
        for (const change of args.changes) {
            await ctx.db.patch(byPath.get(change.path)!._id, { text: change.content, hash: change.hash, bytes: change.bytes });
            // Same transaction as source publication. Only its representation
            // fingerprint advances; generation, bindings and approver stay put.
            const contract = approved.find(row => row.path === change.path)!;
            await ctx.db.patch(contract._id, { fingerprint: change.nextContractFingerprint });
        }
        await ctx.db.patch(state._id, { revision, bytes: total, fileCount: files.length, updatedAt: now });
        await ctx.db.insert('cloudEditorOperations', { projectId: args.projectId, branchId: args.branchId, userId: user._id,
            operationId: args.operationId, fingerprint: args.fingerprint, revision, storageIds: [], createdAt: now });
        await ctx.db.patch(args.projectId, { updatedAt: now });
        await ctx.scheduler.runAfter(0, syncRef, { projectId: args.projectId, branchId: args.branchId });
        return { revision, currentRevision: revision };
    },
});
