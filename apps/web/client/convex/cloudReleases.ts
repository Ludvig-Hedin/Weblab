import { sourceProfileCapabilities, assertReleaseCloudProfile } from './lib/cloudImportManifest';
import { makeFunctionReference } from 'convex/server';
import { v, type Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { assertImportedPublicationAccess, assertImportedReleasePublisher, hasCloudPublicationGrant, importedPublicationEnabled, requireCloudAccess, requireImportedReleaseAccess } from './cloudEditorAccess';
import { readCloudStudioFreezeInput } from './cloudEditorCms';
import { releaseFile, frozenReleaseFile, importedHostingPrepareArgs, importedHostingSealArgs, type ImportedReleaseMetadata } from './cloudReleasesSchema';
import { hasImportedHostingFields, readImportedHostingIdentity, readImportedHostingExecution, readImportedHostingInput, sealImportedHosting } from './lib/cloudImportedHostingBackend';
import { assertImportedHostingOperationPins } from './lib/cloudImportedHostingState';
import { getUserByClerkIdSafe } from './lib/permissions';
import { assertReleaseAvailable, releaseIsRemoving, assertSnapshotActor, assertSnapshotBudget, assertSnapshotEnvelope, captureImportedStudioConfig, IMPORTED_PUBLICATION_INTENT, importedArtifactProfile, IMPORTED_SNAPSHOT_LIMITS, importedMetadata, importedSnapshotsEnabled, isImportedRelease, requireImportedSnapshotsEnabled, retainedImportedAccess, snapshotDocumentBytes, validateImportedReleaseSnapshot, validateImportedSeal, validateSnapshotStage, verifySnapshotStorage } from './lib/cloudImportedRelease';
import { assertOperationId, cloudError, cloudScope, MAX_CLOUD_FILES } from './lib/cloudEditor';
import { can } from './lib/auth';
import { releaseReviewConfigured } from './cloudReleaseReviewAccess';
import { activeReleaseCredential } from './cloudReleaseCredentials';
import { canReleaseDestination, destinationKey, MAX_RELEASE_INPUT_BYTES, MAX_RELEASES, releaseRequestMatches } from './lib/cloudReleasePolicy';

import { freezeImportedMedia } from './lib/cloudImportedRelease';
import { activeRemovalProgress, removalProgress, versionMetadata } from './lib/cloudReleaseRemoval';

type Context = QueryCtx | MutationCtx;
type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
const recoveryRequest = v.object({ operationId: v.optional(v.id('cloudReleaseOperations')), operationKey: v.string(),
    releaseId: v.id('cloudReleases'), kind: v.union(v.literal('publish'), v.literal('rollback')), expectedHash: v.string(),
    expectedTargetDeploymentId: v.string(), expectedLiveReleaseId: v.union(v.id('cloudReleases'), v.null()) });
type StatusScope = Scope & { recoveryRequest?: Infer<typeof recoveryRequest> };
function operationStatus(op: Doc<'cloudReleaseOperations'>) {
    return { id: op._id, operationKey: op.operationKey, actorId: op.actorId, expectedLiveReleaseId: op.expectedLiveReleaseId ?? null,
        releaseId: op.releaseId, kind: op.kind, stage: op.stage, error: op.error ?? null,
        sourceHash: op.sourceHash, targetDeploymentId: op.targetDeploymentId ?? null, resultDeploymentId: op.resultDeploymentId ?? null };
}
const workerRef = makeFunctionReference<'action', { operationId: Id<'cloudReleaseOperations'>; nonce: string }, null>('cloudReleaseActions:work');
const finishRef = makeFunctionReference<'mutation', { operationId: Id<'cloudReleaseOperations'> }, null>('cloudReleases:_settle');

function enabled(): boolean { return process.env.WEBLAB_CLOUD_RELEASES_ENABLED === 'true'; }
export async function releaseAccess(ctx: Context, scope: Scope, publish = false) {
    const access = await requireCloudAccess(ctx, scope);
    assertReleaseCloudProfile(access.state.profile);
    if (!access.role || (publish && !access.canPublish)) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    return access;
}
export async function releaseFiles(ctx: Context, releaseId: Id<'cloudReleases'>, stage: 'source' | 'deploy' | 'baseline' | 'original') {
    const files = await ctx.db.query('cloudReleaseFiles').withIndex('by_releaseId_and_stage', q => q.eq('releaseId', releaseId).eq('stage', stage)).take(MAX_CLOUD_FILES + 1);
    if (files.length > MAX_CLOUD_FILES) cloudError('CLOUD_RELEASE_TOO_LARGE');
    return files;
}
export async function requireRelease(ctx: Context, releaseId: Id<'cloudReleases'>, publish = false) {
    const release = await ctx.db.get(releaseId);
    if (!release) return cloudError('CLOUD_RELEASE_NOT_FOUND');
    assertReleaseAvailable(release);
    if (hasImportedHostingFields(release) || isImportedRelease(release)) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    const access = await releaseAccess(ctx, release, publish);
    return { release, access };
}

/** Actor is stored by an authenticated mutation. No browser-supplied identity or saved JWT. */
async function workerAllowed(ctx: Context, op: Pick<Doc<'cloudReleaseOperations'>, 'actorId' | 'projectId' | 'branchId' | 'kind'>, release: Doc<'cloudReleases'>): Promise<boolean> {
    const imported = hasImportedHostingFields(release);
    if (releaseIsRemoving(release)) return false;
    if (!enabled()) return false;
    const [user, project, branch, state] = await Promise.all([
        ctx.db.get(op.actorId), ctx.db.get(op.projectId), ctx.db.get(op.branchId),
        ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', op.branchId)).unique(),
    ]);
    if (!user?.clerkUserId || !project || branch?.projectId !== project._id || state?.projectId !== project._id ||
        (imported ? !importedSnapshotsEnabled() || state.profile !== 'imported-next-v1' || state.version !== 1 : !sourceProfileCapabilities(state.profile).release)) return false;
    if ((await getUserByClerkIdSafe(ctx, user.clerkUserId))?._id !== op.actorId) return false;
    const workspace = await ctx.db.get(project.workspaceId);
    if (!workspace || (imported && state.workspaceId !== workspace._id)) return false;
    const [member, workspaceMember, grant] = await Promise.all([
        ctx.db.query('projectMembers').withIndex('by_project_user', q => q.eq('projectId', project._id).eq('userId', user._id)).unique(),
        ctx.db.query('workspaceMembers').withIndex('by_workspace_user', q => q.eq('workspaceId', workspace._id).eq('userId', user._id)).unique(),
        ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', project._id).eq('userId', user._id)).unique(),
    ]);
    const role = grant?.role ?? (state.createdByUserId === user._id ? 'responsible' : null);
    const resource = { workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId }, workspaceRole: workspaceMember?.role ?? null,
        project: { id: project._id, workspaceId: workspace._id, accessMode: project.accessMode }, projectRole: member?.role ?? null };
    const publicationGrant = hasCloudPublicationGrant(role, grant?.publish, state.createdByUserId === user._id);
    if (imported && release.importedHosting?.visibility === 'publishable' && (!importedPublicationEnabled() || !publicationGrant)) return false;
    return (imported ? (op.kind === 'build' ? (role === 'responsible' || role === 'designer') && can('project.update', resource) :
        release.importedHosting?.visibility === 'publishable' && !!role && publicationGrant) :
        (grant?.publish ?? state.createdByUserId === user._id) && !!role) && can('project.view', resource);
}

/** Check the complete variant before lifecycle writes, including settlement after access changes. */
function operationVariant(release: Doc<'cloudReleases'>, destination: Doc<'cloudReleaseDestinations'>, op: Doc<'cloudReleaseOperations'>): boolean {
    if (releaseIsRemoving(release)) return false;
    if (op.releaseId !== release._id || op.destinationId !== destination._id || op.projectId !== release.projectId || op.branchId !== release.branchId ||
        destination.projectId !== release.projectId || destination.branchId !== release.branchId || op.sourceHash !== release.hash) return false;
    if (!hasImportedHostingFields(release)) return !isImportedRelease(release) && destination.hostingProfile === undefined && op.deployHash === undefined && op.buildPolicyHash === undefined;
    if (!release.importedHosting || !release.importedHostingRequest || !release.importedHostingBuildPolicyJson ||
        isImportedRelease(release) || release.purpose !== 'release' || !['protected-only', 'publishable'].includes(release.importedHosting.visibility) ||
        destination.hostingProfile !== 'imported-next-hosting-v1' || destination.registrationVersion !== 2 ||
        destination.workspaceId !== release.workspaceId || (op.kind !== 'build' && release.importedHosting.visibility !== 'publishable') || !release.hash) return false;
    try {
        assertImportedHostingOperationPins({ sourceHash: op.sourceHash, deployHash: op.deployHash, buildPolicyHash: op.buildPolicyHash }, release.hash, release.importedHosting);
        return true;
    } catch { return false; }
}

/** Each indexed lookup reads at most one native document, then enforces our smaller receipt envelope. */
async function readOperation(ctx: Context, read: () => Promise<Doc<'cloudReleaseOperations'> | null>) {
    await assertSnapshotBudget(ctx, { readBytes: 1_048_576, readDocs: 1, readCalls: 1 });
    const op = await read();
    if (op) snapshotDocumentBytes(op, 16_384);
    await assertSnapshotBudget(ctx);
    return op;
}
async function operationStages(ctx: Context, branchId: Id<'branches'>) {
    const stages: Array<Doc<'cloudReleaseOperations'> | null> = [];
    for (const stage of ['unknown', 'queued', 'sending', 'observing'] as const) {
        stages.push(await readOperation(ctx, () => ctx.db.query('cloudReleaseOperations')
            .withIndex('by_branchId_and_stage', q => q.eq('branchId', branchId).eq('stage', stage)).first()));
    }
    return { unknown: !!stages[0], busy: stages.slice(1).some(Boolean) };
}
async function confirmedPublication(ctx: Context, release: Doc<'cloudReleases'>, destination: Doc<'cloudReleaseDestinations'>): Promise<boolean> {
    if (!release.hash || !release.deploymentId || releaseIsRemoving(release) || release.status !== 'ready' ||
        release.builtDestinationKey !== destination.key) return false;
    for (const kind of ['publish', 'rollback'] as const) {
        const op = await readOperation(ctx, () => ctx.db.query('cloudReleaseOperations').withIndex('by_publication_tuple', q =>
            q.eq('releaseId', release._id).eq('destinationId', destination._id).eq('sourceHash', release.hash!)
                .eq('targetDeploymentId', release.deploymentId!).eq('kind', kind).eq('stage', 'confirmed')).first());
        if (op && op.resultDeploymentId === release.deploymentId && operationVariant(release, destination, op)) return true;
    }
    return false;
}
async function statusLiveRelease(ctx: Context, rows: Doc<'cloudReleases'>[], destination: Doc<'cloudReleaseDestinations'> | null,
    scope: Scope, workspaceId: Id<'workspaces'>, imported: boolean) {
    if (!destination?.liveReleaseId || !destination.liveDeploymentId || destination.projectId !== scope.projectId ||
        destination.branchId !== scope.branchId || destination.workspaceId !== workspaceId) return null;
    let release = rows.find(row => row._id === destination.liveReleaseId) ?? null;
    if (!release) {
        await assertSnapshotBudget(ctx, { readBytes: 1_048_576, readDocs: 1, readCalls: 1 });
        release = await ctx.db.get(destination.liveReleaseId);
        await assertSnapshotBudget(ctx);
    }
    if (!release || release.projectId !== scope.projectId || release.branchId !== scope.branchId || release.workspaceId !== workspaceId ||
        releaseIsRemoving(release) || release.status !== 'ready' || !release.hash || release.deploymentId !== destination.liveDeploymentId ||
        release.builtDestinationKey !== destination.key) return null;
    if (imported) {
        try { await readImportedHostingIdentity(release); } catch { return null; }
        if (release.importedHosting?.visibility !== 'publishable') return null;
    } else if (hasImportedHostingFields(release) || isImportedRelease(release)) return null;
    return release;
}

/** Shared current public-target checks. This helper grants no provider send authority. */
export async function assertImportedPublicTarget(ctx: Context, release: Doc<'cloudReleases'>, destination: Doc<'cloudReleaseDestinations'>,
    input: Pick<Doc<'cloudReleaseOperations'>, 'actorId' | 'kind' | 'expectedLiveReleaseId' | 'expectedDeploymentId' | 'targetDeploymentId'>): Promise<void> {
    assertReleaseAvailable(release);
    if (input.kind === 'build' || release.importedHosting?.visibility !== 'publishable' ||
        destination.hostingProfile !== 'imported-next-hosting-v1' || destination.registrationVersion !== 2 ||
        destination.projectId !== release.projectId || destination.branchId !== release.branchId || destination.workspaceId !== release.workspaceId ||
        !(await workerAllowed(ctx, { ...input, projectId: release.projectId, branchId: release.branchId }, release))) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    if (!destination.reviewGatewayVerified || !destination.publicAliasVerified) cloudError('CLOUD_RELEASE_SETUP_REQUIRED');
    if ((destination.liveReleaseId ?? null) !== (input.expectedLiveReleaseId ?? null) ||
        (destination.liveDeploymentId ?? null) !== (input.expectedDeploymentId ?? null) ||
        (input.kind === 'publish' && (release.baselineReleaseId ?? null) !== (destination.liveReleaseId ?? null))) cloudError('CLOUD_RELEASE_LIVE_CHANGED');
    const review = await ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', input.actorId)).unique();
    if (release.status !== 'ready' || !release.hash || !release.deploymentId || input.targetDeploymentId !== release.deploymentId ||
        release.builtDestinationKey !== destination.key || review?.hash !== release.hash || review?.deploymentId !== release.deploymentId) cloudError('CLOUD_RELEASE_REVIEW_REQUIRED');
    if (input.kind === 'rollback') {
        if (!(await confirmedPublication(ctx, release, destination))) cloudError('CLOUD_RELEASE_ROLLBACK_UNAVAILABLE');
    }
}

/** Factual alias outcome checks deliberately do not consult today's permission or credential generation. */
function importedAliasOutcomeMatches(release: Doc<'cloudReleases'>, destination: Doc<'cloudReleaseDestinations'>,
    op: Doc<'cloudReleaseOperations'>, deploymentId: string | undefined): boolean {
    return !!op.targetDeploymentId && deploymentId === op.targetDeploymentId && release.status === 'ready' &&
        release.deploymentId === op.targetDeploymentId && release.builtDestinationKey === destination.key &&
        (destination.liveReleaseId ?? null) === (op.expectedLiveReleaseId ?? null) &&
        (destination.liveDeploymentId ?? null) === (op.expectedDeploymentId ?? null);
}

async function destinationEnabled(ctx: Context, destination: Doc<'cloudReleaseDestinations'>, kind: 'build' | 'publish' | 'rollback'): Promise<boolean> {
    // A registered protected build enables operator proof; live switches require both proofs.
    return enabled() && releaseReviewConfigured() && !destination.drifted && destination.approvedUntil > Date.now() &&
        (destination.hostingProfile === undefined || kind === 'build' || importedPublicationEnabled()) &&
        (kind === 'build' || (destination.reviewGatewayVerified && destination.publicAliasVerified)) &&
        !!(await activeReleaseCredential(ctx, destination));
}

export const capture = mutation({
    args: { ...cloudScope, expectedRevision: v.number(), operationKey: v.string(), purpose: v.union(v.literal('release'), v.literal('backup'), v.literal('private-artifact')), publicationIntent: v.optional(v.literal('eligible-public-version')), expectedActorId: v.optional(v.id('users')) },
    handler: async (ctx, args) => {
        const access = await requireCloudAccess(ctx, args);
        if (args.expectedActorId) assertSnapshotActor(access.user._id, args.expectedActorId);
        if (access.state.profile === 'imported-next-v1') return captureImported(ctx, args, access);
        if (args.publicationIntent !== undefined) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        assertReleaseCloudProfile(access.state.profile);
        if (!access.role || args.purpose === 'private-artifact' || (args.purpose === 'release' && !access.canPublish)) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        if (args.purpose === 'backup' && !access.canDesign) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        assertOperationId(args.operationKey);
        const previous = await ctx.db.query('cloudReleases').withIndex('by_branchId_and_operationKey', q => q.eq('branchId', args.branchId).eq('operationKey', args.operationKey)).unique();
        if (previous) {
            assertReleaseAvailable(previous);
            if (previous.actorId !== access.user._id || previous.purpose !== args.purpose || previous.revision !== args.expectedRevision) cloudError('CLOUD_INVALID_OPERATION');
            return previous._id;
        }
        if (access.state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
        const existing = await ctx.db.query('cloudReleases').withIndex('by_branchId_and_removedAt', q => q.eq('branchId', args.branchId).eq('removedAt', undefined)).take(MAX_RELEASES);
        if (existing.length >= MAX_RELEASES) cloudError('CLOUD_RELEASE_RETENTION_LIMIT');
        const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
        if (!files.length || files.length > MAX_CLOUD_FILES) cloudError('CLOUD_RELEASE_TOO_LARGE');
        const input = await readCloudStudioFreezeInput(ctx, args);
        const studioInputJson = JSON.stringify(input);
        if (new TextEncoder().encode(studioInputJson).byteLength > MAX_RELEASE_INPUT_BYTES) cloudError('CLOUD_RELEASE_TOO_LARGE');
        const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
        if (destination?.lockOperationId || destination?.drifted) cloudError('CLOUD_RELEASE_BUSY');
        const baseline = destination?.liveReleaseId ? await ctx.db.get(destination.liveReleaseId) : null;
        if (baseline) assertReleaseAvailable(baseline);
        const project = await ctx.db.get(args.projectId);
        const releaseId = await ctx.db.insert('cloudReleases', {
            projectId: args.projectId, branchId: args.branchId, workspaceId: access.workspace._id, actorId: access.user._id,
            projectName: project?.name,
            operationKey: args.operationKey, revision: args.expectedRevision, purpose: args.purpose, status: 'captured',
            studioInputJson, previousArtifactJson: baseline?.artifactJson ?? 'null', baselineReleaseId: baseline?._id, createdAt: Date.now(),
        });
        for (const file of files) {
            const { path, kind, text, storageId, hash, bytes } = file;
            await ctx.db.insert('cloudReleaseFiles', { releaseId, stage: 'source', path, kind, text, storageId, hash, bytes });
            if (storageId) await ctx.db.insert('cloudReleaseAssets', { releaseId, storageId });
        }
        if (baseline && args.purpose === 'release') for (const file of await releaseFiles(ctx, baseline._id, 'deploy')) {
            if (!file.storageId) continue;
            const { path, kind, storageId, hash, bytes } = file;
            await ctx.db.insert('cloudReleaseFiles', { releaseId, stage: 'baseline', path, kind, storageId, hash, bytes });
            await ctx.db.insert('cloudReleaseAssets', { releaseId, storageId });
        }
        return releaseId;
    },
});

export const _input = internalQuery({
    args: { releaseId: v.id('cloudReleases'), expectedActorId: v.optional(v.id('users')) },
    handler: async (ctx, { releaseId, expectedActorId }) => {
        const row = await ctx.db.get(releaseId);
        if (row) assertReleaseAvailable(row);
        if (row && hasImportedHostingFields(row)) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        if (row && isImportedRelease(row)) {
            requireImportedSnapshotsEnabled();
            const access = await importedArtifactAccess(ctx, row);
            assertSnapshotActor(access.user._id, expectedActorId);
            if (access.user._id !== row.actorId) cloudError('CLOUD_ACTOR_CHANGED');
            const stages = await importedStages(ctx, row);
            const result = { release: row, files: stages.source, originalFiles: stages.original, baselineFiles: [] };
            assertSnapshotEnvelope(result);
            await assertSnapshotBudget(ctx);
            return result;
        }
        const { release, access } = await requireRelease(ctx, releaseId);
        if (expectedActorId) assertSnapshotActor(access.user._id, expectedActorId);
        return { release, files: await releaseFiles(ctx, releaseId, 'source'), baselineFiles: await releaseFiles(ctx, releaseId, 'baseline') };
    },
});

export const _seal = internalMutation({
    args: { releaseId: v.id('cloudReleases'), sourceHash: v.string(), hash: v.string(), artifactJson: v.string(), files: v.array(releaseFile), expectedActorId: v.optional(v.id('users')) },
    handler: async (ctx, args) => {
        const row = await ctx.db.get(args.releaseId);
        if (row) assertReleaseAvailable(row);
        if (row && hasImportedHostingFields(row)) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        if (row && isImportedRelease(row)) return sealImported(ctx, row, args);
        const { release, access } = await requireRelease(ctx, args.releaseId);
        if (args.expectedActorId) assertSnapshotActor(access.user._id, args.expectedActorId);
        if (release.status !== 'captured') {
            if (release.hash !== args.hash || release.sourceHash !== args.sourceHash) cloudError('CLOUD_RELEASE_CHANGED');
            return null;
        }
        if (args.files.length > MAX_CLOUD_FILES || new TextEncoder().encode(args.artifactJson).byteLength > MAX_RELEASE_INPUT_BYTES || !/^[a-f0-9]{64}$/.test(args.hash)) cloudError('CLOUD_RELEASE_TOO_LARGE');
        const retained = new Set([...(await releaseFiles(ctx, release._id, 'source')), ...(await releaseFiles(ctx, release._id, 'baseline'))].flatMap(file => file.storageId ? [file.storageId] : []));
        for (const file of args.files) {
            if (file.storageId && !retained.has(file.storageId)) cloudError('CLOUD_RELEASE_ASSET_MISSING');
            await ctx.db.insert('cloudReleaseFiles', { releaseId: release._id, stage: 'deploy', ...file });
        }
        await ctx.db.patch(release._id, { status: 'frozen', sourceHash: args.sourceHash, hash: args.hash, artifactJson: args.artifactJson });
        return null;
    },
});

export const _hostingInput = internalQuery({ args: importedHostingPrepareArgs, handler: readImportedHostingInput });
export const _sealHosting = internalMutation({ args: importedHostingSealArgs, handler: sealImportedHosting });

export const status = query({
    args: { ...cloudScope, recoveryRequest: v.optional(recoveryRequest) },
    handler: async (ctx, scope) => {
        if (scope.recoveryRequest) {
            assertOperationId(scope.recoveryRequest.operationKey);
            if (scope.recoveryRequest.expectedHash.length !== 64 || /[^a-f0-9]/.test(scope.recoveryRequest.expectedHash) ||
                !scope.recoveryRequest.expectedTargetDeploymentId || scope.recoveryRequest.expectedTargetDeploymentId.length > 256) cloudError('CLOUD_INVALID_OPERATION');
        }
        const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
        if (state?.profile === 'imported-next-v1') return importedStatus(ctx, scope, state);
        const access = await releaseAccess(ctx, scope);
        const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
        const releases = await ctx.db.query('cloudReleases').withIndex('by_branchId_and_removedAt', q => q.eq('branchId', scope.branchId).eq('removedAt', undefined)).order('desc').take(MAX_RELEASES);
        await assertSnapshotBudget(ctx, { readBytes: 20 * 16_384, readDocs: 20, readCalls: 1 });
        const operations = await ctx.db.query('cloudReleaseOperations').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).order('desc').take(20);
        for (const op of operations) snapshotDocumentBytes(op, 16_384);
        const stages = await operationStages(ctx, scope.branchId);
        const liveRelease = await statusLiveRelease(ctx, releases, destination, scope, access.workspace._id, false);
        const confirmedLive = !!destination && !!liveRelease && !stages.unknown && !stages.busy && !destination.lockOperationId && await confirmedPublication(ctx, liveRelease, destination);
        return {
            actorId: access.user._id, workspaceId: access.workspace._id,
            revision: access.state.revision, canPublish: access.canPublish, canBackup: access.canDesign,
            canPublishImported: false, publicationEnabled: false, publicationReason: null, canSavePublicationVersion: false, canReviewPublication: false,
            canRestoreBackup: access.canDesign, canBuildPrivateReview: false, privateBuildReason: null, canDownloadBackup: access.canDesign, profile: access.state.profile ?? 'starter-v1', canFreezePrivateArtifact: false,
            enabled: !!destination && await destinationEnabled(ctx, destination, 'publish'),
            buildEnabled: !!destination && await destinationEnabled(ctx, destination, 'build'), remainingBuilds: destination?.remainingBuilds ?? 0,
            liveReleaseId: destination?.liveReleaseId ?? null, liveDeploymentId: destination?.liveDeploymentId ?? null, liveUrl: confirmedLive ? `https://${destination!.hostname}` : null,
            busy: !!destination?.lockOperationId || stages.unknown || stages.busy, drifted: destination?.drifted ?? false,
            releases: await Promise.all(releases.filter(release => !hasImportedHostingFields(release)).map(async release => {
                const review = await ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', access.user._id)).unique();
                return { ...versionMetadata(release), purpose: release.purpose, hash: release.hash ?? null, hostingArtifactId: null, canPreparePrivateReview: false, canFinishPreparing: false, preparationOwnerRequired: false, canBuildPrivateReview: false, canManageVersions: access.canDesign, removal: activeRemovalProgress(release),
                    publicationSource: false, canFinishPublicationPreparing: false, canPreparePublicationReview: false,
                    visibility: null, deploymentId: null, canAcknowledge: false, canPublish: false,
                    canRollback: !!destination && access.canPublish && review?.hash === release.hash && review?.deploymentId === release.deploymentId &&
                        destination.liveReleaseId !== release._id && await confirmedPublication(ctx, release, destination),
                    canDownload: access.canDesign && !releaseIsRemoving(release) && !hasImportedHostingFields(release),
                    reviewed: !!review && review.hash === release.hash && review.deploymentId === release.deploymentId,
                    reviewUrl: !releaseIsRemoving(release) && !hasImportedHostingFields(release) && release.status === 'ready' && destination && await destinationEnabled(ctx, destination, 'build') &&
                        (destination.reviewGatewayVerified || (access.role === 'responsible' && access.canManage)) &&
                        destination.key === release.builtDestinationKey ? `https://${release._id}.${process.env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX}/` : null };
            })),
            operations: operations.map(operationStatus), recoveryOperation: null, recoveryRemoval: null,
        };
    },
});

export const review = mutation({
    args: { releaseId: v.id('cloudReleases'), hash: v.string(), expectedActorId: v.optional(v.id('users')), expectedDeploymentId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const row = await ctx.db.get(args.releaseId);
        if (row) assertReleaseAvailable(row);
        const imported = row !== null && hasImportedHostingFields(row);
        if (imported && row!.importedHosting?.visibility !== 'publishable') cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        const { release, access } = imported ? { release: row!, access: await requireImportedReleaseAccess(ctx, row!) } : await requireRelease(ctx, args.releaseId, true);
        if (imported) {
            assertSnapshotActor(access.user._id, args.expectedActorId);
            requireImportedSnapshotsEnabled();
            assertImportedReleasePublisher(access);
            if (access.workspace._id !== release.workspaceId) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
            if (release.importedHosting?.visibility !== 'publishable' || !args.expectedDeploymentId || args.expectedDeploymentId !== release.deploymentId) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
            await readImportedHostingExecution(ctx, release);
            const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).unique();
            if (!destination || !(await destinationEnabled(ctx, destination, 'build')) || !destination.reviewGatewayVerified ||
                destination.hostingProfile !== 'imported-next-hosting-v1' || destination.registrationVersion !== 2 ||
                destination.workspaceId !== release.workspaceId || release.builtDestinationKey !== destination.key) cloudError('CLOUD_RELEASE_SETUP_REQUIRED');
        } else {
            if (args.expectedActorId) assertSnapshotActor(access.user._id, args.expectedActorId);
            if (args.expectedDeploymentId !== undefined && args.expectedDeploymentId !== release.deploymentId) cloudError('CLOUD_RELEASE_NOT_READY');
        }
        if (release.status !== 'ready' || !release.deploymentId || release.hash !== args.hash) cloudError('CLOUD_RELEASE_NOT_READY');
        const old = await ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', access.user._id)).unique();
        const value = { releaseId: release._id, actorId: access.user._id, hash: args.hash, deploymentId: release.deploymentId, reviewedAt: Date.now() };
        if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert('cloudReleaseReviews', value);
        return null;
    },
});

export const request = mutation({
    args: { releaseId: v.id('cloudReleases'), operationKey: v.string(), kind: v.union(v.literal('build'), v.literal('publish'), v.literal('rollback')), expectedLiveReleaseId: v.union(v.id('cloudReleases'), v.null()), expectedActorId: v.optional(v.id('users')),
        expectedHash: v.optional(v.string()), expectedTargetDeploymentId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const candidate = await ctx.db.get(args.releaseId);
        if (candidate) assertReleaseAvailable(candidate);
        const imported = candidate !== null && hasImportedHostingFields(candidate);
        if (imported && args.kind !== 'build' && candidate!.importedHosting?.visibility !== 'publishable') cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        if (imported && (!candidate!.importedHosting || !candidate!.importedHostingRequest || !candidate!.importedHostingBuildPolicyJson)) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        const { release, access } = imported ? { release: candidate!, access: await requireImportedReleaseAccess(ctx, candidate!) } : await requireRelease(ctx, args.releaseId, true);
        if (imported) {
            assertSnapshotActor(access.user._id, args.expectedActorId);
            requireImportedSnapshotsEnabled();
            if (access.workspace._id !== release.workspaceId) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
            if (args.kind === 'build' && !access.canDesign) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
            if (release.importedHosting?.visibility === 'publishable') assertImportedReleasePublisher(access, args.kind === 'build');
            await readImportedHostingExecution(ctx, release);
        }
        assertOperationId(args.operationKey);
        const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).unique();
        if (!destination || !(await destinationEnabled(ctx, destination, args.kind))) cloudError('CLOUD_RELEASE_SETUP_REQUIRED');
        if (imported ? destination.hostingProfile !== 'imported-next-hosting-v1' || destination.registrationVersion !== 2 || destination.workspaceId !== release.workspaceId : destination.hostingProfile !== undefined) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        if (release.purpose !== 'release' || !release.hash) cloudError('CLOUD_RELEASE_NOT_READY');
        const prior = await readOperation(ctx, () => ctx.db.query('cloudReleaseOperations').withIndex('by_destinationId_and_operationKey', q => q.eq('destinationId', destination._id).eq('operationKey', args.operationKey)).unique());
        if (prior) {
            if (prior.actorId !== access.user._id || !operationVariant(release, destination, prior) || !releaseRequestMatches(prior, { ...args, sourceHash: release.hash })) cloudError('CLOUD_INVALID_OPERATION');
            if (imported && args.kind !== 'build' && (!args.expectedHash || !args.expectedTargetDeploymentId ||
                args.expectedHash !== prior.sourceHash || args.expectedTargetDeploymentId !== prior.targetDeploymentId)) cloudError('CLOUD_INVALID_OPERATION');
            return prior._id;
        }
        if (imported && args.kind !== 'build' && (!args.expectedHash || !args.expectedTargetDeploymentId ||
            args.expectedHash !== release.hash || args.expectedTargetDeploymentId !== release.deploymentId)) cloudError('CLOUD_RELEASE_CHANGED');
        const stages = await operationStages(ctx, release.branchId);
        if (destination.lockOperationId || stages.unknown || stages.busy) cloudError('CLOUD_RELEASE_BUSY');
        if ((destination.liveReleaseId ?? null) !== args.expectedLiveReleaseId) cloudError('CLOUD_RELEASE_LIVE_CHANGED');
        if (args.kind === 'publish' && (release.baselineReleaseId ?? null) !== (destination.liveReleaseId ?? null)) cloudError('CLOUD_RELEASE_LIVE_CHANGED');
        if (args.kind === 'build') {
            if (release.status !== 'frozen' || destination.remainingBuilds < 1) cloudError('CLOUD_RELEASE_BUILD_LIMIT');
        } else if (imported) {
            await assertImportedPublicTarget(ctx, release, destination, { actorId: access.user._id, kind: args.kind,
                expectedLiveReleaseId: args.expectedLiveReleaseId, expectedDeploymentId: destination.liveDeploymentId, targetDeploymentId: release.deploymentId });
        } else {
            const reviewed = await ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', access.user._id)).unique();
            if (release.status !== 'ready' || !release.deploymentId || release.builtDestinationKey !== destination.key || reviewed?.hash !== release.hash || reviewed?.deploymentId !== release.deploymentId) cloudError('CLOUD_RELEASE_REVIEW_REQUIRED');
            if (args.kind === 'rollback') {
                if (!(await confirmedPublication(ctx, release, destination))) cloudError('CLOUD_RELEASE_ROLLBACK_UNAVAILABLE');
            }
        }
        const nonce = crypto.randomUUID();
        const operationId = await ctx.db.insert('cloudReleaseOperations', { destinationId: destination._id, releaseId: release._id, projectId: release.projectId,
            branchId: release.branchId, actorId: access.user._id, operationKey: args.operationKey, kind: args.kind, stage: 'queued', nonce,
            generation: destination.generation, credentialId: destination.credentialId, credentialVersion: destination.credentialVersion, credentialHash: destination.credentialHash, expectedDeploymentId: destination.liveDeploymentId, targetDeploymentId: release.deploymentId,
            expectedLiveReleaseId: args.expectedLiveReleaseId,
            ...(imported ? { deployHash: release.importedHosting!.deployHash, buildPolicyHash: release.importedHosting!.buildPolicyHash } : {}),
            sourceHash: release.hash, createdAt: Date.now(), updatedAt: Date.now() });
        const schedulerId = await ctx.scheduler.runAfter(0, workerRef, { operationId, nonce });
        await ctx.db.patch(operationId, { schedulerId });
        await ctx.scheduler.runAfter(300_000, finishRef, { operationId });
        await ctx.db.patch(destination._id, { lockOperationId: operationId, remainingBuilds: destination.remainingBuilds - (args.kind === 'build' ? 1 : 0) });
        if (args.kind === 'build') await ctx.db.patch(release._id, { status: 'building' });
        return operationId;
    },
});

export const _workerInput = internalQuery({
    args: { operationId: v.id('cloudReleaseOperations'), nonce: v.string() },
    handler: async (ctx, args) => {
        const op = await ctx.db.get(args.operationId);
        if (!op || op.nonce !== args.nonce || op.stage !== 'queued') return null;
        const destination = await ctx.db.get(op.destinationId), release = await ctx.db.get(op.releaseId);
        if (!destination || !release || !operationVariant(release, destination, op) || destination.lockOperationId !== op._id || !(await destinationEnabled(ctx, destination, op.kind)) || destination.generation !== op.generation || !(await workerAllowed(ctx, op, release))) return null;
        const credential = await activeReleaseCredential(ctx, destination);
        if (!credential || op.credentialId !== credential._id || op.credentialVersion !== credential.version || op.credentialHash !== credential.ciphertextHash) return null;
        if (hasImportedHostingFields(release) && ((destination.liveReleaseId ?? null) !== (op.expectedLiveReleaseId ?? null) ||
            (destination.liveDeploymentId ?? null) !== (op.expectedDeploymentId ?? null))) return null;
        if (hasImportedHostingFields(release) && op.kind !== 'build') await assertImportedPublicTarget(ctx, release, destination, op);
        const facts = hasImportedHostingFields(release) ? await readImportedHostingExecution(ctx, release) : null;
        return { op, destination, release, credential, ...(facts ? { importedCandidate: facts.candidate } : {}),
            files: facts?.deployFiles ?? await releaseFiles(ctx, release._id, 'deploy') };
    },
});

export const _beginSend = internalMutation({
    args: { operationId: v.id('cloudReleaseOperations'), nonce: v.string() },
    handler: async (ctx, args) => {
        const op = await ctx.db.get(args.operationId);
        if (!op || op.nonce !== args.nonce || op.stage !== 'queued' || !op.schedulerId) return false;
        const scheduled = await ctx.db.system.get(op.schedulerId);
        const destination = await ctx.db.get(op.destinationId), release = await ctx.db.get(op.releaseId);
        if (scheduled?.state.kind !== 'inProgress' || !destination || !release || !operationVariant(release, destination, op) || !(await destinationEnabled(ctx, destination, op.kind)) || destination.lockOperationId !== op._id ||
            destination.generation !== op.generation || release.hash !== op.sourceHash || op.credentialId !== destination.credentialId ||
            op.credentialVersion !== destination.credentialVersion || op.credentialHash !== destination.credentialHash || !op.credentialId || !(await workerAllowed(ctx, op, release))) return false;
        if (hasImportedHostingFields(release)) {
            if ((destination.liveReleaseId ?? null) !== (op.expectedLiveReleaseId ?? null) ||
                (destination.liveDeploymentId ?? null) !== (op.expectedDeploymentId ?? null)) return false;
            if (op.kind !== 'build') await assertImportedPublicTarget(ctx, release, destination, op);
            await readImportedHostingExecution(ctx, release);
        }
        await ctx.db.patch(op._id, { stage: 'sending', updatedAt: Date.now() });
        return true;
    },
});

export const _result = internalMutation({
    args: { operationId: v.id('cloudReleaseOperations'), nonce: v.string(), outcome: v.union(v.literal('confirmed'), v.literal('failed'), v.literal('unknown')),
        deploymentId: v.optional(v.string()), deploymentUrl: v.optional(v.string()), error: v.optional(v.string()), drifted: v.optional(v.boolean()), terminalBuildFailure: v.optional(v.boolean()) },
    handler: async (ctx, args) => {
        const op = await ctx.db.get(args.operationId);
        const release = op ? await ctx.db.get(op.releaseId) : null;
        const destination = op ? await ctx.db.get(op.destinationId) : null;
        if (release && releaseIsRemoving(release)) return null;
        if (release && hasImportedHostingFields(release) && (!op || !destination || !operationVariant(release, destination, op))) return null;
        if (!op || op.nonce !== args.nonce || !['queued', 'sending'].includes(op.stage)) return null;
        // Definitive failure is permitted only before the worker acquired send authority.
        const invalidImportedOutcome = !!release && !!destination && hasImportedHostingFields(release) && op.kind !== 'build' &&
            args.outcome === 'confirmed' && (op.stage !== 'sending' || !importedAliasOutcomeMatches(release, destination, op, args.deploymentId));
        const stage = invalidImportedOutcome ? 'unknown' : args.outcome === 'failed' && op.stage === 'sending' && !(op.kind === 'build' && args.terminalBuildFailure) ? 'unknown' : args.outcome;
        await ctx.db.patch(op._id, { stage, resultDeploymentId: args.deploymentId, resultUrl: args.deploymentUrl, error: invalidImportedOutcome ? 'CLOUD_RELEASE_TARGET_CHANGED' : args.error, updatedAt: Date.now() });
        if ((args.drifted || invalidImportedOutcome) && destination) await ctx.db.patch(destination._id, { drifted: true });
        await ctx.scheduler.runAfter(1000, finishRef, { operationId: op._id });
        return null;
    },
});

/** Never release a lock while its original worker can still perform a POST. */
export const _settle = internalMutation({
    args: { operationId: v.id('cloudReleaseOperations') },
    handler: async (ctx, { operationId }) => {
        const op = await ctx.db.get(operationId);
        if (!op?.schedulerId || op.stage === 'unknown') return null;
        const guardedRelease = await ctx.db.get(op.releaseId);
        if (guardedRelease && releaseIsRemoving(guardedRelease)) return null;
        if (guardedRelease && hasImportedHostingFields(guardedRelease)) {
            const destination = await ctx.db.get(op.destinationId);
            if (!destination || !operationVariant(guardedRelease, destination, op)) return null;
        }
        const scheduled = await ctx.db.system.get(op.schedulerId);
        if (!scheduled) return null;
        if (!canReleaseDestination(op.stage, scheduled.state.kind)) {
            if (['queued', 'sending'].includes(op.stage) && ['failed', 'canceled'].includes(scheduled.state.kind)) {
                await ctx.db.patch(op._id, { stage: op.stage === 'sending' ? 'unknown' : 'failed', error: 'CLOUD_RELEASE_WORKER_STOPPED', updatedAt: Date.now() });
                if (op.stage === 'queued') await ctx.scheduler.runAfter(0, finishRef, { operationId });
            }
            if (scheduled.state.kind === 'inProgress' || scheduled.state.kind === 'pending') await ctx.scheduler.runAfter(5000, finishRef, { operationId });
            return null;
        }
        const destination = await ctx.db.get(op.destinationId), release = await ctx.db.get(op.releaseId);
        if (!destination || destination.lockOperationId !== op._id || !release) return null;
        if (op.stage === 'confirmed' && hasImportedHostingFields(release) && op.kind !== 'build' &&
            !importedAliasOutcomeMatches(release, destination, op, op.resultDeploymentId)) {
            await ctx.db.patch(op._id, { stage: 'unknown', error: 'CLOUD_RELEASE_TARGET_CHANGED', updatedAt: Date.now() });
            await ctx.db.patch(destination._id, { drifted: true });
            return null;
        }
        if (op.stage === 'confirmed' && op.resultDeploymentId) {
            if (op.kind === 'build') await ctx.db.patch(release._id, { status: 'ready', deploymentId: op.resultDeploymentId, deploymentUrl: op.resultUrl, builtDestinationKey: destination.key });
            else await ctx.db.patch(destination._id, { liveReleaseId: release._id, liveDeploymentId: op.resultDeploymentId });
        } else if (op.kind === 'build') await ctx.db.patch(release._id, { status: 'error', error: op.error });
        await ctx.db.patch(destination._id, { lockOperationId: undefined });
        return null;
    },
});

/** Operator-only setup. Pins also have to match server environment and live provider proof. */
export const _configure = internalMutation({
    args: { ...cloudScope, teamId: v.string(), providerProjectId: v.string(), hostname: v.string(), builds: v.number(), approvedUntil: v.number(), grantKey: v.optional(v.string()), reviewGatewayVerified: v.boolean(), publicAliasVerified: v.boolean(), hostingProfile: v.optional(v.literal('imported-next-hosting-v1')) },
    handler: async (ctx, args) => {
        const key = destinationKey(args.teamId, args.providerProjectId, args.hostname);
        if (!Number.isSafeInteger(args.builds) || args.builds < 0 || args.builds > 8 || !Number.isSafeInteger(args.approvedUntil)) cloudError('CLOUD_RELEASE_INVALID_ALLOWANCE');
        if (args.grantKey !== undefined) assertOperationId(args.grantKey);
        const existing = await ctx.db.query('cloudReleaseDestinations').withIndex('by_key', q => q.eq('key', key)).unique();
        const branchDestination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
        if (existing?.lockOperationId || (existing && (existing.projectId !== args.projectId || existing.branchId !== args.branchId)) || (branchDestination && branchDestination.key !== key)) cloudError('CLOUD_RELEASE_BUSY');
        if ((existing && existing.hostingProfile !== args.hostingProfile) ||
            (args.hostingProfile !== undefined && args.publicAliasVerified &&
                !(existing?.registrationVersion === 2 && existing.publicAliasVerified && existing.reviewGatewayVerified)) ||
            (existing?.registrationVersion !== undefined && (args.reviewGatewayVerified !== existing.reviewGatewayVerified || args.publicAliasVerified !== existing.publicAliasVerified))) cloudError('CLOUD_RELEASE_INVALID_CONFIGURATION');
        const branch = await ctx.db.get(args.branchId);
        if (branch?.projectId !== args.projectId) cloudError('CLOUD_NOT_ENROLLED');
        const providerDestinations = await ctx.db.query('cloudReleaseDestinations')
            .withIndex('by_teamId_and_providerProjectId', q => q.eq('teamId', args.teamId).eq('providerProjectId', args.providerProjectId)).take(2);
        const hostnameDestinations = await ctx.db.query('cloudReleaseDestinations')
            .withIndex('by_hostname', q => q.eq('hostname', args.hostname)).take(2);
        if ([...providerDestinations, ...hostnameDestinations].some(destination => destination._id !== existing?._id)) cloudError('CLOUD_RELEASE_BUSY');

        if (args.grantKey === undefined) {
            if (!existing || args.builds !== existing.remainingBuilds || args.approvedUntil !== existing.approvedUntil) cloudError('CLOUD_RELEASE_INVALID_ALLOWANCE');
        } else {
            const grantKey = args.grantKey;
            const receipt = existing ? await ctx.db.query('cloudReleaseBuildGrants')
                .withIndex('by_destinationId_and_grantKey', q => q.eq('destinationId', existing._id).eq('grantKey', grantKey)).unique() : null;
            if (receipt) {
                if (receipt.builds !== args.builds || receipt.approvedUntil !== args.approvedUntil) cloudError('CLOUD_RELEASE_INVALID_ALLOWANCE');
                // A retry must not refill spent builds or undo later proof/configuration changes.
                return null;
            }
            const now = Date.now();
            if (args.approvedUntil <= now || args.approvedUntil > now + 7 * 86400_000) cloudError('CLOUD_RELEASE_INVALID_ALLOWANCE');
        }
        const value = { projectId: args.projectId, branchId: args.branchId, key, teamId: args.teamId, providerProjectId: args.providerProjectId,
            ...(args.hostingProfile === undefined ? {} : { hostingProfile: args.hostingProfile }),
            hostname: args.hostname, generation: (existing?.generation ?? 0) + 1,
            reviewGatewayVerified: args.reviewGatewayVerified, publicAliasVerified: args.publicAliasVerified };
        const allowance = { approvedUntil: args.approvedUntil, remainingBuilds: args.builds };
        let destinationId: Id<'cloudReleaseDestinations'>;
        if (existing) {
            destinationId = existing._id;
            await ctx.db.patch(existing._id, { ...value, ...(args.grantKey === undefined ? {} : allowance) });
        } else {
            destinationId = await ctx.db.insert('cloudReleaseDestinations', { ...value, ...allowance, drifted: false });
        }
        if (args.grantKey !== undefined) await ctx.db.insert('cloudReleaseBuildGrants', {
            destinationId, grantKey: args.grantKey, builds: args.builds, approvedUntil: args.approvedUntil,
        });
        return null;
    },
});

function capturedFile(file: Infer<typeof frozenReleaseFile>): Infer<typeof frozenReleaseFile> {
    return { path: file.path, kind: file.kind, text: file.text, storageId: file.storageId, hash: file.hash, bytes: file.bytes, ...(file.media === undefined ? {} : { media: file.media }) };
}

async function captureImported(ctx: MutationCtx, args: Scope & {
    expectedRevision: number; operationKey: string; purpose: 'release' | 'backup' | 'private-artifact'; publicationIntent?: typeof IMPORTED_PUBLICATION_INTENT; expectedActorId?: Id<'users'>;
}, access: Awaited<ReturnType<typeof requireCloudAccess>>) {
    requireImportedSnapshotsEnabled();
    assertSnapshotActor(access.user._id, args.expectedActorId);
    if (!access.canDesign || !access.preparation) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    if (args.purpose === 'release') {
        assertImportedPublicationAccess(access);
        if (args.publicationIntent !== IMPORTED_PUBLICATION_INTENT) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    } else if (args.publicationIntent !== undefined) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    assertOperationId(args.operationKey);
    await assertSnapshotBudget(ctx);
    const previous = await ctx.db.query('cloudReleases').withIndex('by_branchId_and_operationKey', q => q.eq('branchId', args.branchId).eq('operationKey', args.operationKey)).unique();
    if (previous) {
        assertReleaseAvailable(previous);
        if (!isImportedRelease(previous) || previous.projectId !== args.projectId || previous.branchId !== args.branchId ||
            previous.workspaceId !== access.workspace._id || previous.actorId !== access.user._id || previous.purpose !== args.purpose ||
            previous.publicationIntent !== args.publicationIntent || previous.revision !== args.expectedRevision) cloudError('CLOUD_INVALID_OPERATION');
        importedMetadata(previous);
        return previous._id;
    }
    if (access.state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
    await assertSnapshotBudget(ctx, { readBytes: MAX_RELEASES * IMPORTED_SNAPSHOT_LIMITS.metadata, readDocs: MAX_RELEASES, readCalls: 1 });
    if ((await ctx.db.query('cloudReleases').withIndex('by_branchId_and_removedAt', q => q.eq('branchId', args.branchId).eq('removedAt', undefined)).take(MAX_RELEASES)).length >= MAX_RELEASES) cloudError('CLOUD_RELEASE_RETENTION_LIMIT');
    await assertSnapshotBudget(ctx, { readBytes: IMPORTED_SNAPSHOT_LIMITS.sourceStage, readDocs: MAX_CLOUD_FILES + 1, readCalls: 1 });
    const current = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
    if (current.some(file => file.projectId !== args.projectId || file.branchId !== args.branchId)) cloudError('CLOUD_IMPORTED_ARTIFACT_INVALID');
    const currentFiles = current.map(capturedFile);
    const receipt = access.preparation;
    await assertSnapshotBudget(ctx, { readBytes: IMPORTED_SNAPSHOT_LIMITS.document, readDocs: 1, readCalls: 1 });
    const baseline = await ctx.db.get(receipt.baselineAttemptId);
    if (!baseline || baseline.state !== 'finalized' || baseline.projectId !== args.projectId || baseline.branchId !== args.branchId ||
        baseline.workspaceId !== access.workspace._id || baseline.manifestHash !== receipt.baselineManifestHash) cloudError('CLOUD_IMPORTED_ARTIFACT_INVALID');
    snapshotDocumentBytes(baseline);
    await assertSnapshotBudget(ctx, { readBytes: MAX_CLOUD_FILES * 2048, readDocs: MAX_CLOUD_FILES + 1, readCalls: 1 });
    const receipts = await ctx.db.query('cloudEditorImportFiles').withIndex('by_attemptId', q => q.eq('attemptId', baseline._id)).take(MAX_CLOUD_FILES + 1);
    const byIndex = new Map(receipts.map(row => [row.index, row]));
    if (byIndex.size !== receipts.length || receipts.length !== baseline.files.filter(file => file.kind === 'binary').length) cloudError('CLOUD_IMPORT_INCOMPLETE');
    const original = baseline.files.map((file, index): Infer<typeof releaseFile> => {
        if (file.kind === 'text') return { path: file.path, kind: 'file', text: file.text, hash: file.hash, bytes: file.bytes };
        const row = byIndex.get(index);
        if (!row || row.attemptId !== baseline._id || row.state !== 'received' || !row.valid || !row.storageId || row.collectedAt !== undefined ||
            row.path !== file.path || row.hash !== file.hash || row.bytes !== file.bytes) return cloudError('CLOUD_IMPORT_INCOMPLETE');
        return { path: file.path, kind: 'file', storageId: row.storageId, hash: file.hash, bytes: file.bytes };
    });
    const frozen = await freezeImportedMedia(ctx, args, currentFiles, original, args.expectedRevision);
    const source = frozen.files.map(file => ({ ...file, storageId: file.storageId as Id<'_storage'> | undefined }));
    const studioConfig = captureImportedStudioConfig(source, original);
    const metadata: ImportedReleaseMetadata = { ...(frozen.mediaManifestHash === null ? { version: 1 as const } : { version: 2 as const, mediaManifestHash: frozen.mediaManifestHash }), capturedRevision: args.expectedRevision,
        ...(studioConfig === undefined ? {} : { studioConfig }),
        originalManifestHash: baseline.manifestHash, preparation: {
            inputRevision: receipt.inputRevision, preparedRevision: receipt.preparedRevision,
            inputManifestHash: receipt.inputManifestHash, preparedManifestHash: receipt.preparedManifestHash,
            policy: receipt.policy, instrumentation: receipt.instrumentation,
        } };
    await validateImportedReleaseSnapshot({ source, original, metadata });
    await verifySnapshotStorage(ctx, source);
    const release = { projectId: args.projectId, branchId: args.branchId, workspaceId: access.workspace._id, actorId: access.user._id,
        projectName: access.project?.name, operationKey: args.operationKey, revision: args.expectedRevision, purpose: args.purpose,
        artifactProfile: importedArtifactProfile(metadata, args.purpose), imported: metadata,
        ...(args.purpose === 'release' ? { publicationIntent: IMPORTED_PUBLICATION_INTENT } : {}), status: 'captured' as const,
        studioInputJson: 'null', previousArtifactJson: 'null', createdAt: Date.now() };
    const retained = [...new Set(source.flatMap(file => file.storageId ? [file.storageId] : []))];
    const placeholder = 'x'.repeat(128);
    let writeBytes = snapshotDocumentBytes(release, IMPORTED_SNAPSHOT_LIMITS.metadata);
    for (const [stage, files] of [['source', source], ['original', original]] as const)
        for (const file of files) writeBytes += snapshotDocumentBytes({ releaseId: placeholder, stage, ...file });
    for (const storageId of retained) writeBytes += snapshotDocumentBytes({ releaseId: placeholder, storageId });
    await assertSnapshotBudget(ctx, { writeBytes, writeDocs: 1 + source.length + original.length + retained.length });
    const releaseId = await ctx.db.insert('cloudReleases', release);
    for (const [stage, files] of [['source', source], ['original', original]] as const)
        for (const file of files) await ctx.db.insert('cloudReleaseFiles', { releaseId, stage, ...file });
    for (const storageId of retained) await ctx.db.insert('cloudReleaseAssets', { releaseId, storageId });
    await assertSnapshotBudget(ctx);
    return releaseId;
}

export async function importedStages(ctx: Context, release: Doc<'cloudReleases'>) {
    assertReleaseAvailable(release);
    const metadata = importedMetadata(release);
    await assertSnapshotBudget(ctx, { readBytes: IMPORTED_SNAPSHOT_LIMITS.sourceStage, readDocs: MAX_CLOUD_FILES + 1, readCalls: 1 });
    const source = (await releaseFiles(ctx, release._id, 'source')).map(capturedFile);
    await assertSnapshotBudget(ctx, { readBytes: IMPORTED_SNAPSHOT_LIMITS.originalStage, readDocs: MAX_CLOUD_FILES + 1, readCalls: 1 });
    const original = (await releaseFiles(ctx, release._id, 'original')).map(capturedFile);
    await validateImportedReleaseSnapshot({ source, original, metadata });
    await assertSnapshotBudget(ctx);
    return { source, original, metadata };
}

async function importedArtifactAccess(ctx: Context, release: Doc<'cloudReleases'>) {
    if (release.purpose !== 'release') return retainedImportedAccess(ctx, release);
    importedMetadata(release);
    const access = await requireCloudAccess(ctx, release);
    assertImportedPublicationAccess(access);
    if (access.workspace._id !== release.workspaceId) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    return access;
}

async function sealImported(ctx: MutationCtx, release: Doc<'cloudReleases'>, args: {
    releaseId: Id<'cloudReleases'>; sourceHash: string; hash: string; artifactJson: string;
    files: Infer<typeof releaseFile>[]; expectedActorId?: Id<'users'>;
}) {
    requireImportedSnapshotsEnabled();
    const access = await importedArtifactAccess(ctx, release);
    assertSnapshotActor(access.user._id, args.expectedActorId);
    if (access.user._id !== release.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    assertSnapshotEnvelope(args, IMPORTED_SNAPSHOT_LIMITS.sealArgs);
    const stages = await importedStages(ctx, release);
    await validateImportedSeal(release, stages, args);
    if (release.status !== 'captured') {
        if (release.status !== 'frozen' || release.hash !== args.hash || release.sourceHash !== args.sourceHash || release.artifactJson !== args.artifactJson) cloudError('CLOUD_RELEASE_CHANGED');
        return null;
    }
    if (release.purpose === 'backup') {
        if (args.files.length) cloudError('CLOUD_IMPORTED_ARTIFACT_INVALID');
    } else await validateSnapshotStage(args.files, 'deploy');
    const retained = new Set(stages.source.flatMap(file => file.storageId ? [file.storageId] : []));
    if (args.files.some(file => file.storageId && !retained.has(file.storageId))) cloudError('CLOUD_RELEASE_ASSET_MISSING');
    const patch = { status: 'frozen' as const, sourceHash: args.sourceHash, hash: args.hash, artifactJson: args.artifactJson };
    let writeBytes = snapshotDocumentBytes({ ...release, ...patch }, IMPORTED_SNAPSHOT_LIMITS.metadata);
    for (const file of args.files) writeBytes += snapshotDocumentBytes({ releaseId: release._id, stage: 'deploy', ...file });
    await assertSnapshotBudget(ctx, { writeBytes, writeDocs: args.files.length + 1 });
    for (const file of args.files) await ctx.db.insert('cloudReleaseFiles', { releaseId: release._id, stage: 'deploy', ...file });
    await ctx.db.patch(release._id, patch);
    await assertSnapshotBudget(ctx);
    return null;
}

type PrivateBuildReason = 'not-configured' | 'paused' | 'no-builds' | 'busy' | 'unknown' | null;
type ImportedReleaseStatusRow = ReturnType<typeof versionMetadata> & {
    purpose: Doc<'cloudReleases'>['purpose']; hash: string | null; hostingArtifactId: Id<'cloudReleases'> | null;
    visibility: 'protected-only' | 'publishable' | null; deploymentId: string | null; reviewUrl: string | null;
    removal: ReturnType<typeof activeRemovalProgress>;
} & Record<'publicationSource' | 'canFinishPublicationPreparing' | 'canPreparePublicationReview' | 'canAcknowledge' |
    'canFinishPreparing' | 'preparationOwnerRequired' | 'canPreparePrivateReview' | 'canBuildPrivateReview' | 'reviewed' |
    'canPublish' | 'canRollback' | 'canManageVersions' | 'canDownload', boolean>;
async function importedStatus(ctx: Context, scope: StatusScope, state: Doc<'cloudEditorStates'>) {
    const access = await requireImportedReleaseAccess(ctx, scope);
    await assertSnapshotBudget(ctx, { readBytes: MAX_RELEASES * IMPORTED_SNAPSHOT_LIMITS.metadata, readDocs: MAX_RELEASES, readCalls: 1 });
    const rows = await ctx.db.query('cloudReleases').withIndex('by_branchId_and_removedAt', q => q.eq('branchId', scope.branchId).eq('removedAt', undefined)).order('desc').take(MAX_RELEASES);
    const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    // Recent activity is display only; every authoritative lookup uses an exact index.
    await assertSnapshotBudget(ctx, { readBytes: 20 * 16_384, readDocs: 20, readCalls: 1 });
    const operations = await ctx.db.query('cloudReleaseOperations').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).order('desc').take(20);
    for (const op of operations) snapshotDocumentBytes(op, 16_384);
    const saved = scope.recoveryRequest;
    const recoveryDestination = destination && destination.projectId === scope.projectId && destination.branchId === scope.branchId && destination.workspaceId === access.workspace._id ? destination : null;
    const recovery = saved && recoveryDestination ? await readOperation(ctx, () => ctx.db.query('cloudReleaseOperations')
        .withIndex('by_destinationId_and_operationKey', q => q.eq('destinationId', recoveryDestination._id).eq('operationKey', saved.operationKey)).unique()) : null;
    if (saved && recovery && (recovery.operationKey !== saved.operationKey ||
        (saved.operationId !== undefined && recovery._id !== saved.operationId) || recovery.actorId !== access.user._id ||
        recovery.projectId !== scope.projectId || recovery.branchId !== scope.branchId || recovery.releaseId !== saved.releaseId ||
        recovery.kind !== saved.kind || recovery.sourceHash !== saved.expectedHash || recovery.targetDeploymentId !== saved.expectedTargetDeploymentId ||
        (recovery.expectedLiveReleaseId ?? null) !== saved.expectedLiveReleaseId)) cloudError('CLOUD_INVALID_OPERATION');
    let recoveryRemoval: { state: 'removed'; releaseId: Id<'cloudReleases'>; hash: string; completedAt: number } | null = null;
    // A known admission whose receipt is missing stays uncertain. Only an unadmitted saved intent may retire on a valid tombstone.
    if (saved && recoveryDestination && !recovery && saved.operationId === undefined) {
        await assertSnapshotBudget(ctx, { readBytes: 1_048_576, readDocs: 1, readCalls: 1 });
        const removed = await ctx.db.get(saved.releaseId);
        if (removed?.projectId === scope.projectId && removed.branchId === scope.branchId && removed.workspaceId === access.workspace._id &&
            removed.hash === saved.expectedHash && removed.removal?.phase === 'done') {
            const progress = removalProgress(removed);
            if (progress.phase === 'done') recoveryRemoval = { state: 'removed', releaseId: removed._id, hash: saved.expectedHash, completedAt: progress.completedAt };
        }
    }
    await assertSnapshotBudget(ctx);
    const configured = !!destination && destination.projectId === scope.projectId && destination.workspaceId === access.workspace._id &&
        destination.hostingProfile === 'imported-next-hosting-v1' && destination.registrationVersion === 2;
    const credential = configured ? await activeReleaseCredential(ctx, destination) : null;
    const paused = !importedSnapshotsEnabled() || !enabled() || !releaseReviewConfigured() || !!destination?.drifted || (destination?.approvedUntil ?? 0) <= Date.now();
    const stages = await operationStages(ctx, scope.branchId);
    const unknown = stages.unknown;
    const busy = !!destination?.lockOperationId || stages.busy;
    const privateBuildReason: PrivateBuildReason = unknown ? 'unknown' : busy ? 'busy' : !configured || !credential ? 'not-configured' : paused ? 'paused' : destination.remainingBuilds < 1 ? 'no-builds' : null;
    const canBuildPrivateReview = access.canDesign && privateBuildReason === null;
    const publicReviewEnabled = importedPublicationEnabled();
    const canReviewPublication = access.publicationGrant && publicReviewEnabled && !paused;
    const canSavePublicationVersion = access.canDesign && access.publicationGrant && publicReviewEnabled && importedSnapshotsEnabled();
    const publicationReason: 'not-configured' | 'paused' | 'busy' | 'unknown' | null = unknown ? 'unknown' : busy ? 'busy' :
        !configured || !credential || !destination?.reviewGatewayVerified || !destination.publicAliasVerified ? 'not-configured' :
            paused || !publicReviewEnabled || !access.publicationGrant ? 'paused' : null;
    const canPublishImported = canReviewPublication && configured && !!credential && !!destination?.reviewGatewayVerified &&
        !!destination?.publicAliasVerified && !busy && !unknown;
    const canBootstrapReview = access.role === 'responsible' && can('project.invite', {
        workspace: { id: access.workspace._id, createdByUserId: access.workspace.createdByUserId }, workspaceRole: access.workspaceRole,
        project: access.project ? { id: access.project._id, workspaceId: access.project.workspaceId, accessMode: access.project.accessMode } : undefined,
        projectRole: access.projectRole,
    });
    const releases: ImportedReleaseStatusRow[] = [];
    for (const release of rows) {
        const hosting = hasImportedHostingFields(release);
        if (release.projectId !== scope.projectId || release.workspaceId !== access.workspace._id) continue;
        if (hosting) {
            // Bounded immutable JSON/receipt validation only. No deploy-file or parent inventory reads in status.
            try { await readImportedHostingIdentity(release); } catch { continue; }
        }
        if (!access.canDesign && !hosting) continue;
        const available = !releaseIsRemoving(release);
        const visibility = hosting ? release.importedHosting!.visibility : null;
        const publicCandidate = visibility === 'publishable';
        const candidateEnabled = !publicCandidate || publicReviewEnabled;
        const ready = available && hosting && release.status === 'ready' && !!release.deploymentId && !!release.hash;
        const acknowledgment = ready && publicCandidate ? await ctx.db.query('cloudReleaseReviews')
            .withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', access.user._id)).unique() : null;
        const privateArtifact = !hosting && isImportedRelease(release) && release.purpose === 'private-artifact';
        let publicationSource = false;
        if (!hosting && isImportedRelease(release) && release.purpose === 'release') {
            try { importedMetadata(release); publicationSource = true; } catch { /* Malformed rows never gain public controls. */ }
        }
        const reviewed = !!acknowledgment && acknowledgment.hash === release.hash && acknowledgment.deploymentId === release.deploymentId;
        // Advisory over the bounded listing. Request/beginSend revalidate the full public pair and current history.
        const publicReady = !!destination && ready && publicCandidate && reviewed && canPublishImported && release.builtDestinationKey === destination.key && destination.liveReleaseId !== release._id;
        const rollbackHistory = !!destination && publicReady && await confirmedPublication(ctx, release, destination);
        releases.push({ ...versionMetadata(release), purpose: release.purpose, hash: release.hash ?? null,
            publicationSource,
            canFinishPublicationPreparing: publicationSource && available && canSavePublicationVersion && release.status === 'captured' && release.actorId === access.user._id,
            canPreparePublicationReview: publicationSource && available && canSavePublicationVersion && release.status === 'frozen' && !!release.hash,
            hostingArtifactId: hosting ? release.importedHosting!.artifactId : null, visibility, deploymentId: ready ? release.deploymentId! : null,
            canAcknowledge: ready && publicCandidate && canReviewPublication && configured && !!credential && destination.reviewGatewayVerified && release.builtDestinationKey === destination.key,
            canFinishPreparing: access.canDesign && available && privateArtifact && release.status === 'captured' && release.actorId === access.user._id && importedSnapshotsEnabled(),
            preparationOwnerRequired: available && privateArtifact && release.status === 'captured' && release.actorId !== access.user._id,
            canPreparePrivateReview: access.canDesign && available && privateArtifact && release.status === 'frozen' && !!release.hash && importedSnapshotsEnabled(),
            canBuildPrivateReview: available && hosting && candidateEnabled && (!publicCandidate || access.publicationGrant) && release.status === 'frozen' && canBuildPrivateReview,
            reviewed, canPublish: publicReady && (release.baselineReleaseId ?? null) === (destination?.liveReleaseId ?? null), canRollback: rollbackHistory,
            reviewUrl: candidateEnabled && available && hosting && release.status === 'ready' && !!release.deploymentId && !!release.deploymentUrl &&
                configured && !!credential && !paused && release.builtDestinationKey === destination.key &&
                (destination.reviewGatewayVerified || canBootstrapReview) ? `https://${release._id}.${process.env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX}/` : null,
            canManageVersions: access.canDesign, removal: activeRemovalProgress(release), canDownload: false });
    }
    await assertSnapshotBudget(ctx);
    const liveRelease = canPublishImported ? await statusLiveRelease(ctx, rows, destination, scope, access.workspace._id, true) : null;
    const confirmedLive = !!destination && !!liveRelease && await confirmedPublication(ctx, liveRelease, destination);
    await assertSnapshotBudget(ctx);
    return { actorId: access.user._id, workspaceId: access.workspace._id, revision: state.revision,
        profile: 'imported-next-v1', canPublish: false, canPublishImported, publicationEnabled: canPublishImported, publicationReason, canSavePublicationVersion,
        canReviewPublication, canBackup: access.canDesign && importedSnapshotsEnabled(), canRestoreBackup: access.canDesign && importedSnapshotsEnabled(),
        canDownloadBackup: false, canFreezePrivateArtifact: access.canDesign && importedSnapshotsEnabled(), canBuildPrivateReview, privateBuildReason,
        enabled: false, buildEnabled: canBuildPrivateReview, remainingBuilds: configured ? destination.remainingBuilds : 0,
        liveReleaseId: configured ? destination.liveReleaseId ?? null : null, liveDeploymentId: configured ? destination.liveDeploymentId ?? null : null,
        liveUrl: canPublishImported && confirmedLive ? `https://${destination!.hostname}` : null, busy, drifted: destination?.drifted ?? false,
        releases, operations: operations.map(operationStatus), recoveryOperation: recovery ? operationStatus(recovery) : null, recoveryRemoval };
}
