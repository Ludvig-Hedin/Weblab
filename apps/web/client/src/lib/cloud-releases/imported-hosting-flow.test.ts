import { describe, expect, it } from 'bun:test';
import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import { saveImportedReviewSource, resumeImportedPreparation, prepareImportedPrivateReview, readImportedPreparation, preparationPending,
    privateBuildIntent, requestImportedPrivateBuild, reconcileImportedPrivateBuild, readImportedBuild,
    saveImportedPublicationSource, prepareImportedPublicationReview, readImportedPublication, publicationPending, importedReviewIntent, importedPublicationIntent, requestImportedPublication, reconcileImportedPublication,
    type ImportedHostingIO, type ImportedHostingOwner } from './imported-hosting-flow';

const owner: ImportedHostingOwner = { workspaceId: 'workspace' as Id<'workspaces'>, projectId: 'project' as Id<'projects'>, branchId: 'branch' as Id<'branches'>,
    actorId: 'actor' as Id<'users'>, clerkUserId: 'clerk-user', backend: 'https://proof.convex.cloud' };
const artifactId = 'artifact' as Id<'cloudReleases'>, candidateId = 'candidate' as Id<'cloudReleases'>, operationId = 'operation' as Id<'cloudReleaseOperations'>;
const hash = 'a'.repeat(64), candidateHash = 'b'.repeat(64);
function fixture() {
    const saved = new Map<string, string>(), calls: { kind: string; args: unknown }[] = [];
    let alive = true, writeFails = false, revision = 1, gate = true;
    let captureError: unknown, prepareError: unknown, hostingError: unknown, buildError: unknown;
    let beforeCapture: (() => Promise<void>) | undefined;
    let operations: { id: typeof operationId; operationKey: string; actorId: typeof owner.actorId; releaseId: typeof candidateId; kind: 'build'; stage: string; expectedLiveReleaseId: null }[] = [];
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { if (writeFails) throw new Error('full'); saved.set(key, value); }, removeItem: () => { throw new Error('cleanup denied'); } };
    const io: ImportedHostingIO = { owner, storage, session: { guard: () => { if (!alive) throw new Error('SESSION_CHANGED'); } },
        status: async () => ({ actorId: owner.actorId, workspaceId: owner.workspaceId, profile: 'imported-next-v1', revision, canFreezePrivateArtifact: gate, canBuildPrivateReview: gate, liveReleaseId: null,
            releases: [{ id: artifactId, hash, canFinishPreparing: true, canPreparePrivateReview: gate, removal: null }, { id: candidateId, hash: candidateHash, canBuildPrivateReview: gate, removal: null }], operations,
        } as unknown as Awaited<ReturnType<ImportedHostingIO['status']>>),
        capture: async args => { calls.push({ kind: 'capture', args }); await beforeCapture?.(); if (captureError) throw captureError; return artifactId; },
        prepare: async args => { calls.push({ kind: 'prepare', args }); if (prepareError) throw prepareError; return { releaseId: artifactId, hash }; },
        prepareHosting: async args => { calls.push({ kind: 'hosting', args }); if (hostingError) throw hostingError; return { releaseId: candidateId, hash: candidateHash }; },
        request: async args => { calls.push({ kind: args.kind, args }); if (buildError) throw buildError; return operationId; },
    };
    return { io, saved, calls, storage, revoke: () => { alive = false; }, failStorage: () => { writeFails = true; }, advance: () => { revision++; }, pause: () => { gate = false; },
        captureError: (error: unknown) => { captureError = error; }, prepareError: (error: unknown) => { prepareError = error; }, hostingError: (error: unknown) => { hostingError = error; }, buildError: (error: unknown) => { buildError = error; },
        beforeCapture: (fn: () => Promise<void>) => { beforeCapture = fn; }, operations: (value: typeof operations) => { operations = value; } };
}
describe('imported private preparation recovery', () => {
    it('saves source without candidate/build dispatch, then explicitly prepares a candidate', async () => {
        const f = fixture(); const source = await saveImportedReviewSource(f.io, 1);
        expect(source.stage).toBe('saved'); expect(f.calls.map(call => call.kind)).toEqual(['capture', 'prepare']);
        expect(await prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null)).toMatchObject({ stage: 'complete', candidate: { releaseId: candidateId, hash: candidateHash } });
        expect(f.calls.map(call => call.kind)).toEqual(['capture', 'prepare', 'hosting']);
        expect(f.calls[2]?.args).toMatchObject({ artifactId, expectedArtifactHash: hash, expectedActorId: owner.actorId, visibility: 'protected-only', expectedLiveReleaseId: null });
    });
    it('retains a lost capture key at its original revision until exact typed no-commit evidence', async () => {
        const f = fixture(); f.captureError(new Error('lost'));
        await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow('lost');
        const old = readImportedPreparation(f.storage, owner)!; expect(old.stage).toBe('capture');
        f.advance(); f.captureError(new ConvexError('CLOUD_CONFLICT'));
        expect((await resumeImportedPreparation(f.io)).stage).toBe('refused');
        expect(f.calls[1]?.args).toEqual(f.calls[0]?.args); expect(f.calls).toHaveLength(2);
        f.captureError(undefined); await saveImportedReviewSource(f.io, 2);
        expect(f.calls[2]?.args).toMatchObject({ expectedRevision: 2 }); expect(f.calls[2]?.args).not.toEqual(f.calls[0]?.args);
    });
    it('does not replace unknown capture after a generic conflict-shaped or auth error', async () => {
        const f = fixture(); f.captureError(new Error('CLOUD_CONFLICT'));
        await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow('CLOUD_CONFLICT');
        const before = [...f.saved]; f.advance();
        await expect(saveImportedReviewSource(f.io, 2)).rejects.toThrow('PREVIOUS_REQUEST');
        f.captureError(new ConvexError('CLOUD_ACTOR_CHANGED'));
        await expect(resumeImportedPreparation(f.io)).rejects.toThrow();
        expect([...f.saved]).toEqual(before);
    });
    it('keeps the exact Node action stage when a later retry refuses while an earlier result is unknown', async () => {
        const f = fixture(); f.prepareError(new Error('lost action reply'));
        await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow();
        const before = [...f.saved]; f.prepareError(new ConvexError('CLOUD_DISABLED'));
        await expect(resumeImportedPreparation(f.io)).rejects.toThrow(); expect([...f.saved]).toEqual(before);
        expect(f.calls.filter(call => call.kind === 'capture')).toHaveLength(1);
        f.prepareError(undefined); await resumeImportedPreparation(f.io);
        f.hostingError(new Error('unknown hosting reply'));
        await expect(prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null)).rejects.toThrow();
        const pending = [...f.saved]; f.hostingError(new ConvexError('CLOUD_RELEASE_LIVE_CHANGED'));
        await expect(resumeImportedPreparation(f.io)).rejects.toThrow(); expect([...f.saved]).toEqual(pending);
        expect(f.calls.filter(call => call.kind === 'hosting')[1]?.args).toEqual(f.calls.filter(call => call.kind === 'hosting')[0]?.args);
    });
    it('keeps known completion if cleanup fails and allows a later explicitly saved source version', async () => {
        const f = fixture(); await prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null);
        expect(readImportedPreparation(f.storage, owner)?.stage).toBe('complete');
        expect(preparationPending(readImportedPreparation(f.storage, owner))).toBe(false);
        f.advance(); await saveImportedReviewSource(f.io, 2);
        expect(readImportedPreparation(f.storage, owner)?.capture?.expectedRevision).toBe(2);
    });
    it('retains the original candidate while an earlier action is still running and a retry refuses', async () => {
        const f = fixture();
        let enter!: () => void, finish!: (receipt: { releaseId: typeof candidateId; hash: string }) => void;
        const started = new Promise<void>(resolve => { enter = resolve; });
        const pending = new Promise<{ releaseId: typeof candidateId; hash: string }>(resolve => { finish = resolve; });
        let calls = 0;
        f.io.prepareHosting = async args => {
            f.calls.push({ kind: 'hosting', args });
            if (++calls === 1) { enter(); return pending; }
            throw new ConvexError('CLOUD_RELEASE_LIVE_CHANGED');
        };
        const first = prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null);
        await started;
        const before = [...f.saved];
        await expect(resumeImportedPreparation(f.io)).rejects.toThrow('CLOUD_RELEASE_LIVE_CHANGED');
        expect([...f.saved]).toEqual(before); expect(f.calls[1]?.args).toEqual(f.calls[0]?.args);
        await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow('PREVIOUS_REQUEST');
        finish({ releaseId: candidateId, hash: candidateHash });
        expect((await first).stage).toBe('complete');
        expect(calls).toBe(2);
    });
    it('allows a fresh explicit candidate after its acknowledged predecessor is removed', async () => {
        const f = fixture();
        await prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null);
        const first = readImportedPreparation(f.storage, owner)!;
        const status = f.io.status;
        f.io.status = async () => {
            const value = structuredClone(await status());
            const index = value.releases.findIndex(row => row.id === candidateId);
            if (index >= 0) value.releases.splice(index, 1);
            return value;
        };
        const replacement = 'replacement' as Id<'cloudReleases'>;
        f.io.prepareHosting = async args => { f.calls.push({ kind: 'hosting', args }); return { releaseId: replacement, hash: candidateHash }; };
        expect((await prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null)).candidate?.releaseId).toBe(replacement);
        const second = readImportedPreparation(f.storage, owner)!;
        expect(second.candidateRequest?.operationKey).not.toBe(first.candidateRequest?.operationKey);
        expect(second.candidateRequest?.artifactId).toBe(artifactId);
        expect(f.calls).toHaveLength(2);
    });
    it('rejects malformed backend ownership and a changed canonical actor before dispatch', async () => {
        const f = fixture();
        await expect(saveImportedReviewSource({ ...f.io, owner: { ...owner, backend: `${owner.backend}\n` } }, 1)).rejects.toThrow('RECOVERY_UNAVAILABLE');
        const status = f.io.status;
        f.io.status = async () => ({ ...await status(), actorId: 'another' as Id<'users'> });
        await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow('SESSION_CHANGED');
        expect(f.calls).toEqual([]); expect(f.saved.size).toBe(0);
    });
    it('stops before dispatch on storage failure and blocks corrupt records without replacing them', async () => {
        const f = fixture(); f.failStorage(); await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow('RECOVERY_UNAVAILABLE'); expect(f.calls).toEqual([]);
        const corrupt = fixture(); await saveImportedReviewSource(corrupt.io, 1);
        const at = [...corrupt.saved.keys()][0]!; corrupt.saved.set(at, '{broken');
        await expect(saveImportedReviewSource(corrupt.io, 1)).rejects.toThrow('RECOVERY_UNAVAILABLE'); expect(corrupt.saved.get(at)).toBe('{broken');
    });
    it('refuses storage silently dropping the initial exact record', async () => {
        const f = fixture(); f.io.storage = { ...f.storage, setItem: () => {} };
        await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow('RECOVERY_UNAVAILABLE'); expect(f.calls).toEqual([]);
    });
    it('captures inputs before awaits and does not continue under a changed session', async () => {
        const f = fixture(); f.beforeCapture(async () => { f.revoke(); });
        await expect(saveImportedReviewSource(f.io, 1)).rejects.toThrow('SESSION_CHANGED');
        expect(f.calls.map(call => call.kind)).toEqual(['capture']); expect(readImportedPreparation(f.storage, owner)?.stage).toBe('capture');
        expect(Object.isFrozen(f.calls[0]?.args)).toBe(true);
    });
    it('records a removed artifact without recapturing or changing its original key', async () => {
        const f = fixture(); f.prepareError(new ConvexError('CLOUD_RELEASE_REMOVED'));
        expect((await saveImportedReviewSource(f.io, 1)).stage).toBe('removed');
        await resumeImportedPreparation(f.io); expect(f.calls.map(call => call.kind)).toEqual(['capture', 'prepare']);
    });
});
describe('separately confirmed private build admission', () => {
    it('persists before dispatch, retains a lost request and reconciles only its exact operation', async () => {
        const f = fixture(), intent = privateBuildIntent(owner, candidateId, null); f.buildError(new Error('lost'));
        await expect(requestImportedPrivateBuild(f.io, intent, candidateHash)).rejects.toThrow('lost');
        const old = readImportedBuild(f.storage, owner, candidateId)!; expect(old.stage).toBe('pending');
        f.pause(); f.operations([{ id: operationId, operationKey: intent.operationKey, actorId: owner.actorId, releaseId: candidateId, kind: 'build', stage: 'unknown', expectedLiveReleaseId: null }]);
        expect((await reconcileImportedPrivateBuild(f.io, candidateId)).stage).toBe('acknowledged');
        expect(f.calls.filter(call => call.kind === 'build')).toHaveLength(1);
        f.operations([]); expect((await reconcileImportedPrivateBuild(f.io, candidateId)).stage).toBe('acknowledged');
        await expect(requestImportedPrivateBuild(f.io, privateBuildIntent(owner, candidateId, null), candidateHash)).rejects.toThrow('PREVIOUS_REQUEST');
    });
    it('ignores a different actor/key build and retries the original request without minting another', async () => {
        const f = fixture(), intent = privateBuildIntent(owner, candidateId, null); f.buildError(new Error('lost'));
        await expect(requestImportedPrivateBuild(f.io, intent, candidateHash)).rejects.toThrow();
        f.operations([{ id: operationId, operationKey: 'different-build-key', actorId: owner.actorId, releaseId: candidateId, kind: 'build', stage: 'confirmed', expectedLiveReleaseId: null }]);
        f.buildError(undefined); await reconcileImportedPrivateBuild(f.io, candidateId);
        expect(f.calls[1]?.args).toEqual(intent); expect(readImportedBuild(f.storage, owner, candidateId)?.operationId).toBe(operationId);
    });
    it('retains request after gate refusal and closes only an exact provider-terminal observation', async () => {
        const f = fixture(), intent = privateBuildIntent(owner, candidateId, null); f.buildError(new ConvexError('CLOUD_RELEASE_SETUP_REQUIRED'));
        await expect(requestImportedPrivateBuild(f.io, intent, candidateHash)).rejects.toThrow();
        expect(readImportedBuild(f.storage, owner, candidateId)?.stage).toBe('pending');
        f.operations([{ id: operationId, operationKey: intent.operationKey, actorId: owner.actorId, releaseId: candidateId, kind: 'build', stage: 'failed', expectedLiveReleaseId: null }]);
        expect((await reconcileImportedPrivateBuild(f.io, candidateId)).stage).toBe('terminal');
        expect(f.calls).toHaveLength(1);
    });
});


function publicationFixture() {
    const f = fixture(), previousStatus = f.io.status;
    let reviewed = false, publicAllowed = true, sourceAllowed = true, visibility: 'publishable' | 'protected-only' = 'publishable';
    let deploymentId = 'dpl_target', liveReleaseId: Id<'cloudReleases'> | null = null;
    let reviewError: unknown;
    let operations: Awaited<ReturnType<ImportedHostingIO['status']>>['operations'] = [];
    f.io.status = async () => {
        const base = await previousStatus();
        return { ...base, canSavePublicationVersion: sourceAllowed, publicationEnabled: publicAllowed, liveReleaseId,
            releases: [{ ...base.releases[0]!, publicationSource: true, canFinishPreparing: false, canPreparePrivateReview: false,
                canFinishPublicationPreparing: sourceAllowed, canPreparePublicationReview: sourceAllowed },
            { ...base.releases[1]!, visibility, deploymentId, status: 'ready' as const, reviewed,
                canAcknowledge: publicAllowed, canPublish: publicAllowed && reviewed, canRollback: publicAllowed && reviewed }], operations };
    };
    f.io.review = async args => { f.calls.push({ kind: 'review', args }); if (reviewError) throw reviewError; reviewed = true; return null; };
    const reviewIntent = () => importedReviewIntent(owner, candidateId, candidateHash, deploymentId);
    const switchIntent = (kind: 'publish' | 'rollback' = 'publish') => importedPublicationIntent(owner, candidateId, candidateHash, deploymentId, kind, liveReleaseId);
    const operation = (stage: Awaited<ReturnType<ImportedHostingIO['status']>>['operations'][number]['stage'], intent: ReturnType<typeof switchIntent>, resultDeploymentId: string | null = 'dpl_target') => {
        if (intent.action === 'review') throw new Error('Expected switch');
        return { id: operationId, operationKey: intent.request.operationKey, actorId: owner.actorId, releaseId: candidateId, kind: intent.action,
            stage, expectedLiveReleaseId: intent.request.expectedLiveReleaseId, sourceHash: intent.request.expectedHash,
            targetDeploymentId: intent.request.expectedTargetDeploymentId, resultDeploymentId, error: null };
    };
    return { ...f, reviewIntent, switchIntent, operation, markReviewed: () => { reviewed = true; },
        noPublicGrant: () => { publicAllowed = false; }, noDesign: () => { sourceAllowed = false; }, privateOnly: () => { visibility = 'protected-only'; },
        changeTarget: () => { deploymentId = 'dpl_newer'; }, changeLive: () => { liveReleaseId = 'new-live' as Id<'cloudReleases'>; },
        reviewError: (error: unknown) => { reviewError = error; }, operations: (value: typeof operations) => { operations = value; } };
}

describe('explicit publication preparation with compatible private journals', () => {
    it('captures new public intent separately, then pairs only its public source and candidate', async () => {
        const f = publicationFixture();
        expect((await saveImportedPublicationSource(f.io, 1)).stage).toBe('saved');
        expect(f.calls.map(call => call.kind)).toEqual(['capture', 'prepare']);
        expect(f.calls[0]?.args).toMatchObject({ purpose: 'release', publicationIntent: 'eligible-public-version', expectedRevision: 1, expectedActorId: owner.actorId });
        expect(readImportedPreparation(f.storage, owner)?.version).toBe(2);
        await expect(prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null)).rejects.toThrow('CLOUD_RELEASE_CHANGED');
        await prepareImportedPublicationReview(f.io, { releaseId: artifactId, hash }, null);
        expect(f.calls[2]?.args).toMatchObject({ artifactId, expectedArtifactHash: hash, visibility: 'publishable' });
        expect(readImportedPreparation(f.storage, owner)?.stage).toBe('complete');
        const privateFlow = fixture(); await saveImportedReviewSource(privateFlow.io, 1);
        expect(readImportedPreparation(privateFlow.storage, owner)?.version).toBe(1);
        const privateStatus = privateFlow.io.status;
        privateFlow.io.status = async () => { const value = await privateStatus(); return { ...value, releases: value.releases.map(row => ({ ...row, canPreparePublicationReview: true, publicationSource: false })) }; };
        await expect(prepareImportedPublicationReview(privateFlow.io, { releaseId: artifactId, hash }, null)).rejects.toThrow();
        expect(privateFlow.calls).toHaveLength(2);
    });
    it('cannot replace uncertain private work with a new public artifact or promote its persisted pair', async () => {
        const f = fixture(); f.hostingError(new Error('lost'));
        await expect(prepareImportedPrivateReview(f.io, { releaseId: artifactId, hash }, null)).rejects.toThrow();
        const before = [...f.saved]; await expect(saveImportedPublicationSource(f.io, 1)).rejects.toThrow('PREVIOUS_REQUEST');
        expect([...f.saved]).toEqual(before);
        const at = [...f.saved.keys()][0]!, record = JSON.parse(f.saved.get(at)!);
        record.version = 2; f.saved.set(at, JSON.stringify(record));
        expect(() => readImportedPreparation(f.storage, owner)).toThrow('RECOVERY_UNAVAILABLE');
    });
    it('retains exact public capture and Node payloads after loss without silently choosing a new baseline', async () => {
        const f = publicationFixture(); f.captureError(new Error('lost'));
        await expect(saveImportedPublicationSource(f.io, 1)).rejects.toThrow();
        f.advance(); f.captureError(new ConvexError('CLOUD_CONFLICT'));
        expect((await resumeImportedPreparation(f.io)).stage).toBe('refused'); expect(f.calls[1]?.args).toEqual(f.calls[0]?.args);
        f.captureError(undefined); await saveImportedPublicationSource(f.io, 2);
        expect(f.calls[2]?.args).toMatchObject({ purpose: 'release', expectedRevision: 2 });
        f.hostingError(new Error('lost hosting'));
        await expect(prepareImportedPublicationReview(f.io, { releaseId: artifactId, hash }, null)).rejects.toThrow();
        const original = f.calls.at(-1)?.args, before = [...f.saved]; f.changeLive(); f.noDesign(); f.hostingError(new ConvexError('CLOUD_RELEASE_LIVE_CHANGED'));
        await expect(resumeImportedPreparation(f.io)).rejects.toThrow(); expect(f.calls.at(-1)?.args).toEqual(original); expect([...f.saved]).toEqual(before);
    });
    it('requires publication source capability and rejects cross-paired or extra journal fields', async () => {
        const f = publicationFixture(); f.noDesign();
        await expect(saveImportedPublicationSource(f.io, 1)).rejects.toThrow(); expect(f.calls).toEqual([]);
        for (const altered of ['intent', 'purpose', 'unknown'] as const) {
            const copy = publicationFixture(); copy.captureError(new Error('lost'));
            await expect(saveImportedPublicationSource(copy.io, 1)).rejects.toThrow();
            const at = [...copy.saved.keys()][0]!, record = JSON.parse(copy.saved.get(at)!);
            if (altered === 'intent') delete record.capture.publicationIntent;
            else if (altered === 'purpose') record.capture.purpose = 'private-artifact'; else record.authority = true;
            copy.saved.set(at, JSON.stringify(record)); expect(() => readImportedPreparation(copy.storage, owner)).toThrow('RECOVERY_UNAVAILABLE');
        }
    });
});

describe('exact review and public switch recovery', () => {
    it('lets a content publisher acknowledge without Design or current source readiness, then confirm a separate switch', async () => {
        const f = publicationFixture(); f.noDesign(); f.pause(); f.advance();
        await requestImportedPublication(f.io, f.reviewIntent());
        expect(readImportedPublication(f.storage, owner)).toMatchObject({ stage: 'terminal', outcome: 'confirmed', operationId: null });
        const intent = f.switchIntent(); await requestImportedPublication(f.io, intent);
        expect(f.calls.map(call => call.kind)).toEqual(['review', 'publish']);
        expect(f.calls[1]?.args).toEqual(intent.request); expect(Object.isFrozen(f.calls[1]?.args)).toBe(true);
        expect(readImportedPublication(f.storage, owner)).toMatchObject({ stage: 'acknowledged', operationId });
    });
    it('never publicly acknowledges private rows or dispatches a stale target/live/grant confirmation', async () => {
        for (const change of ['private', 'target', 'live', 'grant'] as const) {
            const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent();
            if (change === 'private') f.privateOnly(); else if (change === 'target') f.changeTarget(); else if (change === 'live') f.changeLive(); else f.noPublicGrant();
            await expect(requestImportedPublication(f.io, intent)).rejects.toThrow('CLOUD_RELEASE_CHANGED'); expect(f.calls).toEqual([]); expect(f.saved.size).toBe(0);
        }
        const f = publicationFixture(); f.privateOnly(); await expect(requestImportedPublication(f.io, f.reviewIntent())).rejects.toThrow();
    });
    it('retains lost review acknowledgment and resolves only that actor/hash/deployment without starting publication', async () => {
        const f = publicationFixture(); f.reviewError(new Error('lost')); const intent = f.reviewIntent();
        await expect(requestImportedPublication(f.io, intent)).rejects.toThrow(); const before = [...f.saved];
        f.changeTarget(); f.reviewError(new ConvexError('CLOUD_RELEASE_NOT_ALLOWED'));
        await expect(reconcileImportedPublication(f.io)).rejects.toThrow(); expect([...f.saved]).toEqual(before);
        expect(f.calls.at(-1)?.args).toEqual(intent.request);
        const resolved = publicationFixture(); resolved.reviewError(new Error('lost'));
        await expect(requestImportedPublication(resolved.io, resolved.reviewIntent())).rejects.toThrow(); resolved.markReviewed(); resolved.noPublicGrant();
        expect((await reconcileImportedPublication(resolved.io)).outcome).toBe('confirmed'); expect(resolved.calls).toHaveLength(1);
    });
    it('retries the original lost switch after live change and never repins to new reactive values', async () => {
        const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); f.buildError(new Error('lost'));
        await expect(requestImportedPublication(f.io, intent)).rejects.toThrow();
        f.changeLive(); f.changeTarget(); f.noPublicGrant(); f.buildError(undefined);
        expect((await reconcileImportedPublication(f.io)).operationId).toBe(operationId);
        expect(f.calls[1]?.args).toEqual(intent.request);
        await expect(requestImportedPublication(f.io, f.switchIntent())).rejects.toThrow('PREVIOUS_REQUEST');
    });
    it('accepts exact observed receipts while rejecting different hash, target, actor, key, kind or result evidence', async () => {
        for (const field of ['sourceHash', 'targetDeploymentId', 'actorId', 'operationKey', 'kind', 'resultDeploymentId'] as const) {
            const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); f.buildError(new Error('lost'));
            await expect(requestImportedPublication(f.io, intent)).rejects.toThrow();
            const op = f.operation('confirmed', intent), altered = { ...op, [field]: field === 'kind' ? 'rollback' : 'other' } as typeof op;
            f.operations([altered]); f.buildError(new ConvexError('CLOUD_RELEASE_SETUP_REQUIRED'));
            if (field === 'resultDeploymentId') expect((await reconcileImportedPublication(f.io)).stage).toBe('acknowledged');
            else await expect(reconcileImportedPublication(f.io)).rejects.toThrow('CLOUD_RELEASE_SETUP_REQUIRED');
            expect(publicationPending(readImportedPublication(f.storage, owner))).toBe(true);
        }
        const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); f.buildError(new Error('lost'));
        await expect(requestImportedPublication(f.io, intent)).rejects.toThrow(); f.operations([f.operation('confirmed', intent)]);
        expect((await reconcileImportedPublication(f.io)).outcome).toBe('confirmed'); expect(f.calls).toHaveLength(1);
    });
    it('retains queued/sending/unknown and absent rows, but an exact failed receipt permits a later explicit rollback', async () => {
        const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); await requestImportedPublication(f.io, intent);
        for (const stage of ['queued', 'sending', 'unknown'] as const) {
            f.operations([f.operation(stage, intent)]); expect((await reconcileImportedPublication(f.io)).stage).toBe('acknowledged');
            await expect(requestImportedPublication(f.io, f.switchIntent('rollback'))).rejects.toThrow('PREVIOUS_REQUEST');
        }
        f.operations([]); expect((await reconcileImportedPublication(f.io)).stage).toBe('acknowledged'); expect(f.calls).toHaveLength(1);
        f.operations([f.operation('failed', intent, null)]); expect((await reconcileImportedPublication(f.io)).outcome).toBe('failed');
        const next = f.switchIntent('rollback'); await requestImportedPublication(f.io, next);
        expect(f.calls.at(-1)?.args).toEqual(next.request); expect(next.request).not.toEqual(intent.request);
    });
    it('retires only a typed post-receipt live refusal, then requires a new separately confirmed intent', async () => {
        const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); f.buildError(new Error('lost'));
        await expect(requestImportedPublication(f.io, intent)).rejects.toThrow(); const before = [...f.saved]; f.changeLive();
        for (const error of [new Error('CLOUD_RELEASE_LIVE_CHANGED'), new ConvexError('CLOUD_RELEASE_SETUP_REQUIRED'), new ConvexError('CLOUD_ACTOR_CHANGED')]) {
            f.buildError(error); await expect(reconcileImportedPublication(f.io)).rejects.toThrow(); expect([...f.saved]).toEqual(before);
        }
        f.buildError(new ConvexError('CLOUD_RELEASE_LIVE_CHANGED')); expect((await reconcileImportedPublication(f.io)).outcome).toBe('refused');
        expect(f.calls.at(-1)?.args).toEqual(intent.request);
        f.buildError(undefined); const next = f.switchIntent(); await requestImportedPublication(f.io, next);
        expect(f.calls.at(-1)?.args).toEqual(next.request); expect(next.request).not.toEqual(intent.request);
    });
    it('stops before first dispatch on storage failure or owner change during storage/status, preserving exact pending work', async () => {
        const f = publicationFixture(); f.markReviewed(); f.failStorage();
        await expect(requestImportedPublication(f.io, f.switchIntent())).rejects.toThrow('RECOVERY_UNAVAILABLE'); expect(f.calls).toEqual([]);
        const stale = publicationFixture(); stale.markReviewed();
        stale.io.storage = { ...stale.storage, setItem: (key, value) => { stale.storage.setItem(key, value); stale.revoke(); } };
        await expect(requestImportedPublication(stale.io, stale.switchIntent())).rejects.toThrow('SESSION_CHANGED'); expect(stale.calls).toEqual([]);
        expect(readImportedPublication(stale.storage, owner)?.stage).toBe('pending');
        const actor = publicationFixture(), status = actor.io.status;
        actor.io.status = async () => ({ ...await status(), actorId: 'other' as Id<'users'> });
        await expect(requestImportedPublication(actor.io, actor.reviewIntent())).rejects.toThrow('SESSION_CHANGED'); expect(actor.calls).toEqual([]);
    });
    it('captures the whole confirmation before awaited status and preserves uncertainty after an unmounted reply', async () => {
        const f = publicationFixture(); f.markReviewed();
        const selected = structuredClone(f.switchIntent()), original = structuredClone(selected), status = f.io.status;
        f.io.status = async () => {
            if (selected.action !== 'review') selected.request.expectedTargetDeploymentId = 'dpl_mutated';
            return status();
        };
        await requestImportedPublication(f.io, selected); expect(f.calls[0]?.args).toEqual(original.request);
        const stale = publicationFixture(); stale.markReviewed();
        const request = stale.io.request;
        stale.io.request = async args => { const result = await request(args); stale.revoke(); return result; };
        await expect(requestImportedPublication(stale.io, stale.switchIntent())).rejects.toThrow('SESSION_CHANGED');
        expect(readImportedPublication(stale.storage, owner)).toMatchObject({ stage: 'pending', operationId: null });
        expect(stale.calls).toHaveLength(1);
    });
    it('explicitly resolves an acknowledged operation outside the recent list through its exact saved ID and key', async () => {
        const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent();
        await requestImportedPublication(f.io, intent); expect(intent.action).toBe('publish');
        if (intent.action === 'review') throw new Error('Expected switch');
        const status = f.io.status, queries: Parameters<ImportedHostingIO['status']>[0][] = [];
        f.io.status = async recovery => {
            queries.push(recovery);
            return { ...await status(), operations: [], recoveryOperation: recovery ? f.operation('confirmed', intent) : null };
        };
        const result = await reconcileImportedPublication(f.io);
        expect(queries).toEqual([{ recoveryRequest: { operationId, operationKey: intent.request.operationKey, releaseId: candidateId, kind: 'publish',
            expectedHash: candidateHash, expectedTargetDeploymentId: 'dpl_target', expectedLiveReleaseId: null } }]);
        expect(result).toMatchObject({ stage: 'terminal', outcome: 'confirmed', operationId });
        expect(f.calls).toHaveLength(1);
    });
    it('keeps an omitted or mismatched recovered receipt uncertain instead of replaying an acknowledged send', async () => {
        for (const mismatch of ['absent', 'id', 'hash', 'target', 'actor'] as const) {
            const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); await requestImportedPublication(f.io, intent);
            const status = f.io.status, exact = f.operation('confirmed', intent);
            f.io.status = async () => ({ ...await status(), operations: [], recoveryOperation: mismatch === 'absent' ? null : {
                ...exact, ...(mismatch === 'id' ? { id: 'other' as Id<'cloudReleaseOperations'> } : mismatch === 'hash' ? { sourceHash: 'c'.repeat(64) } :
                    mismatch === 'target' ? { targetDeploymentId: 'dpl_other' } : { actorId: 'other' as Id<'users'> }),
            } });
            expect((await reconcileImportedPublication(f.io)).stage).toBe('acknowledged'); expect(f.calls).toHaveLength(1);
        }
    });
    it('retires only an explicitly retried removed review, without claiming acknowledgment or starting another action', async () => {
        const f = publicationFixture(); f.reviewError(new Error('lost')); const intent = f.reviewIntent();
        await expect(requestImportedPublication(f.io, intent)).rejects.toThrow();
        const status = f.io.status; f.io.status = async () => ({ ...await status(), releases: [] });
        f.reviewError(new ConvexError('CLOUD_RELEASE_NOT_ALLOWED'));
        await expect(reconcileImportedPublication(f.io)).rejects.toThrow(); expect(publicationPending(readImportedPublication(f.storage, owner))).toBe(true);
        f.reviewError(new ConvexError('CLOUD_RELEASE_REMOVED'));
        expect(await reconcileImportedPublication(f.io)).toMatchObject({ stage: 'terminal', outcome: 'removed', operationId: null, intent });
        expect(readImportedPublication(f.storage, owner)?.outcome).toBe('removed');
        expect(f.calls.map(call => call.kind)).toEqual(['review', 'review', 'review']);
        expect(f.calls.every(call => JSON.stringify(call.args) === JSON.stringify(intent.request))).toBe(true);
        const switched = publicationFixture(); switched.markReviewed(); switched.buildError(new ConvexError('CLOUD_RELEASE_REMOVED'));
        await expect(requestImportedPublication(switched.io, switched.switchIntent())).rejects.toThrow();
        expect(readImportedPublication(switched.storage, owner)).toMatchObject({ stage: 'pending', outcome: null });
    });
    it('resolves an unadmitted removed switch only through the exact completed tombstone response', async () => {
        const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); f.buildError(new Error('lost before admission'));
        await expect(requestImportedPublication(f.io, intent)).rejects.toThrow();
        if (intent.action === 'review') throw new Error('Expected switch');
        const status = f.io.status, queries: Parameters<ImportedHostingIO['status']>[0][] = [];
        f.io.status = async recovery => { queries.push(recovery); return { ...await status(), releases: [], operations: [], recoveryOperation: null,
            recoveryRemoval: { state: 'removed' as const, releaseId: candidateId, hash: candidateHash, completedAt: 123 } }; };
        expect(await reconcileImportedPublication(f.io)).toMatchObject({ stage: 'terminal', outcome: 'removed', operationId: null });
        expect(queries).toEqual([{ recoveryRequest: { operationKey: intent.request.operationKey, releaseId: candidateId, kind: 'publish', expectedHash: candidateHash,
            expectedTargetDeploymentId: 'dpl_target', expectedLiveReleaseId: null } }]);
        expect(f.calls).toHaveLength(1); expect(readImportedPublication(f.storage, owner)?.outcome).toBe('removed');
    });
    it('resolves the original operation before a removed version when admission was lost and the recent list no longer contains it', async () => {
        const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent(); f.buildError(new Error('lost after admission'));
        await expect(requestImportedPublication(f.io, intent)).rejects.toThrow();
        const status = f.io.status;
        f.io.status = async () => ({ ...await status(), releases: [], operations: [], recoveryOperation: f.operation('failed', intent, null),
            recoveryRemoval: { state: 'removed' as const, releaseId: candidateId, hash: candidateHash, completedAt: 123 } });
        expect(await reconcileImportedPublication(f.io)).toMatchObject({ stage: 'terminal', outcome: 'failed', operationId });
        expect(f.calls).toHaveLength(1);
    });
    it('does not retire missing, mismatched or known-admitted removed switches', async () => {
        for (const change of ['missing', 'hash', 'release', 'time', 'admitted'] as const) {
            const f = publicationFixture(); f.markReviewed(); const intent = f.switchIntent();
            if (change !== 'admitted') f.buildError(new Error('lost'));
            if (change === 'admitted') await requestImportedPublication(f.io, intent);
            else await expect(requestImportedPublication(f.io, intent)).rejects.toThrow();
            const status = f.io.status;
            f.io.status = async () => ({ ...await status(), releases: [], operations: [], recoveryOperation: null,
                recoveryRemoval: change === 'missing' ? null : { state: 'removed' as const,
                    releaseId: change === 'release' ? 'other' as Id<'cloudReleases'> : candidateId,
                    hash: change === 'hash' ? 'c'.repeat(64) : candidateHash, completedAt: change === 'time' ? 0 : 123 } });
            f.buildError(new ConvexError('CLOUD_RELEASE_REMOVED'));
            if (change === 'admitted') expect((await reconcileImportedPublication(f.io)).stage).toBe('acknowledged');
            else await expect(reconcileImportedPublication(f.io)).rejects.toThrow('CLOUD_RELEASE_REMOVED');
            expect(publicationPending(readImportedPublication(f.storage, owner))).toBe(true);
        }
    });
    it('keeps completed records when cleanup is unavailable and fails closed on corrupt or cross-owner records', async () => {
        const f = publicationFixture(); await requestImportedPublication(f.io, f.reviewIntent());
        expect(readImportedPublication(f.storage, owner)?.stage).toBe('terminal');
        await requestImportedPublication(f.io, f.switchIntent()); expect(f.calls).toHaveLength(2);
        const at = [...f.saved.keys()][0]!, record = JSON.parse(f.saved.get(at)!); record.owner.branchId = 'another';
        f.saved.set(at, JSON.stringify(record)); expect(() => readImportedPublication(f.storage, owner)).toThrow('RECOVERY_UNAVAILABLE');
        const before = [...f.saved]; await expect(reconcileImportedPublication(f.io)).rejects.toThrow('RECOVERY_UNAVAILABLE'); expect([...f.saved]).toEqual(before);
    });
});
