import { getDocumentSize } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { assertOperationId, cloudError } from './cloudEditor';
import { requireCap } from './permissions';
import { assertSnapshotActor, assertSnapshotBudget, importedMetadata, isImportedRelease, releaseIsRemoving } from './cloudImportedRelease';
import { hasImportedHostingFields, readImportedHostingIdentity } from './cloudImportedHostingBackend';

type Context = QueryCtx | MutationCtx;
type Release = Doc<'cloudReleases'>;
export type CloudVersionStatus = Release['status'];
export type CloudVersionKind = 'version' | 'backup' | 'private-artifact' | 'protected-version';
export type CloudRemovalPhase = 'files' | 'reviews' | 'tickets' | 'assets';
export type CloudRemovalReason = 'live-version' | 'release-operation-pending' | 'required-by-version' | 'building' | 'version-changed' | 'version-unavailable';
export type CloudVersionMetadata = {
    id: Id<'cloudReleases'>; projectId: Id<'projects'>; branchId: Id<'branches'>; workspaceId: Id<'workspaces'>;
    projectName: string | null; revision: number; createdAt: number; kind: CloudVersionKind;
    status: CloudVersionStatus; profile: 'starter-v1' | 'imported-next-v1';
};
export type CloudRemovalConfirmation = {
    releaseId: Id<'cloudReleases'>; expectedHash: string | null; expectedStatus: CloudVersionStatus; expectedRevision: number;
};
export type CloudRemovalReceipt = {
    version: 1; releaseId: Id<'cloudReleases'>; initiatorActorId: Id<'users'>; operationKey: string;
    confirmation: CloudRemovalConfirmation; requestedAt: number;
};
export type CloudRemovalProgress = CloudRemovalReceipt & (
    { phase: CloudRemovalPhase; completedAt: null } | { phase: 'done'; completedAt: number }
);
export type CloudRemovalInspection = { actorId: Id<'users'>; result:
    { state: 'available'; version: CloudVersionMetadata; confirmation: CloudRemovalConfirmation } |
    { state: 'blocked'; version: CloudVersionMetadata; reason: CloudRemovalReason; dependentVersion: Pick<CloudVersionMetadata, 'id' | 'revision' | 'createdAt' | 'kind'> | null } |
    { state: 'removing'; version: CloudVersionMetadata; progress: CloudRemovalProgress & { phase: CloudRemovalPhase } } |
    { state: 'removed'; progress: CloudRemovalProgress & { phase: 'done' } }
};
export type CloudRemovalResult = { actorId: Id<'users'>; progress: CloudRemovalProgress };
export type CloudRetainedVersion = CloudVersionMetadata & {
    canManageVersions: boolean; canRestore: boolean; canDownload: boolean;
    removal: (CloudRemovalProgress & { phase: CloudRemovalPhase }) | null;
};
export type CloudRetainedVersionPage = {
    actorId: Id<'users'>; workspaceId: Id<'workspaces'>; page: CloudRetainedVersion[]; isDone: boolean; continueCursor: string;
};
export type CloudRemovalBeginArgs = CloudRemovalConfirmation & { expectedActorId: Id<'users'>; operationKey: string };
export type CloudRemovalContinueArgs = {
    releaseId: Id<'cloudReleases'>; operationKey: string; initiatorActorId: Id<'users'>; expectedExecutorActorId: Id<'users'>;
};
const NATIVE_DOCUMENT_BYTES = 1_048_576;
const PHASES = ['files', 'reviews', 'tickets', 'assets'] as const;
const STAGES = ['source', 'original', 'deploy', 'baseline'] as const;
const UNRESOLVED = ['queued', 'sending', 'observing', 'unknown'] as const;

async function readOne<T>(ctx: Context, read: () => Promise<T>): Promise<T> {
    await assertSnapshotBudget(ctx, { readBytes: NATIVE_DOCUMENT_BYTES, readDocs: 1, readCalls: 1 });
    const value = await read(); await assertSnapshotBudget(ctx); return value;
}
export async function removalRelease(ctx: Context, releaseId: Id<'cloudReleases'>): Promise<Release> {
    const row = await readOne(ctx, () => ctx.db.get(releaseId));
    if (!row) return cloudError('CLOUD_RELEASE_NOT_FOUND');
    return row;
}
export function removalAccessDenied(error: unknown): boolean {
    const message = String(error);
    return message.includes('FORBIDDEN:') || message.includes('CLOUD_RELEASE_NOT_ALLOWED');
}
/** Scope-only authorization also works after payload compaction. No feature flag or historic membership. */
export async function removalAccess(ctx: Context, row: Pick<Release, 'projectId' | 'branchId' | 'workspaceId'>, expectedActorId?: Id<'users'>) {
    const project = await readOne(ctx, () => ctx.db.get(row.projectId));
    const state = await readOne(ctx, () => ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', row.branchId)).unique());
    if ((project && project.workspaceId !== row.workspaceId) || (state && (state.projectId !== row.projectId || state.workspaceId !== row.workspaceId)))
        cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    await assertSnapshotBudget(ctx, { readBytes: 2_000_000, readDocs: 32, readCalls: 32 });
    if (!project || !state) {
        const access = await requireCap(ctx, 'workspace.update', { workspaceId: row.workspaceId });
        if (expectedActorId) assertSnapshotActor(access.user._id, expectedActorId);
        await assertSnapshotBudget(ctx); return access;
    }
    const access = await requireCap(ctx, 'project.update', { projectId: row.projectId });
    if (expectedActorId) assertSnapshotActor(access.user._id, expectedActorId);
    await assertSnapshotBudget(ctx, { readBytes: 2_000_000, readDocs: 32, readCalls: 32 });
    await requireCap(ctx, 'project.view', { projectId: row.projectId });
    const branch = await readOne(ctx, () => ctx.db.get(row.branchId));
    if (branch && branch.projectId !== row.projectId) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    const grant = await readOne(ctx, () => ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', row.projectId).eq('userId', access.user._id)).unique());
    const role = grant?.role ?? (state.createdByUserId === access.user._id ? 'responsible' : null);
    if (role !== 'responsible' && role !== 'designer') cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    await assertSnapshotBudget(ctx); return access;
}
export function versionMetadata(row: Release): CloudVersionMetadata {
    const hosting = !!row.importedHosting && !!row.importedHostingRequest && !!row.importedHostingBuildPolicyJson;
    return { id: row._id, projectId: row.projectId, branchId: row.branchId, workspaceId: row.workspaceId,
        projectName: row.projectName ?? null, revision: row.revision, createdAt: row.createdAt, status: row.status,
        kind: row.purpose === 'backup' ? 'backup' : row.purpose === 'private-artifact' ? 'private-artifact' : hosting ? 'protected-version' : 'version',
        profile: isImportedRelease(row) || hasImportedHostingFields(row) ? 'imported-next-v1' : 'starter-v1' };
}
export function removalProgress(row: Release): CloudRemovalProgress {
    const receipt = row.removal;
    if (!receipt || receipt.version !== 1 || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1 ||
        !Number.isFinite(receipt.requestedAt) || receipt.revision !== row.revision || receipt.expectedStatus !== row.status || receipt.expectedHash !== (row.hash ?? null))
        return cloudError('CLOUD_RELEASE_REMOVAL_CHANGED');
    const base: CloudRemovalReceipt = { version: 1, releaseId: row._id, initiatorActorId: receipt.actorId, operationKey: receipt.operationKey,
        confirmation: { releaseId: row._id, expectedHash: receipt.expectedHash, expectedStatus: receipt.expectedStatus, expectedRevision: receipt.revision }, requestedAt: receipt.requestedAt };
    if (receipt.phase === 'done') {
        if (receipt.completedAt === undefined || !Number.isFinite(receipt.completedAt) || row.removedAt !== receipt.completedAt) return cloudError('CLOUD_RELEASE_REMOVAL_CHANGED');
        return { ...base, phase: 'done', completedAt: receipt.completedAt };
    }
    if (row.removedAt !== undefined || receipt.completedAt !== undefined) return cloudError('CLOUD_RELEASE_REMOVAL_CHANGED');
    return { ...base, phase: receipt.phase, completedAt: null };
}
export function activeRemovalProgress(row: Release): (CloudRemovalProgress & { phase: CloudRemovalPhase }) | null {
    if (!releaseIsRemoving(row)) return null;
    const progress = removalProgress(row);
    return progress.phase === 'done' ? null : progress;
}
async function rowSupported(row: Release): Promise<boolean> {
    if (!Number.isSafeInteger(row.revision) || row.revision < 1) return false;
    try {
        if (hasImportedHostingFields(row)) await readImportedHostingIdentity(row);
        else if (isImportedRelease(row)) importedMetadata(row);
        else if (row.purpose === 'private-artifact') return false;
        return true;
    } catch { return false; }
}
type Block = { reason: CloudRemovalReason; dependentVersion: Pick<CloudVersionMetadata, 'id' | 'revision' | 'createdAt' | 'kind'> | null };
/** Exact existence reads, not the latest twenty operation projection. Historical baseline IDs are not dependencies. */
export async function removalBlock(ctx: Context, row: Release): Promise<Block | null> {
    if (!await rowSupported(row)) return { reason: 'version-unavailable', dependentVersion: null };
    if (row.status === 'building') return { reason: 'building', dependentVersion: null };
    if (await readOne(ctx, () => ctx.db.query('cloudReleaseDestinations').withIndex('by_liveReleaseId', q => q.eq('liveReleaseId', row._id)).first()))
        return { reason: 'live-version', dependentVersion: null };
    const destination = await readOne(ctx, () => ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', row.branchId)).unique());
    if (destination?.lockOperationId) return { reason: 'release-operation-pending', dependentVersion: null };
    for (const stage of UNRESOLVED) {
        const branch = await readOne(ctx, () => ctx.db.query('cloudReleaseOperations').withIndex('by_branchId_and_stage', q => q.eq('branchId', row.branchId).eq('stage', stage)).first());
        const target = branch ?? await readOne(ctx, () => ctx.db.query('cloudReleaseOperations').withIndex('by_releaseId_and_stage', q => q.eq('releaseId', row._id).eq('stage', stage)).first());
        const baseline = target ?? await readOne(ctx, () => ctx.db.query('cloudReleaseOperations').withIndex('by_expectedLiveReleaseId_and_stage', q => q.eq('expectedLiveReleaseId', row._id).eq('stage', stage)).first());
        if (baseline) return { reason: 'release-operation-pending', dependentVersion: null };
    }
    const child = await readOne(ctx, () => ctx.db.query('cloudReleases').withIndex('by_hostingArtifactId_and_removedAt', q => q.eq('importedHosting.artifactId', row._id).eq('removedAt', undefined)).first()) ??
        await readOne(ctx, () => ctx.db.query('cloudReleases').withIndex('by_hostingRequestArtifactId_and_removedAt', q => q.eq('importedHostingRequest.artifactId', row._id).eq('removedAt', undefined)).first());
    if (child) {
        let dependentVersion: Block['dependentVersion'] = null;
        try { await removalAccess(ctx, child); const metadata = versionMetadata(child); dependentVersion = { id: metadata.id, revision: metadata.revision, createdAt: metadata.createdAt, kind: metadata.kind }; }
        catch (error) { if (!removalAccessDenied(error)) throw error; }
        return { reason: 'required-by-version', dependentVersion };
    }
    await assertSnapshotBudget(ctx); return null;
}
export async function inspectRemoval(ctx: QueryCtx, args: { releaseId: Id<'cloudReleases'>; expectedActorId: Id<'users'> }): Promise<CloudRemovalInspection> {
    const row = await removalRelease(ctx, args.releaseId), access = await removalAccess(ctx, row, args.expectedActorId);
    if (releaseIsRemoving(row)) {
        const progress = removalProgress(row);
        return { actorId: access.user._id, result: progress.phase === 'done' ? { state: 'removed', progress } : { state: 'removing', version: versionMetadata(row), progress } };
    }
    const block = await removalBlock(ctx, row);
    return { actorId: access.user._id, result: block ? { state: 'blocked', version: versionMetadata(row), ...block } :
        { state: 'available', version: versionMetadata(row), confirmation: { releaseId: row._id, expectedHash: row.hash ?? null, expectedStatus: row.status, expectedRevision: row.revision } } };
}
function confirmationMatches(row: Release, args: CloudRemovalConfirmation): boolean {
    return row._id === args.releaseId && (row.hash ?? null) === args.expectedHash && row.status === args.expectedStatus && row.revision === args.expectedRevision;
}
export async function beginRemoval(ctx: MutationCtx, args: CloudRemovalBeginArgs): Promise<CloudRemovalResult> {
    const row = await removalRelease(ctx, args.releaseId), access = await removalAccess(ctx, row, args.expectedActorId);
    assertOperationId(args.operationKey);
    if (!confirmationMatches(row, args)) return cloudError('CLOUD_RELEASE_REMOVAL_CHANGED');
    if (releaseIsRemoving(row)) {
        const progress = removalProgress(row);
        if (progress.operationKey !== args.operationKey || progress.initiatorActorId !== access.user._id) return cloudError('CLOUD_RELEASE_REMOVAL_CHANGED');
        return { actorId: access.user._id, progress };
    }
    if (await removalBlock(ctx, row)) return cloudError('CLOUD_RELEASE_REMOVAL_BLOCKED');
    const removal: NonNullable<Release['removal']> = { version: 1, actorId: access.user._id, operationKey: args.operationKey,
        expectedHash: args.expectedHash, expectedStatus: args.expectedStatus, revision: args.expectedRevision, requestedAt: Date.now(), phase: 'files' };
    await assertSnapshotBudget(ctx, { writeBytes: getDocumentSize({ ...row, removal }), writeDocs: 1 });
    await ctx.db.patch(row._id, { removal }); await assertSnapshotBudget(ctx);
    return { actorId: access.user._id, progress: removalProgress({ ...row, removal }) };
}
async function firstChild(ctx: MutationCtx, releaseId: Id<'cloudReleases'>, phase: CloudRemovalPhase) {
    if (phase === 'files') {
        for (const stage of STAGES) {
            const row = await readOne(ctx, () => ctx.db.query('cloudReleaseFiles').withIndex('by_releaseId_and_stage', q => q.eq('releaseId', releaseId).eq('stage', stage)).first());
            if (row) return row;
        }
        return null;
    }
    if (phase === 'reviews') return readOne(ctx, () => ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', releaseId)).first());
    if (phase === 'tickets') return readOne(ctx, () => ctx.db.query('cloudReleaseReviewTickets').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', releaseId)).first());
    return readOne(ctx, () => ctx.db.query('cloudReleaseAssets').withIndex('by_releaseId', q => q.eq('releaseId', releaseId)).first());
}
export async function continueRemoval(ctx: MutationCtx, args: CloudRemovalContinueArgs): Promise<CloudRemovalResult> {
    const row = await removalRelease(ctx, args.releaseId), access = await removalAccess(ctx, row, args.expectedExecutorActorId);
    assertOperationId(args.operationKey);
    const progress = removalProgress(row);
    if (progress.operationKey !== args.operationKey || progress.initiatorActorId !== args.initiatorActorId) return cloudError('CLOUD_RELEASE_REMOVAL_CHANGED');
    if (progress.phase === 'done') return { actorId: access.user._id, progress };
    if (await removalBlock(ctx, row)) return cloudError('CLOUD_RELEASE_REMOVAL_BLOCKED');
    const removal = { ...row.removal! };
    let phase: CloudRemovalPhase | 'done' = progress.phase;
    let deleted = 0;
    for (let count = 0; count < 32; count++) {
        const metrics = await ctx.meta.getTransactionMetrics();
        if (metrics.bytesRead.used + NATIVE_DOCUMENT_BYTES > 3_000_000 || metrics.bytesWritten.used + NATIVE_DOCUMENT_BYTES > 3_000_000) break;
        const child = await firstChild(ctx, row._id, phase);
        if (!child) {
            const index = PHASES.indexOf(phase);
            phase = PHASES[index + 1] ?? 'done';
            break; // One bounded phase per request; no automatic server continuation.
        }
        await assertSnapshotBudget(ctx, { writeBytes: getDocumentSize(child) + NATIVE_DOCUMENT_BYTES, writeDocs: 2 });
        await ctx.db.delete(child._id); deleted++;
    }
    if (phase === 'done') {
        for (const candidate of PHASES) if (await firstChild(ctx, row._id, candidate)) return cloudError('CLOUD_RELEASE_REMOVAL_CHANGED');
        if (await removalBlock(ctx, row)) return cloudError('CLOUD_RELEASE_REMOVAL_BLOCKED');
        const completedAt = Date.now(); removal.phase = 'done'; removal.completedAt = completedAt;
        await assertSnapshotBudget(ctx, { writeBytes: NATIVE_DOCUMENT_BYTES, writeDocs: 1 });
        await ctx.db.patch(row._id, { removal, removedAt: completedAt, studioInputJson: 'null', previousArtifactJson: 'null',
            artifactJson: undefined, imported: undefined, artifactProfile: undefined, importedHosting: undefined,
            importedHostingRequest: undefined, importedHostingBuildPolicyJson: undefined, sourceHash: undefined,
            deploymentId: undefined, deploymentUrl: undefined, builtDestinationKey: undefined, error: undefined });
        await assertSnapshotBudget(ctx);
        return { actorId: access.user._id, progress: removalProgress({ ...row, removal, removedAt: completedAt }) };
    }
    if (!deleted && phase === progress.phase) return cloudError('CLOUD_RELEASE_REMOVAL_BUDGET');
    removal.phase = phase;
    await assertSnapshotBudget(ctx, { writeBytes: getDocumentSize({ ...row, removal }), writeDocs: 1 });
    await ctx.db.patch(row._id, { removal }); await assertSnapshotBudget(ctx);
    return { actorId: access.user._id, progress: removalProgress({ ...row, removal }) };
}
