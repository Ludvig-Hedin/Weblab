import { ConvexError } from 'convex/values';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import type { Id } from '@convex/_generated/dataModel';
import type { cloudReleaseApi } from './api';
import type { ReleaseSession } from './session';

type Args<K extends keyof typeof cloudReleaseApi> = FunctionArgs<(typeof cloudReleaseApi)[K]>;
type Result<K extends keyof typeof cloudReleaseApi> = FunctionReturnType<(typeof cloudReleaseApi)[K]>;
type Capture = Args<'capture'> & { purpose: 'private-artifact'; expectedActorId: Id<'users'> };
type Candidate = Args<'prepareHosting'>;
export type PrivateBuildIntent = Args<'request'> & { kind: 'build'; expectedActorId: Id<'users'> };
export type ImportedHostingOwner = Readonly<{ workspaceId: Id<'workspaces'>; projectId: Id<'projects'>; branchId: Id<'branches'>;
    actorId: Id<'users'>; clerkUserId: string; backend: string }>;
type Receipt = { releaseId: Id<'cloudReleases'>; hash: string };
export type ImportedPreparation = Readonly<{ version: 1; owner: ImportedHostingOwner; id: string;
    stage: 'capture' | 'artifact' | 'saved' | 'candidate' | 'complete' | 'refused' | 'removed';
    capture: Capture | null; artifactId: Id<'cloudReleases'> | null; artifactHash: string | null;
    candidateRequest: Candidate | null; candidate: Receipt | null }>;
export type ImportedBuild = Readonly<{ version: 1; owner: ImportedHostingOwner; candidateHash: string;
    request: PrivateBuildIntent; operationId: Id<'cloudReleaseOperations'> | null; stage: 'pending' | 'acknowledged' | 'terminal' }>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type ImportedHostingIO = { storage: Storage; owner: ImportedHostingOwner; session: Pick<ReleaseSession, 'guard'>;
    status: () => Promise<Result<'status'>>; capture: (args: Capture) => Promise<Result<'capture'>>;
    prepare: (args: Args<'prepare'>) => Promise<Result<'prepare'>>;
    prepareHosting: (args: Candidate) => Promise<Result<'prepareHosting'>>;
    request: (args: PrivateBuildIntent) => Promise<Result<'request'>> };
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
function captureValid(value: unknown, owner: ImportedHostingOwner): value is Capture {
    return exact(value, ['projectId', 'branchId', 'expectedActorId', 'expectedRevision', 'operationKey', 'purpose']) &&
        value.projectId === owner.projectId && value.branchId === owner.branchId && value.expectedActorId === owner.actorId &&
        value.purpose === 'private-artifact' && key(value.operationKey) && Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) >= 1;
}
function candidateValid(value: unknown, owner: ImportedHostingOwner): value is Candidate {
    return exact(value, ['projectId', 'branchId', 'expectedActorId', 'artifactId', 'expectedArtifactHash', 'operationKey', 'visibility', 'expectedLiveReleaseId']) &&
        value.projectId === owner.projectId && value.branchId === owner.branchId && value.expectedActorId === owner.actorId &&
        id(value.artifactId) && hash(value.expectedArtifactHash) && key(value.operationKey) && value.visibility === 'protected-only' &&
        (value.expectedLiveReleaseId === null || id(value.expectedLiveReleaseId));
}
export function readImportedPreparation(storage: Storage, owner: ImportedHostingOwner): ImportedPreparation | null {
    const text = raw(storage, `${prefix(owner)}/preparation`); if (text === null) return null;
    const record = decoded(text);
    if (!exact(record, ['version', 'owner', 'id', 'stage', 'capture', 'artifactId', 'artifactHash', 'candidateRequest', 'candidate']) || record.version !== 1 ||
        !ownerValid(record.owner) || !sameOwner(record.owner, owner) || !key(record.id) ||
        !['capture', 'artifact', 'saved', 'candidate', 'complete', 'refused', 'removed'].includes(String(record.stage)) ||
        (record.capture !== null && !captureValid(record.capture, owner)) || (record.artifactId !== null && !id(record.artifactId)) ||
        (record.artifactHash !== null && !hash(record.artifactHash)) || (record.candidateRequest !== null && !candidateValid(record.candidateRequest, owner)) ||
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
async function current(io: ImportedHostingIO) {
    io.session.guard(); const status = await io.status(); io.session.guard();
    if (status.actorId !== io.owner.actorId || status.workspaceId !== io.owner.workspaceId || status.profile !== 'imported-next-v1') throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
    return status;
}
const typed = (error: unknown, code: string) => error instanceof ConvexError && error.data === code;
/** Explicit source capture or row-level finish. Neither starts candidate preparation or a build. */
export async function saveImportedReviewSource(input: ImportedHostingIO, revision: number, artifactId?: Id<'cloudReleases'>) {
    const io = { ...input, owner: immutable(input.owner) }; io.session.guard();
    const old = readImportedPreparation(io.storage, io.owner); if (preparationPending(old)) return changed();
    const status = await current(io);
    if (artifactId ? !status.releases.some(row => row.id === artifactId && row.canFinishPreparing && !row.removal) : !status.canFreezePrivateArtifact || status.revision !== revision) throw new Error('CLOUD_CONFLICT');
    const record: ImportedPreparation = { version: 1, owner: io.owner, id: crypto.randomUUID(), stage: artifactId ? 'artifact' : 'capture',
        capture: artifactId ? null : { projectId: io.owner.projectId, branchId: io.owner.branchId, expectedActorId: io.owner.actorId, expectedRevision: revision, operationKey: crypto.randomUUID(), purpose: 'private-artifact' },
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
export async function prepareImportedPrivateReview(input: ImportedHostingIO, artifact: Receipt, expectedLiveReleaseId: Id<'cloudReleases'> | null) {
    const io = { ...input, owner: immutable(input.owner) }, selected = immutable(artifact); io.session.guard();
    const old = readImportedPreparation(io.storage, io.owner); if (preparationPending(old)) return changed();
    const status = await current(io);
    if (status.liveReleaseId !== expectedLiveReleaseId || !status.releases.some(row => row.id === selected.releaseId && row.hash === selected.hash && row.canPreparePrivateReview && !row.removal)) throw new Error('CLOUD_RELEASE_CHANGED');
    const candidateRequest: Candidate = { projectId: io.owner.projectId, branchId: io.owner.branchId, expectedActorId: io.owner.actorId,
        artifactId: selected.releaseId, expectedArtifactHash: selected.hash, operationKey: crypto.randomUUID(), visibility: 'protected-only', expectedLiveReleaseId };
    const record: ImportedPreparation = { version: 1, owner: io.owner, id: crypto.randomUUID(), stage: 'candidate', capture: null,
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
