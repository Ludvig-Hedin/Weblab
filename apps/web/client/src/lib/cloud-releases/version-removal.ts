import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import type { ReleaseSession } from './session';

export type CloudVersionStatus = 'captured' | 'frozen' | 'building' | 'ready' | 'error';
export type CloudVersionKind = 'version' | 'backup' | 'private-artifact' | 'protected-version';
export type CloudRemovalPhase = 'files' | 'reviews' | 'tickets' | 'assets';
export type CloudRemovalReason = 'live-version' | 'release-operation-pending' | 'required-by-version' | 'building' | 'version-changed' | 'version-unavailable';
export type CloudVersionMetadata = {
    id: Id<'cloudReleases'>; projectId: Id<'projects'>; branchId: Id<'branches'>; workspaceId: Id<'workspaces'>;
    projectName: string | null; revision: number; createdAt: number; kind: CloudVersionKind;
    status: CloudVersionStatus; profile: 'starter-v1' | 'imported-next-v1';
};
export type CloudRemovalConfirmation = { releaseId: Id<'cloudReleases'>; expectedHash: string | null; expectedStatus: CloudVersionStatus; expectedRevision: number };
export type CloudRemovalReceipt = { version: 1; releaseId: Id<'cloudReleases'>; initiatorActorId: Id<'users'>; operationKey: string; confirmation: CloudRemovalConfirmation; requestedAt: number };
export type CloudRemovalProgress = CloudRemovalReceipt & ({ phase: CloudRemovalPhase; completedAt: null } | { phase: 'done'; completedAt: number });
export type CloudRemovalInspection = { actorId: Id<'users'>; result:
    | { state: 'available'; version: CloudVersionMetadata; confirmation: CloudRemovalConfirmation }
    | { state: 'blocked'; version: CloudVersionMetadata; reason: CloudRemovalReason; dependentVersion: Pick<CloudVersionMetadata, 'id' | 'revision' | 'createdAt' | 'kind'> | null }
    | { state: 'removing'; version: CloudVersionMetadata; progress: CloudRemovalProgress & { phase: CloudRemovalPhase } }
    | { state: 'removed'; progress: CloudRemovalProgress & { phase: 'done' } }
};
export type CloudRemovalResult = { actorId: Id<'users'>; progress: CloudRemovalProgress };
export type CloudRetainedVersion = CloudVersionMetadata & { canManageVersions: boolean; canRestore: boolean; canDownload: boolean; removal: (CloudRemovalProgress & { phase: CloudRemovalPhase }) | null };
export type CloudRetainedVersionPage = { actorId: Id<'users'>; workspaceId: Id<'workspaces'>; page: CloudRetainedVersion[]; isDone: boolean; continueCursor: string };
export type CloudRemovalBeginArgs = CloudRemovalConfirmation & { expectedActorId: Id<'users'>; operationKey: string };
export type CloudRemovalContinueArgs = { releaseId: Id<'cloudReleases'>; operationKey: string; initiatorActorId: Id<'users'>; expectedExecutorActorId: Id<'users'> };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Guard = { session: Pick<ReleaseSession, 'guard'>; current: () => boolean; actorId: Id<'users'> };
export function guardVersionRemoval(input: Guard) {
    input.session.guard();
    if (!input.current()) throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
}
function sameConfirmation(a: CloudRemovalConfirmation, b: CloudRemovalConfirmation) {
    return a.releaseId === b.releaseId && a.expectedHash === b.expectedHash && a.expectedStatus === b.expectedStatus && a.expectedRevision === b.expectedRevision;
}
function storageKey(actor: string, release: string) { return `weblab.version-removal.v1/${encodeURIComponent(actor)}/${encodeURIComponent(release)}`; }
export function readRemovalBeginRequest(storage: Storage, actorId: Id<'users'>, releaseId: Id<'cloudReleases'>): CloudRemovalBeginArgs | null {
    try {
        const raw = storage.getItem(storageKey(actorId, releaseId));
        if (raw === null) return null;
        const old: CloudRemovalBeginArgs = JSON.parse(raw);
        if (!old || Object.keys(old).sort().join() !== 'expectedActorId,expectedHash,expectedRevision,expectedStatus,operationKey,releaseId'
            || old.expectedActorId !== actorId || old.releaseId !== releaseId
            || (old.expectedHash !== null && (typeof old.expectedHash !== 'string' || old.expectedHash.length !== 64 || /[^a-f0-9]/.test(old.expectedHash)))
            || !Number.isSafeInteger(old.expectedRevision) || old.expectedRevision < 0 || !['captured', 'frozen', 'building', 'ready', 'error'].includes(old.expectedStatus)
            || typeof old.operationKey !== 'string' || old.operationKey.length < 16 || old.operationKey.length > 128 || /[^a-zA-Z0-9-]/.test(old.operationKey)) throw new Error('invalid request');
        return old;
    } catch { throw new Error('CLOUD_REMOVAL_RECOVERY_UNAVAILABLE'); }
}
export function previousRemovalNeedsCheck(storage: Storage, actorId: Id<'users'>, confirmation: CloudRemovalConfirmation) {
    const previous = readRemovalBeginRequest(storage, actorId, confirmation.releaseId);
    return previous !== null && !sameConfirmation(previous, confirmation);
}
/** Persist before dispatch; a lost reply must never mint a replacement request. */
export function removalBeginRequest(storage: Storage, actorId: Id<'users'>, confirmation: CloudRemovalConfirmation): CloudRemovalBeginArgs {
    const old = readRemovalBeginRequest(storage, actorId, confirmation.releaseId);
    if (old) {
        if (!sameConfirmation(old, confirmation)) throw new Error('CLOUD_REMOVAL_PREVIOUS_REQUEST');
        return old;
    }
    try {
        const request = { ...confirmation, expectedActorId: actorId, operationKey: crypto.randomUUID() };
        storage.setItem(storageKey(actorId, confirmation.releaseId), JSON.stringify(request));
        return request;
    } catch { throw new Error('CLOUD_REMOVAL_RECOVERY_UNAVAILABLE'); }
}
export async function inspectVersionRemoval(input: Guard & { releaseId: Id<'cloudReleases'>; inspect: () => Promise<CloudRemovalInspection> }) {
    guardVersionRemoval(input);
    const result = await input.inspect();
    guardVersionRemoval(input);
    if (result.actorId !== input.actorId || (result.result.state === 'removed' ? result.result.progress.releaseId : result.result.version.id) !== input.releaseId
        || (result.result.state === 'available' && result.result.confirmation.releaseId !== input.releaseId)
        || ((result.result.state === 'removing' || result.result.state === 'removed') && (result.result.progress.releaseId !== input.releaseId || result.result.progress.confirmation.releaseId !== input.releaseId))) throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
    return result;
}
export function isDefiniteRemovalRefusal(cause: unknown) {
    return cause instanceof ConvexError && (cause.data === 'CLOUD_RELEASE_REMOVAL_CHANGED' || cause.data === 'CLOUD_RELEASE_REMOVAL_BLOCKED');
}
function clearExactRequest(storage: Storage, actorId: Id<'users'>, releaseId: Id<'cloudReleases'>, operationKey: string) {
    try {
        const key = storageKey(actorId, releaseId), raw = storage.getItem(key);
        if (raw && JSON.parse(raw).operationKey === operationKey) storage.removeItem(key);
    } catch { /* Retain the exact request; cleanup must not replace the known outcome. */ }
}
function validProgress(p: CloudRemovalProgress) {
    return p.version === 1 && Number.isFinite(p.requestedAt) && (p.phase === 'done' ? Number.isFinite(p.completedAt)
        : p.completedAt === null && ['files', 'reviews', 'tickets', 'assets'].includes(p.phase));
}
/** Explicit reconciliation only. Does not continue deletion or mint a new request. */
export async function checkPreviousRemoval(input: Guard & {
    storage: Storage; releaseId: Id<'cloudReleases'>; begin: (args: CloudRemovalBeginArgs) => Promise<CloudRemovalResult>;
}) {
    guardVersionRemoval(input);
    const request = readRemovalBeginRequest(input.storage, input.actorId, input.releaseId);
    if (!request) throw new Error('CLOUD_REMOVAL_PREVIOUS_REQUEST');
    let reply: CloudRemovalResult;
    try { reply = await input.begin(request); }
    catch (cause) {
        if (isDefiniteRemovalRefusal(cause)) clearExactRequest(input.storage, input.actorId, request.releaseId, request.operationKey);
        throw cause;
    }
    guardVersionRemoval(input);
    const p = reply.progress;
    if (reply.actorId !== input.actorId || !validProgress(p) || p.releaseId !== request.releaseId || p.initiatorActorId !== request.expectedActorId
        || p.operationKey !== request.operationKey || !sameConfirmation(p.confirmation, request)) throw new Error('CLOUD_REMOVAL_RECEIPT_CHANGED');
    if (p.phase === 'done') clearExactRequest(input.storage, input.actorId, request.releaseId, request.operationKey);
    return p;
}
/** Called only by an explicit confirmation, never an effect or timer. */
export async function removeVersion(input: Guard & {
    storage: Storage; selection: Extract<CloudRemovalInspection['result'], { state: 'available' | 'removing' }>;
    begin: (args: CloudRemovalBeginArgs) => Promise<CloudRemovalResult>;
    continueRemoval: (args: CloudRemovalContinueArgs) => Promise<CloudRemovalResult>;
    onProgress: (progress: CloudRemovalProgress) => void;
}) {
    guardVersionRemoval(input);
    const selected = input.selection;
    const request = selected.state === 'available' ? removalBeginRequest(input.storage, input.actorId, selected.confirmation) : null;
    let expected: Pick<CloudRemovalReceipt, 'releaseId' | 'operationKey' | 'initiatorActorId' | 'confirmation'>;
    if (selected.state === 'removing') expected = selected.progress;
    else if (request) expected = { releaseId: request.releaseId, operationKey: request.operationKey, initiatorActorId: input.actorId, confirmation: selected.confirmation };
    else throw new Error('CLOUD_REMOVAL_RECEIPT_CHANGED');
    let requestedAt = selected.state === 'removing' ? selected.progress.requestedAt : null;
    const accept = (reply: CloudRemovalResult) => {
        guardVersionRemoval(input);
        const p = reply.progress;
        if (reply.actorId !== input.actorId || !validProgress(p) || p.releaseId !== expected.releaseId || p.operationKey !== expected.operationKey || p.initiatorActorId !== expected.initiatorActorId || !sameConfirmation(p.confirmation, expected.confirmation) || (requestedAt !== null && p.requestedAt !== requestedAt)) throw new Error('CLOUD_REMOVAL_RECEIPT_CHANGED');
        requestedAt = p.requestedAt; expected = p; input.onProgress(p); return p;
    };
    guardVersionRemoval(input);
    let progress: CloudRemovalProgress | null = selected.state === 'removing' ? selected.progress : null;
    if (request) {
        let reply: CloudRemovalResult;
        try { reply = await input.begin(request); }
        catch (cause) {
            // Only these typed begin refusals prove this exact request did not commit.
            if (isDefiniteRemovalRefusal(cause)) clearExactRequest(input.storage, input.actorId, request.releaseId, request.operationKey);
            throw cause;
        }
        progress = accept(reply);
    }
    if (!progress) throw new Error('CLOUD_REMOVAL_RECEIPT_CHANGED');
    while (progress.phase !== 'done') {
        guardVersionRemoval(input);
        progress = accept(await input.continueRemoval({ releaseId: expected.releaseId, operationKey: expected.operationKey, initiatorActorId: expected.initiatorActorId, expectedExecutorActorId: input.actorId }));
    }
    // Cleanup failure cannot turn a durable acknowledgement into an unknown result.
    clearExactRequest(input.storage, input.actorId, progress.releaseId, progress.operationKey);
    return progress;
}
