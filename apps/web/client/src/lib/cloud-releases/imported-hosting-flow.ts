import { ConvexError } from 'convex/values';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import type { Id } from '@convex/_generated/dataModel';
import type { cloudReleaseApi } from './api';
import type { ReleaseSession } from './session';

type Args<K extends keyof typeof cloudReleaseApi> = FunctionArgs<(typeof cloudReleaseApi)[K]>;
type Result<K extends keyof typeof cloudReleaseApi> = FunctionReturnType<(typeof cloudReleaseApi)[K]>;
type Capture = Args<'capture'> & { expectedActorId: Id<'users'> } & ({ purpose: 'private-artifact'; publicationIntent?: never } | { purpose: 'release'; publicationIntent: 'eligible-public-version' });
type Candidate = Args<'prepareHosting'>;
export type PrivateBuildIntent = Args<'request'> & { kind: 'build'; expectedActorId: Id<'users'> };
export type ImportedHostingOwner = Readonly<{ workspaceId: Id<'workspaces'>; projectId: Id<'projects'>; branchId: Id<'branches'>;
    actorId: Id<'users'>; clerkUserId: string; backend: string }>;
type Receipt = { releaseId: Id<'cloudReleases'>; hash: string };
export type ImportedPreparation = Readonly<{ version: 1 | 2; owner: ImportedHostingOwner; id: string;
    stage: 'capture' | 'artifact' | 'saved' | 'candidate' | 'complete' | 'refused' | 'removed';
    capture: Capture | null; artifactId: Id<'cloudReleases'> | null; artifactHash: string | null;
    candidateRequest: Candidate | null; candidate: Receipt | null }>;
export type ImportedBuild = Readonly<{ version: 1; owner: ImportedHostingOwner; candidateHash: string;
    request: PrivateBuildIntent; operationId: Id<'cloudReleaseOperations'> | null; stage: 'pending' | 'acknowledged' | 'terminal' }>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type PublicationRecovery = { recoveryRequest: NonNullable<Args<'status'>['recoveryRequest']> };
export type ImportedHostingIO = { storage: Storage; owner: ImportedHostingOwner; session: Pick<ReleaseSession, 'guard'>;
    status: (recovery?: PublicationRecovery) => Promise<Result<'status'>>; capture: (args: Capture) => Promise<Result<'capture'>>;
    prepare: (args: Args<'prepare'>) => Promise<Result<'prepare'>>;
    prepareHosting: (args: Candidate) => Promise<Result<'prepareHosting'>>;
    request: (args: PrivateBuildIntent | ImportedPublicationSwitch) => Promise<Result<'request'>>;
    review?: (args: ImportedReviewRequest) => Promise<Result<'review'>> };
const failed = (): never => { throw new Error('CLOUD_HOSTING_RECOVERY_UNAVAILABLE'); };
const changed = (): never => { throw new Error('CLOUD_HOSTING_PREVIOUS_REQUEST'); };
const hash = (value: unknown): value is string => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[^a-zA-Z0-9_.:-]/.test(value);
const key = (value: unknown): value is string => typeof value === 'string' && value.length >= 16 && value.length <= 128 && !/[^a-zA-Z0-9-]/.test(value);
function exact(value: unknown, fields: string[]): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...fields].sort().join();
}
function ownerValid(value: unknown): value is ImportedHostingOwner {
    return exact(value, ['workspaceId', 'projectId', 'branchId', 'actorId', 'clerkUserId', 'backend']) &&
        [value.workspaceId, value.projectId, value.branchId, value.actorId, value.clerkUserId].every(id) &&
        typeof value.backend === 'string' && value.backend.length <= 512 && !/\s/.test(value.backend) && /^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(value.backend);
}
const sameOwner = (a: ImportedHostingOwner, b: ImportedHostingOwner) => Object.keys(a).every(name => a[name as keyof ImportedHostingOwner] === b[name as keyof ImportedHostingOwner]);
function prefix(owner: ImportedHostingOwner) {
    if (!ownerValid(owner)) return failed();
    return `weblab.imported-hosting.v1/${[owner.backend, owner.workspaceId, owner.projectId, owner.branchId, owner.clerkUserId, owner.actorId].map(encodeURIComponent).join('/')}`;
}
function immutable<T>(value: T): T {
    const copy = structuredClone(value);
    const freeze = (item: unknown) => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } };
    freeze(copy); return copy;
}
function raw(storage: Storage, at: string): string | null {
    try { const text = storage.getItem(at); if (text !== null && text.length > 12_000) return failed(); return text; } catch { return failed(); }
}
function decoded(text: string): unknown { try { return JSON.parse(text); } catch { return failed(); } }
function captureValid(value: unknown, owner: ImportedHostingOwner, version: 1 | 2): value is Capture {
    return exact(value, ['projectId', 'branchId', 'expectedActorId', 'expectedRevision', 'operationKey', 'purpose', ...(version === 2 ? ['publicationIntent'] : [])]) &&
        value.projectId === owner.projectId && value.branchId === owner.branchId && value.expectedActorId === owner.actorId &&
        (version === 1 ? value.purpose === 'private-artifact' : value.purpose === 'release' && value.publicationIntent === 'eligible-public-version') && key(value.operationKey) && Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) >= 1;
}
function candidateValid(value: unknown, owner: ImportedHostingOwner, version: 1 | 2): value is Candidate {
    return exact(value, ['projectId', 'branchId', 'expectedActorId', 'artifactId', 'expectedArtifactHash', 'operationKey', 'visibility', 'expectedLiveReleaseId']) &&
        value.projectId === owner.projectId && value.branchId === owner.branchId && value.expectedActorId === owner.actorId &&
        id(value.artifactId) && hash(value.expectedArtifactHash) && key(value.operationKey) && value.visibility === (version === 1 ? 'protected-only' : 'publishable') &&
        (value.expectedLiveReleaseId === null || id(value.expectedLiveReleaseId));
}
export function readImportedPreparation(storage: Storage, owner: ImportedHostingOwner): ImportedPreparation | null {
    const text = raw(storage, `${prefix(owner)}/preparation`); if (text === null) return null;
    const record = decoded(text);
    if (!exact(record, ['version', 'owner', 'id', 'stage', 'capture', 'artifactId', 'artifactHash', 'candidateRequest', 'candidate']) || (record.version !== 1 && record.version !== 2) ||
        !ownerValid(record.owner) || !sameOwner(record.owner, owner) || !key(record.id) ||
        !['capture', 'artifact', 'saved', 'candidate', 'complete', 'refused', 'removed'].includes(String(record.stage)) ||
        (record.capture !== null && !captureValid(record.capture, owner, record.version)) || (record.artifactId !== null && !id(record.artifactId)) ||
        (record.artifactHash !== null && !hash(record.artifactHash)) || (record.candidateRequest !== null && !candidateValid(record.candidateRequest, owner, record.version)) ||
        (record.candidate !== null && (!exact(record.candidate, ['releaseId', 'hash']) || !id(record.candidate.releaseId) || !hash(record.candidate.hash)))) return failed();
    if ((record.stage === 'capture' || record.stage === 'refused') && (!record.capture || record.artifactId !== null || record.artifactHash !== null || record.candidateRequest !== null || record.candidate !== null)) return failed();
    if (['artifact', 'saved', 'candidate', 'complete'].includes(String(record.stage)) && !record.artifactId) return failed();
    if (record.stage === 'artifact' && (record.artifactHash !== null || record.candidateRequest !== null || record.candidate !== null)) return failed();
    if (record.stage === 'removed' && ((!record.capture && !record.artifactId) || record.artifactHash !== null || record.candidateRequest !== null || record.candidate !== null)) return failed();
    if (['saved', 'candidate', 'complete'].includes(String(record.stage)) && !record.artifactHash) return failed();
    if (record.stage === 'saved' && (record.candidateRequest !== null || record.candidate !== null)) return failed();
    if (['candidate', 'complete'].includes(String(record.stage)) && (!record.candidateRequest || record.candidateRequest.artifactId !== record.artifactId || record.candidateRequest.expectedArtifactHash !== record.artifactHash)) return failed();
    if (record.stage === 'candidate' && record.candidate !== null || record.stage === 'complete' && record.candidate === null) return failed();
    return immutable(record as unknown as ImportedPreparation);
}
export function preparationPending(record: ImportedPreparation | null) { return !!record && ['capture', 'artifact', 'candidate'].includes(record.stage); }
function persist<T>(storage: Storage, at: string, before: T | null, after: T): T {
    try {
        const previous = raw(storage, at);
        if (previous !== (before === null ? null : JSON.stringify(before))) return changed();
        const text = JSON.stringify(after); if (text.length > 12_000) return failed();
        storage.setItem(at, text); if (storage.getItem(at) !== text) return failed();
        return immutable(after);
    } catch (error) { if (String(error).includes('PREVIOUS_REQUEST')) throw error; return failed(); }
}
function savePreparation(io: ImportedHostingIO, before: ImportedPreparation | null, record: ImportedPreparation) {
    io.session.guard(); return persist(io.storage, `${prefix(io.owner)}/preparation`, before, record);
}
async function current(io: ImportedHostingIO, recovery?: PublicationRecovery) {
    io.session.guard(); const status = await io.status(recovery); io.session.guard();
    if (status.actorId !== io.owner.actorId || status.workspaceId !== io.owner.workspaceId || status.profile !== 'imported-next-v1') throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
    return status;
}
const typed = (error: unknown, code: string) => error instanceof ConvexError && error.data === code;
/** Explicit source capture or row-level finish. Neither starts candidate preparation or a build. */
export function saveImportedReviewSource(input: ImportedHostingIO, revision: number, artifactId?: Id<'cloudReleases'>) {
    return saveImportedSource(input, revision, artifactId, 1);
}
export function saveImportedPublicationSource(input: ImportedHostingIO, revision: number, artifactId?: Id<'cloudReleases'>) {
    return saveImportedSource(input, revision, artifactId, 2);
}
async function saveImportedSource(input: ImportedHostingIO, revision: number, artifactId: Id<'cloudReleases'> | undefined, version: 1 | 2) {
    const io = { ...input, owner: immutable(input.owner) }; io.session.guard();
    const old = readImportedPreparation(io.storage, io.owner); if (preparationPending(old)) return changed();
    const status = await current(io);
    if (artifactId ? !status.releases.some(row => row.id === artifactId && (version === 1 ? !row.publicationSource && row.canFinishPreparing : row.publicationSource && row.canFinishPublicationPreparing) && !row.removal) : !(version === 1 ? status.canFreezePrivateArtifact : status.canSavePublicationVersion) || status.revision !== revision) throw new Error('CLOUD_CONFLICT');
    const record: ImportedPreparation = { version, owner: io.owner, id: crypto.randomUUID(), stage: artifactId ? 'artifact' : 'capture',
        capture: artifactId ? null : { projectId: io.owner.projectId, branchId: io.owner.branchId, expectedActorId: io.owner.actorId, expectedRevision: revision, operationKey: crypto.randomUUID(), ...(version === 1 ? { purpose: 'private-artifact' as const } : { purpose: 'release' as const, publicationIntent: 'eligible-public-version' as const }) },
        artifactId: artifactId ?? null, artifactHash: null, candidateRequest: null, candidate: null };
    savePreparation(io, old, record); return resumeImportedPreparation(io);
}
/** Explicit reconciliation retries only the persisted stage and request. Node errors never retire an uncertain invocation. */
export async function resumeImportedPreparation(input: ImportedHostingIO): Promise<ImportedPreparation> {
    const io = { ...input, owner: immutable(input.owner) };
    let record = readImportedPreparation(io.storage, io.owner); if (!record) return changed();
    await current(io);
    if (record.stage === 'capture') {
        try {
            io.session.guard(); const artifactId = await io.capture(immutable(record.capture!)); io.session.guard();
            if (!id(artifactId)) return failed();
            record = savePreparation(io, record, { ...record, stage: 'artifact', artifactId });
        } catch (error) {
            io.session.guard();
            if (typed(error, 'CLOUD_CONFLICT')) return savePreparation(io, record, { ...record, stage: 'refused' });
            if (typed(error, 'CLOUD_RELEASE_REMOVED')) return savePreparation(io, record, { ...record, stage: 'removed' });
            throw error;
        }
    }
    if (record.stage === 'artifact') {
        await current(io); io.session.guard();
        try {
            const receipt = await io.prepare({ releaseId: record.artifactId!, expectedActorId: io.owner.actorId }); io.session.guard();
            if (receipt.releaseId !== record.artifactId || !hash(receipt.hash)) return failed();
            record = savePreparation(io, record, { ...record, stage: 'saved', artifactHash: receipt.hash });
        } catch (error) {
            io.session.guard();
            if (typed(error, 'CLOUD_RELEASE_REMOVED')) return savePreparation(io, record, { ...record, stage: 'removed' });
            throw error;
        }
    }
    if (record.stage === 'candidate') {
        await current(io); io.session.guard();
        try {
            const receipt = await io.prepareHosting(immutable(record.candidateRequest!)); io.session.guard();
            if (!id(receipt.releaseId) || !hash(receipt.hash)) return failed();
            record = savePreparation(io, record, { ...record, stage: 'complete', candidate: { ...receipt } });
        } catch (error) { io.session.guard(); throw error; }
    }
    return record;
}
/** Another explicit click pins this immutable artifact and today's live baseline. */
export function prepareImportedPrivateReview(input: ImportedHostingIO, artifact: Receipt, expectedLiveReleaseId: Id<'cloudReleases'> | null) {
    return prepareImportedReview(input, artifact, expectedLiveReleaseId, 1);
}
export function prepareImportedPublicationReview(input: ImportedHostingIO, artifact: Receipt, expectedLiveReleaseId: Id<'cloudReleases'> | null) {
    return prepareImportedReview(input, artifact, expectedLiveReleaseId, 2);
}
async function prepareImportedReview(input: ImportedHostingIO, artifact: Receipt, expectedLiveReleaseId: Id<'cloudReleases'> | null, version: 1 | 2) {
    const io = { ...input, owner: immutable(input.owner) }, selected = immutable(artifact); io.session.guard();
    const old = readImportedPreparation(io.storage, io.owner); if (preparationPending(old)) return changed();
    const status = await current(io);
    if (status.liveReleaseId !== expectedLiveReleaseId || !status.releases.some(row => row.id === selected.releaseId && row.hash === selected.hash && (version === 1 ? !row.publicationSource && row.canPreparePrivateReview : row.publicationSource && row.canPreparePublicationReview) && !row.removal)) throw new Error('CLOUD_RELEASE_CHANGED');
    const candidateRequest: Candidate = { projectId: io.owner.projectId, branchId: io.owner.branchId, expectedActorId: io.owner.actorId,
        artifactId: selected.releaseId, expectedArtifactHash: selected.hash, operationKey: crypto.randomUUID(), visibility: version === 1 ? 'protected-only' : 'publishable', expectedLiveReleaseId };
    const record: ImportedPreparation = { version, owner: io.owner, id: crypto.randomUUID(), stage: 'candidate', capture: null,
        artifactId: selected.releaseId, artifactHash: selected.hash, candidateRequest, candidate: null };
    savePreparation(io, old, record); return resumeImportedPreparation(io);
}
function buildAt(owner: ImportedHostingOwner, releaseId: string) { if (!id(releaseId)) return failed(); return `${prefix(owner)}/build/${encodeURIComponent(releaseId)}`; }
export function readImportedBuild(storage: Storage, owner: ImportedHostingOwner, releaseId: Id<'cloudReleases'>): ImportedBuild | null {
    const text = raw(storage, buildAt(owner, releaseId)); if (text === null) return null;
    const value = decoded(text);
    if (!exact(value, ['version', 'owner', 'candidateHash', 'request', 'operationId', 'stage']) || value.version !== 1 || !ownerValid(value.owner) || !sameOwner(value.owner, owner) ||
        !hash(value.candidateHash) || !['pending', 'acknowledged', 'terminal'].includes(String(value.stage)) ||
        !exact(value.request, ['releaseId', 'expectedActorId', 'operationKey', 'expectedLiveReleaseId', 'kind']) || value.request.releaseId !== releaseId || value.request.expectedActorId !== owner.actorId || value.request.kind !== 'build' ||
        !key(value.request.operationKey) || (value.request.expectedLiveReleaseId !== null && !id(value.request.expectedLiveReleaseId)) ||
        (value.stage === 'pending' ? value.operationId !== null : !id(value.operationId))) return failed();
    return immutable(value as unknown as ImportedBuild);
}
export function privateBuildIntent(owner: ImportedHostingOwner, releaseId: Id<'cloudReleases'>, expectedLiveReleaseId: Id<'cloudReleases'> | null): PrivateBuildIntent {
    if (!ownerValid(owner) || !id(releaseId) || expectedLiveReleaseId !== null && !id(expectedLiveReleaseId)) return failed();
    return immutable({ releaseId, kind: 'build', expectedActorId: owner.actorId, expectedLiveReleaseId, operationKey: crypto.randomUUID() });
}
/** Only called after the user confirms a fresh build. Existing saved requests require explicit reconciliation. */
export async function requestImportedPrivateBuild(input: ImportedHostingIO, request: PrivateBuildIntent, candidateHash: string) {
    const io = { ...input, owner: immutable(input.owner) }, intent = immutable(request);
    if (readImportedBuild(io.storage, io.owner, intent.releaseId)) return changed();
    const status = await current(io);
    if (!hash(candidateHash) || intent.expectedActorId !== io.owner.actorId || status.liveReleaseId !== intent.expectedLiveReleaseId ||
        !status.canBuildPrivateReview || !status.releases.some(row => row.id === intent.releaseId && row.hash === candidateHash && row.canBuildPrivateReview && !row.removal)) throw new Error('CLOUD_RELEASE_CHANGED');
    const record: ImportedBuild = { version: 1, owner: io.owner, candidateHash, request: intent, operationId: null, stage: 'pending' };
    io.session.guard(); persist(io.storage, buildAt(io.owner, intent.releaseId), null, record);
    return reconcileImportedPrivateBuild(io, intent.releaseId);
}
/** An exact observed operation or original request replay acknowledges admission, never another spend. */
export async function reconcileImportedPrivateBuild(input: ImportedHostingIO, releaseId: Id<'cloudReleases'>): Promise<ImportedBuild> {
    const io = { ...input, owner: immutable(input.owner) };
    const record = readImportedBuild(io.storage, io.owner, releaseId); if (!record) return changed();
    const status = await current(io);
    const op = status.operations.find(op => op.operationKey === record.request.operationKey && op.actorId === io.owner.actorId &&
        op.releaseId === releaseId && op.kind === 'build' && op.expectedLiveReleaseId === record.request.expectedLiveReleaseId);
    if (op) {
        if (record.operationId !== null && record.operationId !== op.id) return failed();
        io.session.guard();
        return persist(io.storage, buildAt(io.owner, releaseId), record, { ...record, operationId: op.id, stage: op.stage === 'confirmed' || op.stage === 'failed' ? 'terminal' : 'acknowledged' });
    }
    if (record.stage !== 'pending') return record; // Missing bounded projection is not terminal evidence.
    io.session.guard(); const operationId = await io.request(immutable(record.request)); io.session.guard();
    if (!id(operationId)) return failed();
    return persist(io.storage, buildAt(io.owner, releaseId), record, { ...record, operationId, stage: 'acknowledged' });
}

export type ImportedReviewRequest = Args<'review'> & { expectedActorId: Id<'users'>; expectedDeploymentId: string };
export type ImportedPublicationSwitch = Args<'request'> & { kind: 'publish' | 'rollback'; expectedActorId: Id<'users'>;
    expectedHash: string; expectedTargetDeploymentId: string };
export type ImportedPublicationIntent = Readonly<{ action: 'review'; request: ImportedReviewRequest } |
    { action: 'publish' | 'rollback'; request: ImportedPublicationSwitch }>;
export type ImportedPublication = Readonly<{ version: 1; owner: ImportedHostingOwner; intent: ImportedPublicationIntent;
    operationId: Id<'cloudReleaseOperations'> | null; stage: 'pending' | 'acknowledged' | 'terminal'; outcome: 'confirmed' | 'failed' | 'refused' | 'removed' | null }>;
function publicationAt(owner: ImportedHostingOwner) { return `${prefix(owner)}/publication`; }
function publicationIntentValid(value: unknown, owner: ImportedHostingOwner): value is ImportedPublicationIntent {
    if (!exact(value, ['action', 'request'])) return false;
    const request = value.request;
    if (value.action === 'review') return exact(request, ['releaseId', 'hash', 'expectedActorId', 'expectedDeploymentId']) &&
        id(request.releaseId) && hash(request.hash) && request.expectedActorId === owner.actorId && id(request.expectedDeploymentId);
    return (value.action === 'publish' || value.action === 'rollback') &&
        exact(request, ['releaseId', 'kind', 'operationKey', 'expectedActorId', 'expectedLiveReleaseId', 'expectedHash', 'expectedTargetDeploymentId']) &&
        id(request.releaseId) && request.kind === value.action && key(request.operationKey) && request.expectedActorId === owner.actorId &&
        (request.expectedLiveReleaseId === null || id(request.expectedLiveReleaseId)) && hash(request.expectedHash) && id(request.expectedTargetDeploymentId);
}
export function readImportedPublication(storage: Storage, owner: ImportedHostingOwner): ImportedPublication | null {
    const text = raw(storage, publicationAt(owner)); if (text === null) return null;
    const value = decoded(text);
    if (!exact(value, ['version', 'owner', 'intent', 'operationId', 'stage', 'outcome']) || value.version !== 1 ||
        !ownerValid(value.owner) || !sameOwner(value.owner, owner) || !publicationIntentValid(value.intent, owner) ||
        !['pending', 'acknowledged', 'terminal'].includes(String(value.stage)) ||
        (value.operationId !== null && !id(value.operationId)) ||
        (value.stage === 'terminal' ? !['confirmed', 'failed', 'refused', 'removed'].includes(String(value.outcome)) : value.outcome !== null) ||
        (value.stage === 'pending' && value.operationId !== null) ||
        (value.intent.action === 'review' ? value.operationId !== null || value.stage === 'acknowledged' || (value.stage === 'terminal' && value.outcome !== 'confirmed' && value.outcome !== 'removed') :
            (value.stage === 'acknowledged' || (value.stage === 'terminal' && (value.outcome === 'confirmed' || value.outcome === 'failed'))) && value.operationId === null) ||
        ((value.outcome === 'refused' || value.outcome === 'removed') && value.operationId !== null)) return failed();
    return immutable(value as unknown as ImportedPublication);
}
export function publicationPending(record: ImportedPublication | null) { return !!record && record.stage !== 'terminal'; }
export function importedReviewIntent(owner: ImportedHostingOwner, releaseId: Id<'cloudReleases'>, candidateHash: string, deploymentId: string): ImportedPublicationIntent {
    const intent = { action: 'review' as const, request: { releaseId, hash: candidateHash, expectedActorId: owner.actorId, expectedDeploymentId: deploymentId } };
    if (!ownerValid(owner) || !publicationIntentValid(intent, owner)) return failed(); return immutable(intent);
}
export function importedPublicationIntent(owner: ImportedHostingOwner, releaseId: Id<'cloudReleases'>, candidateHash: string, deploymentId: string,
    kind: 'publish' | 'rollback', expectedLiveReleaseId: Id<'cloudReleases'> | null): ImportedPublicationIntent {
    const intent = { action: kind, request: { releaseId, kind, expectedActorId: owner.actorId, expectedHash: candidateHash,
        expectedTargetDeploymentId: deploymentId, expectedLiveReleaseId, operationKey: crypto.randomUUID() } };
    if (!ownerValid(owner) || !publicationIntentValid(intent, owner)) return failed(); return immutable(intent);
}
function savePublication(io: ImportedHostingIO, before: ImportedPublication | null, record: ImportedPublication) {
    io.session.guard(); return persist(io.storage, publicationAt(io.owner), before, record);
}
/** A fresh explicit acknowledgment or confirmed live switch. Never resumes or replaces unresolved work implicitly. */
export async function requestImportedPublication(input: ImportedHostingIO, selected: ImportedPublicationIntent) {
    const io = { ...input, owner: immutable(input.owner) }, intent = immutable(selected);
    io.session.guard(); if (!publicationIntentValid(intent, io.owner)) return failed();
    const old = readImportedPublication(io.storage, io.owner); if (publicationPending(old)) return changed();
    const status = await current(io), row = status.releases.find(row => row.id === intent.request.releaseId);
    const expectedHash = intent.action === 'review' ? intent.request.hash : intent.request.expectedHash;
    const target = intent.action === 'review' ? intent.request.expectedDeploymentId : intent.request.expectedTargetDeploymentId;
    if (!row || row.removal || row.visibility !== 'publishable' || row.hash !== expectedHash || row.deploymentId !== target ||
        (intent.action === 'review' ? !row.canAcknowledge : status.liveReleaseId !== intent.request.expectedLiveReleaseId ||
            !(intent.action === 'publish' ? row.canPublish : row.canRollback))) throw new Error('CLOUD_RELEASE_CHANGED');
    savePublication(io, old, { version: 1, owner: io.owner, intent, operationId: null, stage: 'pending', outcome: null });
    return reconcileImportedPublication(io);
}
/** Explicit original-request reconciliation. Missing list rows and current capability refusals never prove completion. */
export async function reconcileImportedPublication(input: ImportedHostingIO): Promise<ImportedPublication> {
    const io = { ...input, owner: immutable(input.owner) }, record = readImportedPublication(io.storage, io.owner);
    if (!record) return changed();
    const recovery: PublicationRecovery | undefined = record.intent.action !== 'review' ? { recoveryRequest: {
        ...(record.operationId !== null ? { operationId: record.operationId } : {}), operationKey: record.intent.request.operationKey,
        releaseId: record.intent.request.releaseId, kind: record.intent.request.kind, expectedHash: record.intent.request.expectedHash,
        expectedTargetDeploymentId: record.intent.request.expectedTargetDeploymentId, expectedLiveReleaseId: record.intent.request.expectedLiveReleaseId,
    } } : undefined;
    const status = await current(io, recovery); if (record.stage === 'terminal') return record;
    const intent = record.intent;
    if (intent.action === 'review') {
        const reviewed = status.releases.some(row => row.id === intent.request.releaseId && row.visibility === 'publishable' && !row.removal &&
            row.hash === intent.request.hash && row.deploymentId === intent.request.expectedDeploymentId && row.reviewed);
        if (!reviewed) {
            if (!io.review) return failed();
            try {
                io.session.guard(); await io.review(immutable(intent.request)); io.session.guard();
            } catch (error) {
                io.session.guard();
                if (typed(error, 'CLOUD_RELEASE_REMOVED')) return savePublication(io, record, { ...record, stage: 'terminal', outcome: 'removed' });
                throw error;
            }
        }
        return savePublication(io, record, { ...record, stage: 'terminal', outcome: 'confirmed' });
    }
    const request = intent.request;
    const candidates = recovery && status.recoveryOperation ? [status.recoveryOperation, ...status.operations] : status.operations;
    const op = candidates.find(op => (record.operationId === null || op.id === record.operationId) && op.operationKey === request.operationKey && op.actorId === io.owner.actorId &&
        op.releaseId === request.releaseId && op.kind === request.kind && op.expectedLiveReleaseId === request.expectedLiveReleaseId &&
        op.sourceHash === request.expectedHash && op.targetDeploymentId === request.expectedTargetDeploymentId);
    if (op) {
        if (record.operationId !== null && record.operationId !== op.id) return failed();
        const terminal = op.stage === 'failed' || op.stage === 'confirmed' && op.resultDeploymentId === request.expectedTargetDeploymentId;
        return savePublication(io, record, { ...record, operationId: op.id, stage: terminal ? 'terminal' : 'acknowledged',
            outcome: terminal ? op.stage === 'failed' ? 'failed' : 'confirmed' : null });
    }
    const removed = status.recoveryRemoval;
    if (record.operationId === null && !status.recoveryOperation && removed?.state === 'removed' && removed.releaseId === request.releaseId && removed.hash === request.expectedHash &&
        Number.isSafeInteger(removed.completedAt) && removed.completedAt > 0) {
        return savePublication(io, record, { ...record, stage: 'terminal', outcome: 'removed' });
    }
    if (record.stage !== 'pending') return record;
    try {
        io.session.guard(); const operationId = await io.request(immutable(request)); io.session.guard();
        if (!id(operationId)) return failed();
        return savePublication(io, record, { ...record, operationId, stage: 'acknowledged' });
    } catch (error) {
        io.session.guard();
        // The synchronous mutation checks its original receipt before fresh live CAS.
        if (typed(error, 'CLOUD_RELEASE_LIVE_CHANGED')) return savePublication(io, record, { ...record, stage: 'terminal', outcome: 'refused' });
        throw error;
    }
}
