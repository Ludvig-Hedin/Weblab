import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, query, type MutationCtx } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { journalItem, journalOperation } from './cloudEditorStudioSchema';
import { commitStudioFiles, readCloudStudioFreezeInput, studioAdmission, studioContract,
    studioEnvelope, studioFileChange, studioFiles, type StudioScope } from './cloudEditorStudio';
import { cloudError, cloudScope } from './lib/cloudEditor';
import { assertCloudStudioSource, draftStudioArtifact, serializeStudioArtifact, STUDIO_JSON_PATH,
    updateJournalItem, validateJournalItems, studioStableJson, type CloudStudioFreezeInput } from './lib/cloudStudioContent';

export { readCloudStudioFreezeInput } from './cloudEditorStudio';
function assets(files: Awaited<ReturnType<typeof studioFiles>>) {
    return new Set(files.filter(file => file.kind === 'file' && /^public\/.+\.(?:png|jpe?g|webp|avif|gif)$/i.test(file.path))
        .map(file => file.path.slice('public'.length)));
}
export const list = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const access = await requireCloudAccess(ctx, scope, 'content');
        const studio = await readCloudStudioFreezeInput(ctx, scope);
        return { actorId: access.user._id, revision: access.state.revision, studio,
            assets: studio ? [...assets(await studioFiles(ctx, scope))] : [] };
    },
});
export const _input = internalQuery({
    args: { ...studioEnvelope, operation: journalOperation },
    handler: async (ctx, args) => {
        const admitted = await studioAdmission(ctx, args, false);
        if (admitted.receipt) return { receipt: admitted.receipt, snapshot: null };
        const studio = await readCloudStudioFreezeInput(ctx, args);
        if (!studio) return cloudError('CLOUD_STUDIO_UNAVAILABLE');
        const files = await studioFiles(ctx, args);
        assertCloudStudioSource(studio, files);
        const items = updateJournalItem(studio.items, args.operation, assets(files));
        return { receipt: null, snapshot: { studio: { ...studio, items } } };
    },
});
export const _commit = internalMutation({
    args: { ...studioEnvelope, operation: journalOperation, items: v.array(journalItem), change: studioFileChange },
    handler: async (ctx, args) => {
        const admitted = await studioAdmission(ctx, args, false);
        if (admitted.receipt) return admitted.receipt;
        const studio = await readCloudStudioFreezeInput(ctx, args);
        if (!studio) return cloudError('CLOUD_STUDIO_UNAVAILABLE');
        const files = await studioFiles(ctx, args);
        assertCloudStudioSource(studio, files);
        // Recompute the semantic mutation under the transaction's current rows and asset set.
        const next = updateJournalItem(studio.items, args.operation, assets(files));
        if (studioStableJson(next) !== studioStableJson(args.items) || args.change.path !== STUDIO_JSON_PATH ||
            args.change.content !== serializeStudioArtifact(draftStudioArtifact({ ...studio, items: next }))) cloudError('CLOUD_INVALID_CHANGES');
        const old = await ctx.db.query('cloudEditorJournalItems').withIndex('by_branchId_and_key', q => q.eq('branchId', args.branchId).eq('key', args.operation.key)).unique();
        if (old && old.projectId !== args.projectId) cloudError('CLOUD_NOT_ENROLLED');
        const changed = next.find(item => item.key === args.operation.key)!;
        const receipt = await commitStudioFiles(ctx, args, admitted, [args.change]);
        const row = { ...changed, projectId: args.projectId, branchId: args.branchId, updatedAt: Date.now() };
        if (old) await ctx.db.replace(old._id, row); else await ctx.db.insert('cloudEditorJournalItems', row);
        return receipt;
    },
});
/** New-copy restore only. The caller must restore matching source in this same transaction. */
export async function restoreCloudStudioBackup(ctx: MutationCtx, scope: StudioScope, input: CloudStudioFreezeInput, actorId: Id<'users'>): Promise<void> {
    const branch = await ctx.db.get(scope.branchId), actor = await ctx.db.get(actorId);
    if (!branch || branch.projectId !== scope.projectId || !actor || input.settings.profile !== 'cloud-studio-v1') cloudError('CLOUD_STUDIO_INVALID_BACKUP');
    if (await studioContract(ctx, scope) || (await ctx.db.query('cloudEditorJournalItems').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).take(1)).length) cloudError('CLOUD_STUDIO_ALREADY_INSTALLED');
    validateJournalItems(input.items);
    assertCloudStudioSource(input, await studioFiles(ctx, scope));
    await ctx.db.insert('cloudEditorStudioContracts', { ...scope, ...input.settings, approvedByUserId: actorId, updatedAt: Date.now() });
    for (const item of input.items) await ctx.db.insert('cloudEditorJournalItems', { ...scope, ...item, updatedAt: Date.now() });
}
