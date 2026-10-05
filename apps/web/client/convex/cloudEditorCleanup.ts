import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './_generated/server';
import { cloudScope, cloudError } from './lib/cloudEditor';

type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type CleanupPage = Scope & { kind: 'files' | 'receipts' | 'grants' | 'contracts' | 'tickets' | 'studio' | 'journal' | 'invitations' | 'removals'; cursor: string | null };
const cleanupRef = makeFunctionReference<'mutation', CleanupPage, null>('cloudEditorCleanup:_drain');

/**
 * Call in the authorized branch-deletion transaction, before deleting the branch.
 * Enrollment removal revokes source/runtime management access and releases the
 * workspace allowance immediately. Actor-bound gateway requests recheck current enrollment; active streams
 * close on their next bounded authorization check. Scheduled deletion keeps large manifests out of cascades.
 * Native branches and mismatched scopes are intentionally no-ops.
 */
export async function deleteCloudEditorBranch(ctx: MutationCtx, scope: Scope): Promise<void> {
    const state = await ctx.db.query('cloudEditorStates')
        .withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (!state || state.projectId !== scope.projectId || state.version !== 1) return;
    const destination = await ctx.db.query('cloudReleaseDestinations')
        .withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (destination && (destination.liveReleaseId || destination.lockOperationId))
        cloudError('CLOUD_RELEASE_DELETE_ACTIVE_DESTINATION');
    await ctx.db.delete(state._id);
    await ctx.scheduler.runAfter(0, cleanupRef, { ...scope, kind: 'files', cursor: null });
    await ctx.scheduler.runAfter(0, cleanupRef, { ...scope, kind: 'receipts', cursor: null });
    await ctx.scheduler.runAfter(0, cleanupRef, { ...scope, kind: 'contracts', cursor: null });
    await ctx.scheduler.runAfter(0, cleanupRef, { ...scope, kind: 'tickets', cursor: null });
    for (const kind of ['studio', 'journal'] as const)
        await ctx.scheduler.runAfter(0, cleanupRef, { ...scope, kind, cursor: null });
    const remaining = await ctx.db.query('cloudEditorStates')
        .withIndex('by_projectId', q => q.eq('projectId', scope.projectId)).first();
    if (!remaining) for (const kind of ['grants', 'invitations', 'removals'] as const)
        await ctx.scheduler.runAfter(0, cleanupRef, { ...scope, kind, cursor: null });
    // Preserve upload attempts: they own storage IDs and their existing GC will
    // collect blobs once these file references disappear. Never delete arbitrary
    // storage IDs from receipts. Preserve runtime slots until their expiry or a
    // runtime worker positively confirms shutdown, including uncertain VM starts.
}

/** Private continuation, scheduled only after removing a matching enrollment. */
export const _drain = internalMutation({
    args: { ...cloudScope, kind: v.union(v.literal('files'), v.literal('receipts'), v.literal('grants'), v.literal('contracts'), v.literal('tickets'), v.literal('studio'), v.literal('journal'), v.literal('invitations'), v.literal('removals')), cursor: v.union(v.string(), v.null()) },
    handler: async (ctx, args): Promise<null> => {
        // Do not let an old continuation touch a branch enrolled again later.
        const state = await ctx.db.query('cloudEditorStates')
            .withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
        if (state) return null;
        if (args.kind === 'grants' || args.kind === 'invitations' || args.kind === 'removals') {
            // Grants belong to the project. A remaining or newly enrolled branch
            // still needs them, including one created after this job was queued.
            const remaining = await ctx.db.query('cloudEditorStates')
                .withIndex('by_projectId', q => q.eq('projectId', args.projectId)).first();
            if (remaining) return null;
            const page = args.kind === 'invitations' ? await ctx.db.query('cloudEditorInvitations')
                .withIndex('by_projectId', q => q.eq('projectId', args.projectId))
                .paginate({ cursor: args.cursor, numItems: 100 })
                : args.kind === 'removals' ? await ctx.db.query('cloudEditorMemberRemovals')
                .withIndex('by_projectId_userId', q => q.eq('projectId', args.projectId))
                .paginate({ cursor: args.cursor, numItems: 100 })
                : await ctx.db.query('cloudEditorGrants')
                .withIndex('by_projectId_userId', q => q.eq('projectId', args.projectId))
                .paginate({ cursor: args.cursor, numItems: 100 });
            for (const row of page.page) if (row.projectId === args.projectId) await ctx.db.delete(row._id);
            if (!page.isDone) await ctx.scheduler.runAfter(0, cleanupRef, { ...args, cursor: page.continueCursor });
            return null;
        }
        // Paginate before matching projectId: mismatched rows must be preserved
        // without causing an unbounded scan or a repeating first-page loop.
        const page = args.kind === 'studio'
            ? await ctx.db.query('cloudEditorStudioContracts').withIndex('by_branchId', q => q.eq('branchId', args.branchId))
                .paginate({ cursor: args.cursor, numItems: 100 })
            : args.kind === 'journal'
            ? await ctx.db.query('cloudEditorJournalItems').withIndex('by_branchId', q => q.eq('branchId', args.branchId))
                .paginate({ cursor: args.cursor, numItems: 100 })
            : args.kind === 'tickets'
            ? await ctx.db.query('cloudPreviewTickets')
                .withIndex('by_branchId_and_userId', q => q.eq('branchId', args.branchId))
                .paginate({ cursor: args.cursor, numItems: 100 })
            : args.kind === 'contracts'
            ? await ctx.db.query('cloudEditorContentContracts')
                .withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId))
                .paginate({ cursor: args.cursor, numItems: 100 })
            : args.kind === 'files'
            ? await ctx.db.query('cloudEditorFiles')
                .withIndex('by_branchId_path', q => q.eq('branchId', args.branchId))
                .paginate({ cursor: args.cursor, numItems: 32 })
            : await ctx.db.query('cloudEditorOperations')
                .withIndex('by_branchId_operationId', q => q.eq('branchId', args.branchId))
                .paginate({ cursor: args.cursor, numItems: 100 });
        for (const row of page.page) {
            if (row.projectId === args.projectId && row.branchId === args.branchId) await ctx.db.delete(row._id);
        }
        if (!page.isDone) await ctx.scheduler.runAfter(0, cleanupRef, { ...args, cursor: page.continueCursor });
        return null;
    },
});
