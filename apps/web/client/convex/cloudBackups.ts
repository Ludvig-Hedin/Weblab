import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalQuery, mutation, query } from './_generated/server';
import { restoreCloudStudioBackup } from './cloudEditorCms';
import { releaseAccess, releaseFiles } from './cloudReleases';
import { requireCap } from './lib/permissions';
import { assertOperationId, CLOUD_EDITOR_TAG, cloudError } from './lib/cloudEditor';
import type { CloudStudioFreezeInput } from './lib/cloudStudioContent';

async function backupAccess(ctx: MutationCtx | QueryCtx, backupId: Id<'cloudReleases'>) {
    const backup = await ctx.db.get(backupId);
    if (!backup || backup.purpose !== 'backup' || backup.status !== 'frozen' || !backup.hash || !backup.sourceHash) return cloudError('CLOUD_BACKUP_NOT_READY');
    const enrollment = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', backup.branchId)).unique();
    if (enrollment) {
        const access = await releaseAccess(ctx, backup);
        if (!access.canDesign) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        return { backup, user: access.user };
    }
    // Deleted projects do not resurrect old membership. Current workspace management is required.
    const access = await requireCap(ctx, 'workspace.update', { workspaceId: backup.workspaceId });
    return { backup, user: access.user };
}

/** Retained records are discoverable without the deleted project's ID. Access is rechecked per backup. */
export const list = query({
    args: { workspaceId: v.id('workspaces'), paginationOpts: paginationOptsValidator },
    handler: async (ctx, { workspaceId, paginationOpts }) => {
        const { user } = await requireCap(ctx, 'workspace.view', { workspaceId });
        const result = await ctx.db.query('cloudReleases').withIndex('by_workspaceId', q => q.eq('workspaceId', workspaceId))
            .order('desc').paginate({ ...paginationOpts, numItems: Math.min(20, paginationOpts.numItems) });
        const page: Array<{ id: Id<'cloudReleases'>; projectName: string | null; revision: number; createdAt: number }> = [];
        for (const candidate of result.page) {
            if (candidate.purpose !== 'backup' || candidate.status !== 'frozen' || !candidate.hash || !candidate.sourceHash) continue;
            try {
                const { backup } = await backupAccess(ctx, candidate._id);
                const project = await ctx.db.get(backup.projectId);
                page.push({ id: backup._id, projectName: backup.projectName ?? project?.name ?? null, revision: backup.revision, createdAt: backup.createdAt });
            } catch (error) {
                const code = error instanceof Error ? error.message : '';
                if (!code.includes('FORBIDDEN:') && !code.includes('CLOUD_RELEASE_NOT_ALLOWED') && !code.includes('CLOUD_NOT_ENROLLED')) throw error;
            }
        }
        return { ...result, page, actorId: user._id };
    },
});

export const manifest = query({
    args: { backupId: v.id('cloudReleases') },
    handler: async (ctx, { backupId }) => {
        const { backup } = await backupAccess(ctx, backupId);
        return { version: 1 as const, backupId, hash: backup.hash!, sourceHash: backup.sourceHash!, studioInputJson: backup.studioInputJson,
            files: (await releaseFiles(ctx, backupId, 'source')).map(({ path, kind, text, hash, bytes }) => ({ path, kind, text: text ?? null, hash, bytes })) };
    },
});

export const _asset = internalQuery({
    args: { backupId: v.id('cloudReleases'), path: v.string() },
    handler: async (ctx, args) => {
        await backupAccess(ctx, args.backupId);
        const file = (await releaseFiles(ctx, args.backupId, 'source')).find(file => file.path === args.path);
        if (!file || file.kind !== 'file') return cloudError('CLOUD_BACKUP_FILE_MISSING');
        return { path: file.path, kind: file.kind, text: file.text, storageId: file.storageId, hash: file.hash, bytes: file.bytes };
    },
});

/** Restoring never changes the live site or copies membership, tokens or runtime state. */
export const restoreCopy = mutation({
    args: { backupId: v.id('cloudReleases'), operationKey: v.string(), name: v.string() },
    handler: async (ctx, args) => {
        const { backup, user } = await backupAccess(ctx, args.backupId);
        await requireCap(ctx, 'project.create', { workspaceId: backup.workspaceId });
        assertOperationId(args.operationKey);
        const receipt = await ctx.db.query('cloudBackupRestores').withIndex('by_backupId_and_actorId_and_operationKey', q => q.eq('backupId', backup._id).eq('actorId', user._id).eq('operationKey', args.operationKey)).unique();
        if (receipt) {
            const [project, branch] = await Promise.all([ctx.db.get(receipt.projectId), ctx.db.get(receipt.branchId)]);
            if (!project || !branch || project.workspaceId !== backup.workspaceId || branch.projectId !== project._id)
                return cloudError('CLOUD_BACKUP_RESTORE_REMOVED');
            return { projectId: receipt.projectId, branchId: receipt.branchId };
        }
        const name = args.name.trim();
        if (!name || name.length > 80) cloudError('CLOUD_INVALID_NAME');
        const existing = await ctx.db.query('cloudEditorStates').withIndex('by_workspaceId', q => q.eq('workspaceId', backup.workspaceId)).take(3);
        if (existing.length >= 3) cloudError('CLOUD_PROJECT_LIMIT');
        const files = await releaseFiles(ctx, backup._id, 'source');
        for (const file of files) if (file.storageId) {
            const metadata = await ctx.db.system.get(file.storageId);
            if (!metadata || metadata.size !== file.bytes) cloudError('CLOUD_BACKUP_FILE_MISSING');
        }
        const now = Date.now();
        const projectId = await ctx.db.insert('projects', { name, tags: [CLOUD_EDITOR_TAG], storageMode: 'cloud',
            runtimeMetadata: { framework: 'nextjs', cloudEditor: { version: 1 } }, workspaceId: backup.workspaceId,
            createdByUserId: user._id, accessMode: 'restricted', updatedAt: now });
        const branchId = await ctx.db.insert('branches', { projectId, name: 'main', isDefault: true, updatedAt: now,
            sandboxId: '', runtimeType: 'cloud', runtimeMetadata: { cloud: { provider: 'vercel_sandbox', sourceVersion: 1, port: 3000 } } });
        await ctx.db.insert('projectMembers', { projectId, userId: user._id, role: 'manager', updatedAt: now });
        const canvasId = await ctx.db.insert('canvases', { projectId });
        await ctx.db.insert('userCanvases', { userId: user._id, canvasId, scale: 0.56, x: 120, y: 120 });
        const groupId = crypto.randomUUID();
        for (const frame of [{ name: 'Desktop', width: 1440, height: 960, x: 0, order: 0 }, { name: 'Phone', width: 390, height: 844, x: 1500, order: 1 }]) {
            await ctx.db.insert('frames', { canvasId, branchId, url: '', x: frame.x, y: 0, width: frame.width, height: frame.height,
                groupId, breakpointId: frame.name.toLowerCase(), breakpointName: frame.name, breakpointOrder: frame.order });
        }
        await ctx.db.insert('conversations', { projectId, displayName: 'New conversation', updatedAt: now });
        for (const { path, kind, text, storageId, hash, bytes } of files) await ctx.db.insert('cloudEditorFiles', { projectId, branchId, path, kind, text, storageId, hash, bytes });
        await ctx.db.insert('cloudEditorStates', { projectId, branchId, workspaceId: backup.workspaceId, createdByUserId: user._id,
            creationId: `restore-${backup._id}-${args.operationKey}`, version: 1, revision: 1, bytes: files.reduce((sum, file) => sum + file.bytes, 0),
            fileCount: files.length, generation: 0, status: 'stopped', updatedAt: now });
        const studio = JSON.parse(backup.studioInputJson) as CloudStudioFreezeInput | null;
        if (studio) await restoreCloudStudioBackup(ctx, { projectId, branchId }, studio, user._id);
        await ctx.db.insert('cloudBackupRestores', { backupId: backup._id, actorId: user._id, operationKey: args.operationKey, projectId, branchId });
        return { projectId, branchId };
    },
});
