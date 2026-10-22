import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './_generated/server';
import { assertOperationId, cloudError, cloudScope, MAX_CLOUD_ASSET_BYTES, MAX_CLOUD_CHANGE_BYTES, MAX_CLOUD_FILES } from './lib/cloudEditor';
import { requireCap } from './lib/permissions';

const DAY = 24 * 60 * 60_000;
type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
const collectRef = makeFunctionReference<'mutation', { attemptId: Id<'cloudEditorUploadAttempts'> }, null>('cloudEditorUploads:_collect');

async function writableScope(ctx: MutationCtx, scope: Scope) {
    if (process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true') return cloudError('CLOUD_DISABLED');
    const { user } = await requireCap(ctx, 'project.update', { projectId: scope.projectId });
    const branch = await ctx.db.get(scope.branchId);
    const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (!branch || branch.projectId !== scope.projectId || !state || state.projectId !== scope.projectId || state.version !== 1)
        return cloudError('CLOUD_NOT_ENROLLED');
    return user;
}

function ownedAttempt(attempt: Doc<'cloudEditorUploadAttempts'> | null, scope: Scope, userId: Id<'users'>) {
    if (!attempt || attempt.projectId !== scope.projectId || attempt.branchId !== scope.branchId || attempt.userId !== userId)
        return cloudError('CLOUD_INVALID_UPLOAD');
    return attempt;
}

function openAttempt(attempt: Doc<'cloudEditorUploadAttempts'>): void {
    if (attempt.status !== 'open' || attempt.expiresAt <= Date.now()) cloudError('CLOUD_UPLOAD_EXPIRED');
}

/** Each action attempt gets its own durable record before its first storage.store. */
export const _begin = internalMutation({
    args: { ...cloudScope, operationId: v.string(), fingerprint: v.string() },
    handler: async (ctx, args) => {
        const user = await writableScope(ctx, args);
        assertOperationId(args.operationId);
        if (!/^[a-f0-9]{64}$/.test(args.fingerprint)) return cloudError('CLOUD_INVALID_OPERATION');
        const now = Date.now();
        const recent = await ctx.db.query('cloudEditorUploadAttempts')
            .withIndex('by_projectId_createdAt', q => q.eq('projectId', args.projectId).gte('createdAt', now - DAY))
            .take(21);
        if (recent.length >= 20 || recent.filter(attempt => attempt.status === 'open' && attempt.expiresAt > now).length >= 8)
            return cloudError('CLOUD_UPLOAD_LIMIT');
        const attemptId = await ctx.db.insert('cloudEditorUploadAttempts', {
            ...args, userId: user._id, status: 'open', storageIds: [], bytes: 0,
            createdAt: now, expiresAt: now + DAY,
        });
        await ctx.scheduler.runAfter(DAY, collectRef, { attemptId });
        return attemptId;
    },
});

export const _attach = internalMutation({
    args: { ...cloudScope, attemptId: v.id('cloudEditorUploadAttempts'), storageId: v.id('_storage') },
    handler: async (ctx, args) => {
        const user = await writableScope(ctx, args);
        const attempt = ownedAttempt(await ctx.db.get(args.attemptId), args, user._id);
        openAttempt(attempt);
        if (attempt.storageIds.includes(args.storageId)) return null;
        const blob = await ctx.db.system.get(args.storageId);
        if (!blob || blob.size > MAX_CLOUD_ASSET_BYTES || attempt.bytes + blob.size > MAX_CLOUD_CHANGE_BYTES || attempt.storageIds.length >= MAX_CLOUD_FILES)
            return cloudError('CLOUD_UPLOAD_LIMIT');
        await ctx.db.patch(attempt._id, { storageIds: [...attempt.storageIds, args.storageId], bytes: attempt.bytes + blob.size });
        return null;
    },
});

/**
 * Call only after _commit has returned any existing idempotency receipt.
 * This helper and source writes must share one mutation transaction.
 */
export async function commitCloudEditorUploads(ctx: MutationCtx, args: Scope & {
    userId: Id<'users'>; operationId: string; fingerprint: string;
    attemptId?: Id<'cloudEditorUploadAttempts'>; storageIds: Id<'_storage'>[];
}): Promise<null> {
    if (!args.attemptId) {
        if (args.storageIds.length) return cloudError('CLOUD_INVALID_UPLOAD');
        return null;
    }
    const user = await writableScope(ctx, args);
    if (user._id !== args.userId) return cloudError('CLOUD_INVALID_UPLOAD');
    const attempt = ownedAttempt(await ctx.db.get(args.attemptId), args, user._id);
    openAttempt(attempt);
    const received = new Set(args.storageIds);
    if (attempt.operationId !== args.operationId || attempt.fingerprint !== args.fingerprint ||
        received.size !== args.storageIds.length || received.size !== attempt.storageIds.length ||
        attempt.storageIds.some(id => !received.has(id))) return cloudError('CLOUD_INVALID_UPLOAD');
    await ctx.db.patch(attempt._id, { status: 'committed' });
    return null;
}

/**
 * Never sweeps all storage. Only this attempt's registered IDs are considered.
 * Closing, reference checks and deletion share the mutation transaction, so a
 * failure leaves the attempt available to retry without falsely claiming cleanup.
 */
export const _collect = internalMutation({
    args: { attemptId: v.id('cloudEditorUploadAttempts') },
    handler: async (ctx, { attemptId }) => {
        const attempt = await ctx.db.get(attemptId);
        if (!attempt || attempt.expiresAt > Date.now()) return null;
        await ctx.db.patch(attemptId, { status: 'closed' });
        const retained: Id<'_storage'>[] = [];
        for (const storageId of attempt.storageIds) {
            const reference = await ctx.db.query('cloudEditorFiles')
                .withIndex('by_storageId', q => q.eq('storageId', storageId)).first();
            const releaseReference = await ctx.db.query('cloudReleaseAssets')
                .withIndex('by_storageId', q => q.eq('storageId', storageId)).first();
            if (reference || releaseReference) retained.push(storageId);
            else if (await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
        }
        if (retained.length) {
            // Keep ownership while files still reference a blob, then collect it
            // after a later source edit removes the last reference.
            await ctx.db.patch(attemptId, { storageIds: retained, expiresAt: Date.now() + DAY });
            await ctx.scheduler.runAfter(DAY, collectRef, { attemptId });
        } else await ctx.db.delete(attemptId);
        return null;
    },
});

/** Cron fallback for collection transactions that failed after their scheduled run. */
export const sweep = internalMutation({
    args: {},
    handler: async (ctx) => {
        const due = await ctx.db.query('cloudEditorUploadAttempts')
            .withIndex('by_expiresAt', q => q.lte('expiresAt', Date.now())).take(50);
        for (const attempt of due) await ctx.scheduler.runAfter(0, collectRef, { attemptId: attempt._id });
        return null;
    },
});

/** Only the action that just stored this blob calls this after attachment failed. */
export const _recordAbortedUpload = internalMutation({
    args: { ...cloudScope, attemptId: v.id('cloudEditorUploadAttempts'), storageId: v.id('_storage') },
    handler: async (ctx, args) => {
        const attempt = await ctx.db.get(args.attemptId);
        if (!attempt || attempt.projectId !== args.projectId || attempt.branchId !== args.branchId || attempt.status === 'committed') return null;
        const blob = await ctx.db.system.get(args.storageId);
        if (!blob || blob.size > MAX_CLOUD_ASSET_BYTES || blob._creationTime < attempt.createdAt) return null;
        // Close admission before registering cleanup. A late attach/commit can
        // no longer use this attempt, including after permission was revoked.
        const storageIds = [...new Set([...attempt.storageIds, args.storageId])];
        await ctx.db.patch(attempt._id, { status: 'closed', storageIds, expiresAt: Date.now() + DAY });
        await ctx.scheduler.runAfter(DAY, collectRef, { attemptId: attempt._id });
        return null;
    },
});
