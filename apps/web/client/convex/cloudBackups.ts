import { hasImportedHostingFields } from './lib/cloudImportedHostingBackend';
import { removalAccess, removalAccessDenied, versionMetadata, activeRemovalProgress, type CloudRetainedVersionPage } from './lib/cloudReleaseRemoval';
import { assertReleaseAvailable, releaseIsRemoving } from './lib/cloudImportedRelease';
import { restoredImportedMedia } from './lib/cloudImportedMedia';
import { assertSnapshotActor, assertSnapshotBudget, snapshotDocumentBytes, assertSnapshotEnvelope, isImportedRelease, importedSnapshotsEnabled, requireImportedSnapshotsEnabled, retainedImportedAccess, originalImportFiles, validateImportedSeal, verifySnapshotStorage, IMPORTED_SNAPSHOT_LIMITS } from './lib/cloudImportedRelease';
import { insertCloudProjectGraph } from './lib/cloudProjectGraph';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalQuery, mutation, query } from './_generated/server';
import { restoreCloudStudioBackup } from './cloudEditorCms';
import { importedStages, releaseAccess, releaseFiles } from './cloudReleases';
import { requireCap } from './lib/permissions';
import { assertOperationId, CLOUD_EDITOR_TAG, cloudError } from './lib/cloudEditor';
import type { CloudStudioFreezeInput } from './lib/cloudStudioContent';

async function backupAccess(ctx: MutationCtx | QueryCtx, backupId: Id<'cloudReleases'>, retained?: Doc<'cloudReleases'>) {
    const backup = retained ?? await ctx.db.get(backupId);
    if (backup) assertReleaseAvailable(backup);
    if (!backup || backup.purpose !== 'backup' || backup.status !== 'frozen' || !backup.hash || !backup.sourceHash) return cloudError('CLOUD_BACKUP_NOT_READY');
    if (isImportedRelease(backup)) { const access = await retainedImportedAccess(ctx, backup); return { backup, user: access.user }; }
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
        const page: Array<{ id: Id<'cloudReleases'>; projectName: string | null; revision: number; createdAt: number; canRestore?: boolean; canDownload?: boolean }> = [];
        for (const candidate of result.page) {
            if (releaseIsRemoving(candidate) || candidate.purpose !== 'backup' || candidate.status !== 'frozen' || !candidate.hash || !candidate.sourceHash) continue;
            try {
                const { backup } = await backupAccess(ctx, candidate._id);
                const project = await ctx.db.get(backup.projectId);
                page.push({ id: backup._id, projectName: backup.projectName ?? project?.name ?? null, revision: backup.revision, createdAt: backup.createdAt, ...(isImportedRelease(backup) ? { canRestore: importedSnapshotsEnabled(), canDownload: false } : {}) });
            } catch (error) {
                const code = error instanceof Error ? error.message : '';
                if (!code.includes('FORBIDDEN:') && !code.includes('CLOUD_RELEASE_NOT_ALLOWED') && !code.includes('CLOUD_NOT_ENROLLED') && !code.includes('CLOUD_IMPORTED_BACKUPS_DISABLED')) throw error;
            }
        }
        return { ...result, page, actorId: user._id };
    },
});

/** Metadata-only cleanup discovery, including paused and source-deleted versions. */
export const retainedVersions = query({
    args: { workspaceId: v.id('workspaces'), expectedActorId: v.id('users'), cursor: v.union(v.string(), v.null()) },
    handler: async (ctx, args): Promise<CloudRetainedVersionPage> => {
        await assertSnapshotBudget(ctx, { readBytes: 2_000_000, readDocs: 32, readCalls: 32 });
        const { user } = await requireCap(ctx, 'workspace.view', { workspaceId: args.workspaceId });
        assertSnapshotActor(user._id, args.expectedActorId);
        await assertSnapshotBudget(ctx, { readBytes: 6_000_000, readDocs: 10, readCalls: 1 });
        const result = await ctx.db.query('cloudReleases').withIndex('by_workspaceId_and_removedAt', q =>
            q.eq('workspaceId', args.workspaceId).eq('removedAt', undefined)).order('desc').paginate({
            cursor: args.cursor, numItems: 5, maximumRowsRead: 10, maximumBytesRead: 6_000_000,
        });
        if (result.pageStatus === 'SplitRequired' || result.page.length > 5) return cloudError('CLOUD_RELEASE_REMOVAL_BUDGET');
        await assertSnapshotBudget(ctx);
        const page: CloudRetainedVersionPage['page'] = [];
        // No dependency scan here. The selected-row inspection owns eligibility.
        // A budget refusal aborts the whole page, never advances past an unexamined row.
        for (const row of result.page) {
            try {
                await removalAccess(ctx, row, args.expectedActorId);
                let canRestore = false, canDownload = false;
                if (!releaseIsRemoving(row) && !hasImportedHostingFields(row) && row.purpose === 'backup' &&
                    row.status === 'frozen' && row.hash && row.sourceHash) {
                    try {
                        await assertSnapshotBudget(ctx, { readBytes: 2_000_000, readDocs: 32, readCalls: 32 });
                        await backupAccess(ctx, row._id, row);
                        canRestore = !isImportedRelease(row) || importedSnapshotsEnabled();
                        canDownload = !isImportedRelease(row);
                    } catch (error) {
                        if (!removalAccessDenied(error) && !String(error).includes('CLOUD_NOT_ENROLLED') && !String(error).includes('CLOUD_DISABLED')) throw error;
                    }
                }
                page.push({ ...versionMetadata(row), canManageVersions: true, canRestore, canDownload, removal: activeRemovalProgress(row) });
            } catch (error) { if (!removalAccessDenied(error)) throw error; }
            await assertSnapshotBudget(ctx);
        }
        return { actorId: user._id, workspaceId: args.workspaceId, page, isDone: result.isDone, continueCursor: result.continueCursor };
    },
});

export const manifest = query({
    args: { backupId: v.id('cloudReleases') },
    handler: async (ctx, { backupId }) => {
        const { backup } = await backupAccess(ctx, backupId);
        if (isImportedRelease(backup)) {
            const stages = await importedStages(ctx, backup);
            const publicFiles = (files: typeof stages.source) => files.map(({ path, kind, text, hash, bytes }) => ({ path, kind, text: text ?? null, hash, bytes }));
            const result = { version: 2 as const, backupId, hash: backup.hash!, sourceHash: backup.sourceHash!, profile: 'imported-next-v1' as const, metadata: stages.metadata, files: publicFiles(stages.source), originalFiles: publicFiles(stages.original), studioInputJson: 'null' };
            assertSnapshotEnvelope(result); return result;
        }
        return { version: 1 as const, backupId, hash: backup.hash!, sourceHash: backup.sourceHash!, studioInputJson: backup.studioInputJson,
            files: (await releaseFiles(ctx, backupId, 'source')).map(({ path, kind, text, hash, bytes }) => ({ path, kind, text: text ?? null, hash, bytes })) };
    },
});

export const _asset = internalQuery({
    args: { backupId: v.id('cloudReleases'), path: v.string() },
    handler: async (ctx, args) => {
        const { backup } = await backupAccess(ctx, args.backupId);
        if (isImportedRelease(backup)) cloudError('CLOUD_IMPORTED_BACKUP_DOWNLOAD_UNAVAILABLE');
        const file = (await releaseFiles(ctx, args.backupId, 'source')).find(file => file.path === args.path);
        if (!file || file.kind !== 'file') return cloudError('CLOUD_BACKUP_FILE_MISSING');
        return { path: file.path, kind: file.kind, text: file.text, storageId: file.storageId, hash: file.hash, bytes: file.bytes };
    },
});

/** Restoring never changes the live site or copies membership, tokens or runtime state. */
export const restoreCopy = mutation({
    args: { backupId: v.id('cloudReleases'), operationKey: v.string(), name: v.string(), expectedActorId: v.optional(v.id('users')) },
    handler: async (ctx, args) => {
        const retained = await ctx.db.get(args.backupId);
        if (retained && releaseIsRemoving(retained)) {
            if (retained.purpose !== 'backup') return cloudError('CLOUD_RELEASE_REMOVED');
            // Compacted tombstones have no imported metadata. Only an exact prior
            // restore receipt and current scope access can return an existing copy.
            const access = await removalAccess(ctx, retained);
            assertSnapshotActor(access.user._id, args.expectedActorId);
            assertOperationId(args.operationKey);
            await assertSnapshotBudget(ctx, { readBytes: 3_145_728, readDocs: 3, readCalls: 3 });
            const prior = await ctx.db.query('cloudBackupRestores').withIndex('by_backupId_and_actorId_and_operationKey', q =>
                q.eq('backupId', retained._id).eq('actorId', access.user._id).eq('operationKey', args.operationKey)).unique();
            if (!prior) return cloudError('CLOUD_RELEASE_REMOVED');
            const project = await ctx.db.get(prior.projectId), branch = await ctx.db.get(prior.branchId);
            if (!project || !branch || project.workspaceId !== retained.workspaceId || branch.projectId !== project._id)
                return cloudError('CLOUD_BACKUP_RESTORE_REMOVED');
            await assertSnapshotBudget(ctx);
            return { projectId: prior.projectId, branchId: prior.branchId };
        }
        const { backup, user } = await backupAccess(ctx, args.backupId);
        await requireCap(ctx, 'project.create', { workspaceId: backup.workspaceId });
        if (isImportedRelease(backup)) { requireImportedSnapshotsEnabled(); assertSnapshotActor(user._id, args.expectedActorId); }
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
        if (isImportedRelease(backup)) return restoreImportedCopy(ctx, backup, user._id, args.operationKey, name);
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

async function restoreImportedCopy(ctx: MutationCtx, backup: Awaited<ReturnType<typeof backupAccess>>['backup'], actorId: Id<'users'>, operationKey: string, name: string) {
    const stages = await importedStages(ctx, backup);
    await validateImportedSeal(backup, stages, { sourceHash: backup.sourceHash!, hash: backup.hash!, artifactJson: backup.artifactJson ?? '', files: [] });
    await verifySnapshotStorage(ctx, stages.source);
    const now = Date.now(), placeholder = 'x'.repeat(128);
    const originalFiles = originalImportFiles(stages.original);
    const descriptor = { actorId, workspaceId: backup.workspaceId, operationKey: crypto.randomUUID(), name,
        files: originalFiles, bytes: stages.original.reduce((sum, file) => sum + file.bytes, 0),
        manifestHash: stages.metadata.originalManifestHash, createdAt: now, expiresAt: now,
        state: 'finalized' as const };
    const prep = { ...stages.metadata.preparation, actorId, workspaceId: backup.workspaceId, operationKey: crypto.randomUUID(),
        baselineManifestHash: stages.metadata.originalManifestHash, generation: 1 as const, profileVersion: 1 as const,
        preparationVersion: 1 as const, createdAt: now };
    const media = await restoredImportedMedia(stages.source, backup._id, stages.metadata.capturedRevision);
    const source = stages.source.map(({ media: _media, ...file }) => file);
    let writeBytes = 64_000; // Graph, state patch and restore receipt, independent of the source payload.
    writeBytes += snapshotDocumentBytes({ ...descriptor, projectId: placeholder, branchId: placeholder });
    writeBytes += snapshotDocumentBytes({ ...prep, projectId: placeholder, branchId: placeholder, baselineAttemptId: placeholder }, IMPORTED_SNAPSHOT_LIMITS.metadata);
    for (const row of media) writeBytes += snapshotDocumentBytes({ ...row, projectId: placeholder, branchId: placeholder });
    for (const file of source) writeBytes += snapshotDocumentBytes({ ...file, projectId: placeholder, branchId: placeholder });
    const binaryReceipts = stages.original.flatMap((file, index) => file.storageId ? [{ index, path: file.path, hash: file.hash,
        bytes: file.bytes, storageId: file.storageId, state: 'received' as const, valid: true }] : []);
    for (const file of binaryReceipts) writeBytes += snapshotDocumentBytes({ ...file, attemptId: placeholder });
    await assertSnapshotBudget(ctx, { writeBytes, writeDocs: source.length + binaryReceipts.length + media.length + 13 });
    const graph = await insertCloudProjectGraph(ctx, { workspaceId: backup.workspaceId, userId: actorId, name,
        creationId: `restore-${backup._id}-${operationKey}`, files: source, profile: 'imported-source-v1', includeStateId: true });
    const scope = { projectId: graph.projectId, branchId: graph.branchId };
    for (const row of media) await ctx.db.insert('cloudEditorImportedMedia', { ...scope, ...row });
    const baselineAttemptId = await ctx.db.insert('cloudEditorImports', { ...descriptor, ...scope });
    for (const file of binaryReceipts) await ctx.db.insert('cloudEditorImportFiles', { ...file, attemptId: baselineAttemptId });
    const preparationId = await ctx.db.insert('cloudEditorImportPreparations', { ...prep, ...scope, baselineAttemptId });
    await ctx.db.patch(graph.stateId, { profile: 'imported-next-v1', preparationId,
        revision: stages.metadata.capturedRevision, designRevision: stages.metadata.capturedRevision });
    await ctx.db.insert('cloudBackupRestores', { backupId: backup._id, actorId, operationKey, ...scope });
    await assertSnapshotBudget(ctx);
    return scope;
}
