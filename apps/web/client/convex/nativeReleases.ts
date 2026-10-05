import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './_generated/server';
import { requireCap } from './lib/permissions';
import { assertNativeRequest, MAX_SETTLE_ATTEMPTS, nativeDestinationKey, nativePinsMatch, nativeReleasePins } from './lib/nativeReleaseContract';

type Operation = Doc<'nativeReleaseOperations'>;
type WorkerArgs = { operationId: Id<'nativeReleaseOperations'>; nonce: string };
const workerArgs = { operationId: v.id('nativeReleaseOperations'), nonce: v.string() };
const workerRef = makeFunctionReference<'action', WorkerArgs, null>('nativeReleaseActions:work');
const settleRef = makeFunctionReference<'mutation', { operationId: Id<'nativeReleaseOperations'>; attempt: number }, null>('nativeReleases:_settle');

/** Scheduled functions have no original request auth. Recreate only the server-retained
 * identity to run the same current membership checks, then require the exact original user.
 */
async function currentActorAllowed(ctx: MutationCtx, op: Operation): Promise<boolean> {
    try {
        const authenticatedCtx: MutationCtx = { ...ctx, auth: { ...ctx.auth, getUserIdentity: async () => op.identity } };
        const access = await requireCap(authenticatedCtx, 'project.publish', { projectId: op.pins.projectId });
        if (access.user._id !== op.actorId) return false;
        const branch = await ctx.db.get(op.pins.branchId);
        return branch?.projectId === op.pins.projectId && branch.runtimeType === 'local';
    } catch { return false; }
}

async function registrationMatches(ctx: MutationCtx, op: Pick<Operation, 'actorId' | 'pins'>): Promise<boolean> {
    const [destination, connection] = await Promise.all([
        ctx.db.get(op.pins.destinationId), ctx.db.get(op.pins.connectionId),
    ]);
    if (!destination || !connection || destination.revokedAt !== undefined || connection.revokedAt !== undefined ||
        !Number.isFinite(destination.verifiedAt) || destination.verifiedAt <= 0 ||
        !Number.isFinite(connection.verifiedAt) || connection.verifiedAt <= 0 ||
        !Number.isFinite(connection.expiresAt) || connection.expiresAt <= Date.now()) return false;
    const canonicalKey = nativeDestinationKey(destination.providerAccountId, destination.providerProjectId);
    const canonical = await ctx.db.query('nativeReleaseDestinations').withIndex('by_key', q => q.eq('key', canonicalKey)).unique();
    return destination.provider === 'vercel' && destination.key === canonicalKey && canonical?._id === destination._id &&
        destination.generation === op.pins.destinationGeneration && connection.generation === op.pins.connectionGeneration &&
        connection.destinationId === destination._id && connection.actorId === op.actorId &&
        connection.projectId === op.pins.projectId && connection.branchId === op.pins.branchId &&
        connection.callerKey === op.pins.callerKey && connection.credentialVersion === op.pins.credentialVersion;
}
function hasSendHistory(op: Operation): boolean {
    return op.sendAuthorityGranted !== false || op.stage === 'sending' || op.stage === 'unknown';
}
async function reservedOperation(ctx: MutationCtx, args: WorkerArgs): Promise<Operation | null> {
    const op = await ctx.db.get(args.operationId);
    if (!op || op.nonce !== args.nonce || hasSendHistory(op)) return null;
    const destination = await ctx.db.get(op.pins.destinationId);
    if (!destination || destination.lockOperationId !== op._id || destination.generation !== op.pins.destinationGeneration) return null;
    return op;
}

/** Internal, authenticated prerequisite only. No destination registration, credentials,
 * caller-authored eligibility or live authority is accepted by this reservation path.
 */
export const _reserve = internalMutation({
    args: { operationKey: v.string(), pins: nativeReleasePins },
    returns: v.id('nativeReleaseOperations'),
    handler: async (ctx, { operationKey, pins }) => {
        assertNativeRequest(operationKey, pins);
        const identity = await ctx.auth.getUserIdentity();
        if (!identity || !identity.subject || !identity.issuer || !identity.tokenIdentifier ||
            [identity.subject, identity.issuer, identity.tokenIdentifier].some(value => value.length > 2048)) throw new Error('UNAUTHORIZED');
        const access = await requireCap(ctx, 'project.publish', { projectId: pins.projectId });
        // Check the retained immutable request before inspecting mutable registrations.
        const prior = await ctx.db.query('nativeReleaseOperations').withIndex('by_operationKey', q => q.eq('operationKey', operationKey)).unique();
        if (prior) {
            if (prior.actorId !== access.user._id || prior.identity.tokenIdentifier !== identity.tokenIdentifier ||
                prior.identity.subject !== identity.subject || prior.identity.issuer !== identity.issuer || !nativePinsMatch(prior.pins, pins)) {
                throw new Error('NATIVE_RETRY_CHANGED');
            }
            const branch = await ctx.db.get(pins.branchId);
            if (branch?.projectId !== pins.projectId || branch.runtimeType !== 'local') throw new Error('NATIVE_SCOPE_CHANGED');
            return prior._id;
        }
        const branch = await ctx.db.get(pins.branchId);
        if (branch?.projectId !== pins.projectId || branch.runtimeType !== 'local') throw new Error('NATIVE_SCOPE_CHANGED');
        const now = Date.now();
        const retainedIdentity = { subject: identity.subject, issuer: identity.issuer, tokenIdentifier: identity.tokenIdentifier };
        const candidate = { actorId: access.user._id, identity: retainedIdentity, pins };
        const connection = await ctx.db.get(pins.connectionId);
        const destination = await ctx.db.get(pins.destinationId);
        if (!connection || !destination) throw new Error('NATIVE_REGISTRATION_REQUIRED');
        if (!await registrationMatches(ctx, candidate)) throw new Error('NATIVE_REGISTRATION_REQUIRED');
        if (destination.lockOperationId) throw new Error('NATIVE_DESTINATION_BUSY');
        if (destination.liveDeploymentId !== pins.expectedLiveDeploymentId) throw new Error('NATIVE_LIVE_CHANGED');
        const operationId = await ctx.db.insert('nativeReleaseOperations', {
            operationKey, ...candidate, nonce: crypto.randomUUID(), stage: 'queued', sendAuthorityGranted: false,
            createdAt: now, updatedAt: now,
        });
        const op = await ctx.db.get(operationId);
        if (!op) throw new Error('NATIVE_OPERATION_NOT_FOUND');
        await ctx.db.patch(destination._id, { lockOperationId: operationId });
        // These writes and the original scheduler creation commit or roll back together.
        const schedulerId = await ctx.scheduler.runAfter(0, workerRef, { operationId, nonce: op.nonce });
        await ctx.db.patch(operationId, { schedulerId });
        await ctx.scheduler.runAfter(5000, settleRef, { operationId, attempt: 0 });
        return operationId;
    },
});

async function refuseSend(ctx: MutationCtx, args: WorkerArgs): Promise<false> {
    const op = await reservedOperation(ctx, args);
    if (!op || op.stage !== 'queued') return false;
    const scheduler = op.schedulerId ? await ctx.db.system.get(op.schedulerId) : null;
    let reason = 'NATIVE_VERIFIER_UNAVAILABLE';
    if (scheduler?.state.kind !== 'inProgress') reason = 'NATIVE_ORIGINAL_WORKER_NOT_RUNNING';
    else if (!await currentActorAllowed(ctx, op)) reason = 'NATIVE_SCOPE_REVOKED';
    else if (!await registrationMatches(ctx, op)) reason = 'NATIVE_REGISTRATION_CHANGED';
    const destination = await ctx.db.get(op.pins.destinationId);
    if (destination?.liveDeploymentId !== op.pins.expectedLiveDeploymentId) reason = 'NATIVE_LIVE_CHANGED';
    await ctx.db.patch(op._id, { stage: 'refused', refusal: reason, updatedAt: Date.now() });
    // No verifier exists. Even all valid pins and fresh rights cannot grant send authority.
    return false;
}
export const _preflight = internalMutation({ args: workerArgs, returns: v.literal(false), handler: refuseSend });
// Independently fail closed for direct internal calls, without trusting preflight or a caller boolean.
export const _beginSend = internalMutation({ args: workerArgs, returns: v.literal(false), handler: refuseSend });

export const _cancel = internalMutation({
    args: { operationId: v.id('nativeReleaseOperations') }, returns: v.null(),
    handler: async (ctx, { operationId }) => {
        const op = await ctx.db.get(operationId);
        if (!op) throw new Error('NATIVE_OPERATION_NOT_FOUND');
        const identity = await ctx.auth.getUserIdentity();
        const access = await requireCap(ctx, 'project.publish', { projectId: op.pins.projectId });
        if (access.user._id !== op.actorId || identity?.tokenIdentifier !== op.identity.tokenIdentifier) throw new Error('FORBIDDEN');
        if (hasSendHistory(op) || op.stage === 'settled') return null;
        await ctx.db.patch(op._id, { stage: 'canceled', canceledAt: Date.now(), updatedAt: Date.now() });
        // Cancellation prevents unsent CAS only. It cannot itself release the reservation.
        return null;
    },
});

export const _settle = internalMutation({
    args: { operationId: v.id('nativeReleaseOperations'), attempt: v.number() }, returns: v.null(),
    handler: async (ctx, { operationId, attempt }) => {
        if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt > MAX_SETTLE_ATTEMPTS) throw new Error('NATIVE_INVALID_SETTLE_ATTEMPT');
        const op = await ctx.db.get(operationId);
        if (!op || hasSendHistory(op) || op.stage === 'settled' || !op.schedulerId) return null;
        const destination = await ctx.db.get(op.pins.destinationId);
        if (!destination || destination.lockOperationId !== op._id || destination.generation !== op.pins.destinationGeneration) return null;
        const scheduled = await ctx.db.system.get(op.schedulerId);
        if (!scheduled) return null; // Missing is not positive terminal proof.
        if (scheduled.state.kind === 'pending' || scheduled.state.kind === 'inProgress') {
            if (attempt < MAX_SETTLE_ATTEMPTS) await ctx.scheduler.runAfter(5000, settleRef, { operationId, attempt: attempt + 1 });
            return null;
        }
        if (!['success', 'failed', 'canceled'].includes(scheduled.state.kind)) return null;
        const now = Date.now();
        await ctx.db.patch(op._id, { stage: 'settled', settledAt: now, updatedAt: now,
            refusal: op.refusal ?? (op.stage === 'canceled' ? 'NATIVE_CANCELED_UNSENT' : 'NATIVE_WORKER_TERMINAL_UNSENT') });
        await ctx.db.patch(destination._id, { lockOperationId: undefined });
        return null;
    },
});
