import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { readCloudStudioFreezeInput } from './cloudEditorCms';
import { releaseFile } from './cloudReleasesSchema';
import { assertOperationId, cloudError, cloudScope, MAX_CLOUD_FILES } from './lib/cloudEditor';
import { can } from './lib/auth';
import { releaseReviewConfigured } from './cloudReleaseReviewAccess';
import { canReleaseDestination, destinationKey, MAX_RELEASE_INPUT_BYTES, MAX_RELEASES, releaseRequestMatches } from './lib/cloudReleasePolicy';

type Context = QueryCtx | MutationCtx;
type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
const workerRef = makeFunctionReference<'action', { operationId: Id<'cloudReleaseOperations'>; nonce: string }, null>('cloudReleaseActions:work');
const finishRef = makeFunctionReference<'mutation', { operationId: Id<'cloudReleaseOperations'> }, null>('cloudReleases:_settle');

function enabled(): boolean { return process.env.WEBLAB_CLOUD_RELEASES_ENABLED === 'true'; }
export async function releaseAccess(ctx: Context, scope: Scope, publish = false) {
    const access = await requireCloudAccess(ctx, scope);
    if (!access.role || (publish && !access.canPublish)) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    return access;
}
export async function releaseFiles(ctx: Context, releaseId: Id<'cloudReleases'>, stage: 'source' | 'deploy' | 'baseline') {
    const files = await ctx.db.query('cloudReleaseFiles').withIndex('by_releaseId_and_stage', q => q.eq('releaseId', releaseId).eq('stage', stage)).take(MAX_CLOUD_FILES + 1);
    if (files.length > MAX_CLOUD_FILES) cloudError('CLOUD_RELEASE_TOO_LARGE');
    return files;
}
export async function requireRelease(ctx: Context, releaseId: Id<'cloudReleases'>, publish = false) {
    const release = await ctx.db.get(releaseId);
    if (!release) return cloudError('CLOUD_RELEASE_NOT_FOUND');
    const access = await releaseAccess(ctx, release, publish);
    return { release, access };
}

/** Actor is stored by an authenticated mutation. No browser-supplied identity or saved JWT. */
async function workerAllowed(ctx: Context, op: Doc<'cloudReleaseOperations'>): Promise<boolean> {
    if (!enabled()) return false;
    const [user, project, branch, state] = await Promise.all([
        ctx.db.get(op.actorId), ctx.db.get(op.projectId), ctx.db.get(op.branchId),
        ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', op.branchId)).unique(),
    ]);
    if (!user?.clerkUserId || !project || branch?.projectId !== project._id || state?.projectId !== project._id) return false;
    const workspace = await ctx.db.get(project.workspaceId);
    if (!workspace) return false;
    const [member, workspaceMember, grant] = await Promise.all([
        ctx.db.query('projectMembers').withIndex('by_project_user', q => q.eq('projectId', project._id).eq('userId', user._id)).unique(),
        ctx.db.query('workspaceMembers').withIndex('by_workspace_user', q => q.eq('workspaceId', workspace._id).eq('userId', user._id)).unique(),
        ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', project._id).eq('userId', user._id)).unique(),
    ]);
    return (grant?.publish ?? state.createdByUserId === user._id) &&
        !!(grant?.role ?? (state.createdByUserId === user._id ? 'responsible' : null)) &&
        can('project.view', { workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId }, workspaceRole: workspaceMember?.role ?? null,
            project: { id: project._id, workspaceId: workspace._id, accessMode: project.accessMode }, projectRole: member?.role ?? null });
}

function destinationEnabled(destination: Doc<'cloudReleaseDestinations'>, kind: 'build' | 'publish' | 'rollback'): boolean {
    // A protected build enables operator proof; live switches require both recorded proofs.
    return enabled() && releaseReviewConfigured() && !destination.drifted && destination.approvedUntil > Date.now() &&
        (kind === 'build' || (destination.reviewGatewayVerified && destination.publicAliasVerified)) &&
        destination.teamId === process.env.WEBLAB_CLOUD_RELEASE_TEAM_ID &&
        destination.providerProjectId === process.env.WEBLAB_CLOUD_RELEASE_PROJECT_ID &&
        destination.hostname === process.env.WEBLAB_CLOUD_RELEASE_HOSTNAME;
}

export const capture = mutation({
    args: { ...cloudScope, expectedRevision: v.number(), operationKey: v.string(), purpose: v.union(v.literal('release'), v.literal('backup')) },
    handler: async (ctx, args) => {
        const access = await releaseAccess(ctx, args, args.purpose === 'release');
        if (args.purpose === 'backup' && !access.canDesign) cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        assertOperationId(args.operationKey);
        const previous = await ctx.db.query('cloudReleases').withIndex('by_branchId_and_operationKey', q => q.eq('branchId', args.branchId).eq('operationKey', args.operationKey)).unique();
        if (previous) {
            if (previous.actorId !== access.user._id || previous.purpose !== args.purpose || previous.revision !== args.expectedRevision) cloudError('CLOUD_INVALID_OPERATION');
            return previous._id;
        }
        if (access.state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
        const existing = await ctx.db.query('cloudReleases').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).take(MAX_RELEASES);
        if (existing.length >= MAX_RELEASES) cloudError('CLOUD_RELEASE_RETENTION_LIMIT');
        const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
        if (!files.length || files.length > MAX_CLOUD_FILES) cloudError('CLOUD_RELEASE_TOO_LARGE');
        const input = await readCloudStudioFreezeInput(ctx, args);
        const studioInputJson = JSON.stringify(input);
        if (new TextEncoder().encode(studioInputJson).byteLength > MAX_RELEASE_INPUT_BYTES) cloudError('CLOUD_RELEASE_TOO_LARGE');
        const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
        if (destination?.lockOperationId || destination?.drifted) cloudError('CLOUD_RELEASE_BUSY');
        const baseline = destination?.liveReleaseId ? await ctx.db.get(destination.liveReleaseId) : null;
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
    args: { releaseId: v.id('cloudReleases') },
    handler: async (ctx, { releaseId }) => {
        const { release } = await requireRelease(ctx, releaseId);
        return { release, files: await releaseFiles(ctx, releaseId, 'source'), baselineFiles: await releaseFiles(ctx, releaseId, 'baseline') };
    },
});

export const _seal = internalMutation({
    args: { releaseId: v.id('cloudReleases'), sourceHash: v.string(), hash: v.string(), artifactJson: v.string(), files: v.array(releaseFile) },
    handler: async (ctx, args) => {
        const { release } = await requireRelease(ctx, args.releaseId);
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

export const status = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const access = await releaseAccess(ctx, scope);
        const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
        const releases = await ctx.db.query('cloudReleases').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).order('desc').take(MAX_RELEASES);
        const operations = await ctx.db.query('cloudReleaseOperations').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).order('desc').take(20);
        return {
            actorId: access.user._id, workspaceId: access.workspace._id,
            revision: access.state.revision, canPublish: access.canPublish, canBackup: access.canDesign,
            enabled: !!destination && destinationEnabled(destination, 'publish'),
            buildEnabled: !!destination && destinationEnabled(destination, 'build'), remainingBuilds: destination?.remainingBuilds ?? 0,
            liveReleaseId: destination?.liveReleaseId ?? null, liveUrl: destination?.liveDeploymentId ? `https://${destination.hostname}` : null,
            busy: !!destination?.lockOperationId, drifted: destination?.drifted ?? false,
            releases: await Promise.all(releases.map(async release => {
                const review = await ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', access.user._id)).unique();
                return { id: release._id, purpose: release.purpose, revision: release.revision, status: release.status, hash: release.hash ?? null,
                    createdAt: release.createdAt, reviewed: !!review && review.hash === release.hash && review.deploymentId === release.deploymentId,
                    reviewUrl: release.status === 'ready' && destination && destinationEnabled(destination, 'build') &&
                        (destination.reviewGatewayVerified || (access.role === 'responsible' && access.canManage)) &&
                        destination.key === release.builtDestinationKey ? `https://${release._id}.${process.env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX}/` : null };
            })),
            operations: operations.map(op => ({ id: op._id, releaseId: op.releaseId, kind: op.kind, stage: op.stage, error: op.error ?? null })),
        };
    },
});

export const review = mutation({
    args: { releaseId: v.id('cloudReleases'), hash: v.string() },
    handler: async (ctx, args) => {
        const { release, access } = await requireRelease(ctx, args.releaseId, true);
        if (release.status !== 'ready' || !release.deploymentId || release.hash !== args.hash) cloudError('CLOUD_RELEASE_NOT_READY');
        const old = await ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', access.user._id)).unique();
        const value = { releaseId: release._id, actorId: access.user._id, hash: args.hash, deploymentId: release.deploymentId, reviewedAt: Date.now() };
        if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert('cloudReleaseReviews', value);
        return null;
    },
});

export const request = mutation({
    args: { releaseId: v.id('cloudReleases'), operationKey: v.string(), kind: v.union(v.literal('build'), v.literal('publish'), v.literal('rollback')), expectedLiveReleaseId: v.union(v.id('cloudReleases'), v.null()) },
    handler: async (ctx, args) => {
        const { release, access } = await requireRelease(ctx, args.releaseId, true);
        assertOperationId(args.operationKey);
        const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).unique();
        if (!destination || !destinationEnabled(destination, args.kind)) cloudError('CLOUD_RELEASE_SETUP_REQUIRED');
        if (release.purpose !== 'release' || !release.hash) cloudError('CLOUD_RELEASE_NOT_READY');
        const prior = await ctx.db.query('cloudReleaseOperations').withIndex('by_destinationId_and_operationKey', q => q.eq('destinationId', destination._id).eq('operationKey', args.operationKey)).unique();
        if (prior) {
            if (prior.actorId !== access.user._id || !releaseRequestMatches(prior, { ...args, sourceHash: release.hash })) cloudError('CLOUD_INVALID_OPERATION');
            return prior._id;
        }
        if (destination.lockOperationId) cloudError('CLOUD_RELEASE_BUSY');
        if ((destination.liveReleaseId ?? null) !== args.expectedLiveReleaseId) cloudError('CLOUD_RELEASE_LIVE_CHANGED');
        if (args.kind === 'publish' && (release.baselineReleaseId ?? null) !== (destination.liveReleaseId ?? null)) cloudError('CLOUD_RELEASE_LIVE_CHANGED');
        const operationCount = await ctx.db.query('cloudReleaseOperations').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).take(100);
        if (operationCount.length >= 100) cloudError('CLOUD_RELEASE_OPERATION_LIMIT');
        if (args.kind === 'build') {
            if (release.status !== 'frozen' || destination.remainingBuilds < 1) cloudError('CLOUD_RELEASE_BUILD_LIMIT');
        } else {
            const reviewed = await ctx.db.query('cloudReleaseReviews').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', release._id).eq('actorId', access.user._id)).unique();
            if (release.status !== 'ready' || !release.deploymentId || release.builtDestinationKey !== destination.key || reviewed?.hash !== release.hash || reviewed?.deploymentId !== release.deploymentId) cloudError('CLOUD_RELEASE_REVIEW_REQUIRED');
            if (args.kind === 'rollback') {
                const history = await ctx.db.query('cloudReleaseOperations').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).take(100);
                if (!history.some(op => op.releaseId === release._id && op.kind !== 'build' && op.stage === 'confirmed')) cloudError('CLOUD_RELEASE_ROLLBACK_UNAVAILABLE');
            }
        }
        const nonce = crypto.randomUUID();
        const operationId = await ctx.db.insert('cloudReleaseOperations', { destinationId: destination._id, releaseId: release._id, projectId: release.projectId,
            branchId: release.branchId, actorId: access.user._id, operationKey: args.operationKey, kind: args.kind, stage: 'queued', nonce,
            generation: destination.generation, expectedDeploymentId: destination.liveDeploymentId, targetDeploymentId: release.deploymentId,
            expectedLiveReleaseId: args.expectedLiveReleaseId,
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
        if (!destination || !release || destination.lockOperationId !== op._id || !destinationEnabled(destination, op.kind) || destination.generation !== op.generation || !(await workerAllowed(ctx, op))) return null;
        return { op, destination, release, files: await releaseFiles(ctx, release._id, 'deploy') };
    },
});

export const _beginSend = internalMutation({
    args: { operationId: v.id('cloudReleaseOperations'), nonce: v.string() },
    handler: async (ctx, args) => {
        const op = await ctx.db.get(args.operationId);
        if (!op || op.nonce !== args.nonce || op.stage !== 'queued' || !op.schedulerId) return false;
        const scheduled = await ctx.db.system.get(op.schedulerId);
        const destination = await ctx.db.get(op.destinationId), release = await ctx.db.get(op.releaseId);
        if (scheduled?.state.kind !== 'inProgress' || !destination || !release || !destinationEnabled(destination, op.kind) || destination.lockOperationId !== op._id ||
            destination.generation !== op.generation || release.hash !== op.sourceHash || !(await workerAllowed(ctx, op))) return false;
        await ctx.db.patch(op._id, { stage: 'sending', updatedAt: Date.now() });
        return true;
    },
});

export const _result = internalMutation({
    args: { operationId: v.id('cloudReleaseOperations'), nonce: v.string(), outcome: v.union(v.literal('confirmed'), v.literal('failed'), v.literal('unknown')),
        deploymentId: v.optional(v.string()), deploymentUrl: v.optional(v.string()), error: v.optional(v.string()), drifted: v.optional(v.boolean()), terminalBuildFailure: v.optional(v.boolean()) },
    handler: async (ctx, args) => {
        const op = await ctx.db.get(args.operationId);
        if (!op || op.nonce !== args.nonce || !['queued', 'sending'].includes(op.stage)) return null;
        // Definitive failure is permitted only before the worker acquired send authority.
        const stage = args.outcome === 'failed' && op.stage === 'sending' && !(op.kind === 'build' && args.terminalBuildFailure) ? 'unknown' : args.outcome;
        await ctx.db.patch(op._id, { stage, resultDeploymentId: args.deploymentId, resultUrl: args.deploymentUrl, error: args.error, updatedAt: Date.now() });
        const destination = await ctx.db.get(op.destinationId);
        if (args.drifted && destination) await ctx.db.patch(destination._id, { drifted: true });
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
    args: { ...cloudScope, teamId: v.string(), providerProjectId: v.string(), hostname: v.string(), builds: v.number(), approvedUntil: v.number(), reviewGatewayVerified: v.boolean(), publicAliasVerified: v.boolean() },
    handler: async (ctx, args) => {
        const key = destinationKey(args.teamId, args.providerProjectId, args.hostname);
        if (!Number.isSafeInteger(args.builds) || args.builds < 0 || args.builds > 8 || args.approvedUntil > Date.now() + 7 * 86400_000 || args.approvedUntil <= Date.now()) cloudError('CLOUD_RELEASE_INVALID_ALLOWANCE');
        const existing = await ctx.db.query('cloudReleaseDestinations').withIndex('by_key', q => q.eq('key', key)).unique();
        const branchDestination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
        if (existing?.lockOperationId || (existing && (existing.projectId !== args.projectId || existing.branchId !== args.branchId)) || (branchDestination && branchDestination.key !== key)) cloudError('CLOUD_RELEASE_BUSY');
        const branch = await ctx.db.get(args.branchId);
        if (branch?.projectId !== args.projectId) cloudError('CLOUD_NOT_ENROLLED');
        const value = { projectId: args.projectId, branchId: args.branchId, key, teamId: args.teamId, providerProjectId: args.providerProjectId,
            hostname: args.hostname, generation: (existing?.generation ?? 0) + 1, approvedUntil: args.approvedUntil, remainingBuilds: args.builds,
            reviewGatewayVerified: args.reviewGatewayVerified, publicAliasVerified: args.publicAliasVerified };
        if (existing) await ctx.db.patch(existing._id, value); else await ctx.db.insert('cloudReleaseDestinations', { ...value, drifted: false });
        return null;
    },
});
