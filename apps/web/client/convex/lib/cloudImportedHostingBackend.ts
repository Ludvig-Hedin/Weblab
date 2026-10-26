import { v, type Infer } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { assertImportedPublicationAccess, requireCloudAccess } from '../cloudEditorAccess';
import { importedHostingPrepareArgs, importedHostingSealArgs } from '../cloudReleasesSchema';
import type { ImportedHostingInput } from './cloudImportedHosting';
import { assertOperationId, cloudError, MAX_CLOUD_FILES } from './cloudEditor';
import { MAX_RELEASES } from './cloudReleasePolicy';
import {
    assertReleaseAvailable, assertSnapshotActor, assertSnapshotBudget, assertSnapshotEnvelope, importedMetadata, importedProjectAccess,
    importedReleaseSourceHash, IMPORTED_SNAPSHOT_LIMITS, isImportedRelease, requireImportedSnapshotsEnabled,
    snapshotCanonicalJson, snapshotDocumentBytes, validateImportedSeal, validateSnapshotStage, verifySnapshotStorage,
    type ImportedSnapshotFile,
} from './cloudImportedRelease';
import {
    assertImportedHostingBuildPolicy, assertImportedHostingCandidate, assertImportedHostingSeal,
    hostingHash, hostingId, IMPORTED_HOSTING_CONFIG_PATHS, serializeImportedHostingBuildPolicy,
    type ImportedHostingBuildPolicy, type ImportedHostingCandidate,
} from './cloudImportedHostingState';

const prepareValidator = v.object(importedHostingPrepareArgs), sealValidator = v.object(importedHostingSealArgs);
export type HostingPrepareRequest = Infer<typeof prepareValidator>;
export type HostingSealRequest = Infer<typeof sealValidator>;
export type HostingReceipt = { releaseId: Id<'cloudReleases'>; hash: string };
export type HostingPreparationInput = { kind: 'existing'; receipt: HostingReceipt } | { kind: 'new'; input: ImportedHostingInput };
type Context = QueryCtx | MutationCtx;
type HostingMarkers = Pick<Doc<'cloudReleases'>, 'importedHosting' | 'importedHostingRequest' | 'importedHostingBuildPolicyJson'>;

/** Partial/malformed hosting rows must never fall through into starter provider or backup behavior. */
export function hasImportedHostingFields(row: HostingMarkers): boolean {
    return row.importedHosting !== undefined || row.importedHostingRequest !== undefined || row.importedHostingBuildPolicyJson !== undefined;
}
const invalid = (): never => cloudError('CLOUD_IMPORTED_HOSTING_ARTIFACT_MISMATCH');
function requestReceipt(args: HostingPrepareRequest) {
    return { version: 1 as const, artifactId: args.artifactId, expectedArtifactHash: args.expectedArtifactHash,
        visibility: args.visibility, expectedLiveReleaseId: args.expectedLiveReleaseId };
}
async function currentAccess(ctx: Context, args: HostingPrepareRequest) {
    requireImportedSnapshotsEnabled();
    assertOperationId(args.operationKey);
    if (!hostingHash(args.expectedArtifactHash) || !['protected-only', 'publishable'].includes(args.visibility) ||
        ![args.projectId, args.branchId, args.expectedActorId, args.artifactId].every(hostingId) ||
        (args.expectedLiveReleaseId !== null && !hostingId(args.expectedLiveReleaseId))) invalid();
    const access = await importedProjectAccess(ctx, args);
    assertSnapshotActor(access.user._id, args.expectedActorId);
    if (args.visibility === 'publishable') {
        const publication = await requireCloudAccess(ctx, args);
        assertSnapshotActor(publication.user._id, args.expectedActorId);
        assertImportedPublicationAccess(publication);
    }
    if (access.state.version !== 1 || access.state.profile !== 'imported-next-v1') cloudError('CLOUD_RELEASE_NOT_ALLOWED');
    return access;
}
function parseFacts(artifactJson: string, buildPolicyJson: string): { candidate: ImportedHostingCandidate; policy: ImportedHostingBuildPolicy } {
    if (typeof artifactJson !== 'string' || typeof buildPolicyJson !== 'string' || artifactJson.length > 16_384 || buildPolicyJson.length > 16_384) invalid();
    let candidate: unknown, policy: unknown;
    try { candidate = JSON.parse(artifactJson); policy = JSON.parse(buildPolicyJson); } catch { return invalid(); }
    assertImportedHostingCandidate(candidate); assertImportedHostingBuildPolicy(policy);
    if (serializeImportedHostingBuildPolicy(policy) !== buildPolicyJson) invalid();
    return { candidate, policy };
}
function candidateMatches(candidate: ImportedHostingCandidate, args: HostingPrepareRequest, workspaceId: Id<'workspaces'>): boolean {
    return candidate.projectId === args.projectId && candidate.branchId === args.branchId && candidate.workspaceId === workspaceId &&
        candidate.actorId === args.expectedActorId && candidate.importedHosting.artifactId === args.artifactId &&
        candidate.importedHosting.artifactHash === args.expectedArtifactHash && candidate.importedHosting.visibility === args.visibility;
}
/** Completed retries check current access first, then immutable receipt facts before today's live CAS. */
async function previousReceipt(ctx: Context, args: HostingPrepareRequest, workspaceId: Id<'workspaces'>,
    prepared?: Pick<HostingSealRequest, 'hash' | 'sourceHash' | 'artifactJson' | 'buildPolicyJson'>): Promise<HostingReceipt | null> {
    const row = await ctx.db.query('cloudReleases').withIndex('by_branchId_and_operationKey', q =>
        q.eq('branchId', args.branchId).eq('operationKey', args.operationKey)).unique();
    if (!row) return null;
    assertReleaseAvailable(row);
    if (!hasImportedHostingFields(row) || !row.importedHosting || !row.importedHostingRequest || !row.importedHostingBuildPolicyJson ||
        isImportedRelease(row) || row.purpose !== 'release' || !['frozen', 'building', 'ready', 'error'].includes(row.status) || !hostingHash(row.hash) || !hostingHash(row.sourceHash) ||
        !row.artifactJson || row.projectId !== args.projectId || row.branchId !== args.branchId || row.workspaceId !== workspaceId ||
        row.actorId !== args.expectedActorId || row.studioInputJson !== '' || row.previousArtifactJson !== '' ||
        (row.baselineReleaseId ?? null) !== args.expectedLiveReleaseId ||
        snapshotCanonicalJson(row.importedHostingRequest) !== snapshotCanonicalJson(requestReceipt(args))) cloudError('CLOUD_INVALID_OPERATION');
    const { candidate, policy } = parseFacts(row.artifactJson, row.importedHostingBuildPolicyJson);
    if (!candidateMatches(candidate, args, workspaceId) || candidate.revision !== row.revision ||
        snapshotCanonicalJson(candidate.importedHosting) !== snapshotCanonicalJson(row.importedHosting)) invalid();
    await assertImportedHostingSeal({ candidate, buildPolicyReceipt: policy, artifactJson: row.artifactJson, hash: row.hash });
    const parent = await parentRelease(ctx, args, workspaceId);
    if (parent.revision !== row.revision || parent.sourceHash !== row.sourceHash) invalid();
    if (prepared && (prepared.hash !== row.hash || prepared.sourceHash !== row.sourceHash || prepared.artifactJson !== row.artifactJson ||
        prepared.buildPolicyJson !== row.importedHostingBuildPolicyJson)) cloudError('CLOUD_INVALID_OPERATION');
    return { releaseId: row._id, hash: row.hash };
}
async function freshLimits(ctx: Context, args: HostingPrepareRequest, workspaceId: Id<'workspaces'>): Promise<void> {
    const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
    if (destination && (destination.projectId !== args.projectId || (destination.workspaceId !== undefined && destination.workspaceId !== workspaceId))) invalid();
    if ((destination?.liveReleaseId ?? null) !== args.expectedLiveReleaseId) cloudError('CLOUD_RELEASE_LIVE_CHANGED');
    if (destination?.lockOperationId || destination?.drifted) cloudError('CLOUD_RELEASE_BUSY');
    await assertSnapshotBudget(ctx, { readBytes: MAX_RELEASES * IMPORTED_SNAPSHOT_LIMITS.metadata, readDocs: MAX_RELEASES, readCalls: 1 });
    if ((await ctx.db.query('cloudReleases').withIndex('by_branchId_and_removedAt', q => q.eq('branchId', args.branchId).eq('removedAt', undefined)).take(MAX_RELEASES)).length >= MAX_RELEASES) {
        cloudError('CLOUD_RELEASE_RETENTION_LIMIT');
    }
}
async function parentRelease(ctx: Context, args: HostingPrepareRequest, workspaceId: Id<'workspaces'>) {
    const release = await ctx.db.get(args.artifactId);
    if (release) assertReleaseAvailable(release);
    if (!release || hasImportedHostingFields(release) || !isImportedRelease(release) || release.purpose !== (args.visibility === 'publishable' ? 'release' : 'private-artifact') ||
        release.status !== 'frozen' || release.projectId !== args.projectId || release.branchId !== args.branchId || release.workspaceId !== workspaceId ||
        release.hash !== args.expectedArtifactHash || !hostingHash(release.sourceHash) || !release.artifactJson) return invalid();
    importedMetadata(release);
    snapshotDocumentBytes(release, IMPORTED_SNAPSHOT_LIMITS.metadata);
    return release;
}
function plain(file: ImportedSnapshotFile): ImportedSnapshotFile {
    return { path: file.path, kind: file.kind, hash: file.hash, bytes: file.bytes,
        ...(file.text === undefined ? {} : { text: file.text }), ...(file.storageId === undefined ? {} : { storageId: file.storageId }),
        ...(file.media === undefined ? {} : { media: file.media }) };
}
async function stage(ctx: Context, releaseId: Id<'cloudReleases'>, stage: 'source' | 'original' | 'deploy'): Promise<ImportedSnapshotFile[]> {
    await assertSnapshotBudget(ctx, { readBytes: stage === 'original' ? IMPORTED_SNAPSHOT_LIMITS.originalStage : IMPORTED_SNAPSHOT_LIMITS.sourceStage,
        readDocs: MAX_CLOUD_FILES + 1, readCalls: 1 });
    const rows = await ctx.db.query('cloudReleaseFiles').withIndex('by_releaseId_and_stage', q => q.eq('releaseId', releaseId).eq('stage', stage)).take(MAX_CLOUD_FILES + 1);
    const files = rows.map(plain); await validateSnapshotStage(files, stage); return files;
}
async function retainedStages(ctx: Context, release: Doc<'cloudReleases'>) {
    const source = await stage(ctx, release._id, 'source'), original = await stage(ctx, release._id, 'original');
    const deploy = await stage(ctx, release._id, 'deploy'), metadata = importedMetadata(release);
    if (!release.hash || !release.sourceHash || !release.artifactJson) return invalid();
    await validateImportedSeal(release, { source, original, metadata }, {
        sourceHash: release.sourceHash, hash: release.hash, artifactJson: release.artifactJson, files: deploy,
    });
    return { source, original, metadata, deploy };
}
export async function readImportedHostingInput(ctx: Context, args: HostingPrepareRequest): Promise<HostingPreparationInput> {
    const access = await currentAccess(ctx, args);
    const existing = await previousReceipt(ctx, args, access.workspace._id);
    if (existing) return { kind: 'existing', receipt: existing };
    const release = await parentRelease(ctx, args, access.workspace._id);
    await freshLimits(ctx, args, access.workspace._id);
    const { source, original, metadata } = await retainedStages(ctx, release);
    const result: HostingPreparationInput = { kind: 'new', input: { source, original, metadata, actorId: access.user._id, visibility: args.visibility,
        artifact: { id: release._id, purpose: args.visibility === 'publishable' ? 'release' : 'private-artifact', hash: release.hash!, artifactJson: release.artifactJson!,
            projectId: release.projectId, branchId: release.branchId, workspaceId: release.workspaceId, revision: release.revision } } };
    assertSnapshotEnvelope(result); await assertSnapshotBudget(ctx); return result;
}

/** Immutable facts only. Callers must separately authorize the actor, destination and operation. */
export async function readImportedHostingIdentity(row: Doc<'cloudReleases'>) {
    if (!row.importedHosting || !row.importedHostingRequest || !row.importedHostingBuildPolicyJson ||
        isImportedRelease(row) || row.purpose !== 'release' || !['frozen', 'building', 'ready', 'error'].includes(row.status) ||
        !hostingHash(row.hash) || !hostingHash(row.sourceHash) || !row.artifactJson ||
        row.studioInputJson !== '' || row.previousArtifactJson !== '') return invalid();
    const receipt = row.importedHostingRequest;
    const args: HostingPrepareRequest = { projectId: row.projectId, branchId: row.branchId, expectedActorId: row.actorId,
        artifactId: receipt.artifactId, expectedArtifactHash: receipt.expectedArtifactHash, operationKey: row.operationKey,
        visibility: receipt.visibility, expectedLiveReleaseId: receipt.expectedLiveReleaseId };
    if (receipt.version !== 1 || !['protected-only', 'publishable'].includes(receipt.visibility) ||
        (row.baselineReleaseId ?? null) !== receipt.expectedLiveReleaseId) return invalid();
    const { candidate, policy } = parseFacts(row.artifactJson, row.importedHostingBuildPolicyJson);
    if (!candidateMatches(candidate, args, row.workspaceId) || candidate.revision !== row.revision ||
        snapshotCanonicalJson(candidate.importedHosting) !== snapshotCanonicalJson(row.importedHosting)) return invalid();
    await assertImportedHostingSeal({ candidate, buildPolicyReceipt: policy, artifactJson: row.artifactJson, hash: row.hash });
    return { candidate, policy, args };
}
export async function readImportedHostingExecution(ctx: Context, row: Doc<'cloudReleases'>) {
    assertReleaseAvailable(row);
    const { candidate, policy, args } = await readImportedHostingIdentity(row);
    const parent = await parentRelease(ctx, args, row.workspaceId);
    if (parent.revision !== row.revision || parent.sourceHash !== row.sourceHash) return invalid();
    const files = await stage(ctx, row._id, 'deploy');
    if (await importedReleaseSourceHash(files) !== candidate.importedHosting.deployHash) return invalid();
    const retained = await stage(ctx, parent._id, 'deploy');
    if (fileIdentity(files) !== fileIdentity(retained)) return invalid();
    const configs = files.filter(file => (IMPORTED_HOSTING_CONFIG_PATHS as readonly string[]).includes(file.path))
        .map(({ path, hash, bytes }) => ({ path, hash, bytes })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (snapshotCanonicalJson(configs) !== snapshotCanonicalJson(policy.configs)) return invalid();
    await verifySnapshotStorage(ctx, files);
    await assertSnapshotBudget(ctx);
    return { candidate, buildPolicyReceipt: policy, deployFiles: files };
}
function fileIdentity(files: readonly ImportedSnapshotFile[]): string {
    return snapshotCanonicalJson([...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(plain));
}
/** One atomic mutation, called only after the Node planner and actual binary checks succeed. */
export async function sealImportedHosting(ctx: MutationCtx, args: HostingSealRequest): Promise<HostingReceipt> {
    const access = await currentAccess(ctx, args);
    assertSnapshotEnvelope(args, IMPORTED_SNAPSHOT_LIMITS.sealArgs);
    const existing = await previousReceipt(ctx, args, access.workspace._id, args);
    if (existing) return existing;
    const release = await parentRelease(ctx, args, access.workspace._id);
    await freshLimits(ctx, args, access.workspace._id);
    const stages = await retainedStages(ctx, release);
    await validateSnapshotStage(args.files, 'deploy');
    if (fileIdentity(args.files) !== fileIdentity(stages.deploy) || args.sourceHash !== release.sourceHash) invalid();
    const { candidate, policy } = parseFacts(args.artifactJson, args.buildPolicyJson);
    if (!candidateMatches(candidate, args, access.workspace._id) || candidate.revision !== release.revision ||
        candidate.importedHosting.deployHash !== await importedReleaseSourceHash(stages.deploy)) invalid();
    await assertImportedHostingSeal({ candidate, buildPolicyReceipt: policy, artifactJson: args.artifactJson, hash: args.hash });
    const configs = stages.deploy.filter(file => (IMPORTED_HOSTING_CONFIG_PATHS as readonly string[]).includes(file.path))
        .map(({ path, hash, bytes }) => ({ path, hash, bytes })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (snapshotCanonicalJson(configs) !== snapshotCanonicalJson(policy.configs)) invalid();
    await verifySnapshotStorage(ctx, stages.deploy);
    const storageIds = [...new Set(args.files.flatMap(file => file.storageId ? [file.storageId] : []))];
    const row = {
        projectId: args.projectId, branchId: args.branchId, workspaceId: access.workspace._id, actorId: access.user._id,
        operationKey: args.operationKey, revision: release.revision, purpose: 'release' as const, status: 'frozen' as const,
        studioInputJson: '', previousArtifactJson: '', ...(args.expectedLiveReleaseId === null ? {} : { baselineReleaseId: args.expectedLiveReleaseId }),
        sourceHash: args.sourceHash, hash: args.hash, artifactJson: args.artifactJson,
        importedHosting: { ...candidate.importedHosting, artifactId: args.artifactId },
        importedHostingRequest: requestReceipt(args), importedHostingBuildPolicyJson: args.buildPolicyJson, createdAt: Date.now(),
    };
    let writeBytes = snapshotDocumentBytes(row, IMPORTED_SNAPSHOT_LIMITS.metadata);
    for (const file of args.files) writeBytes += snapshotDocumentBytes({ releaseId: 'x'.repeat(128), stage: 'deploy', ...file });
    for (const storageId of storageIds) writeBytes += snapshotDocumentBytes({ releaseId: 'x'.repeat(128), storageId });
    await assertSnapshotBudget(ctx, { writeBytes, writeDocs: 1 + args.files.length + storageIds.length });
    const releaseId = await ctx.db.insert('cloudReleases', row);
    for (const file of args.files) await ctx.db.insert('cloudReleaseFiles', { releaseId, stage: 'deploy', ...file });
    for (const storageId of storageIds) await ctx.db.insert('cloudReleaseAssets', { releaseId, storageId });
    await assertSnapshotBudget(ctx);
    return { releaseId, hash: args.hash };
}
