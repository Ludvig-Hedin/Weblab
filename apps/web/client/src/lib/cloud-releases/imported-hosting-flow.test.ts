import { describe, expect, it } from 'bun:test';
import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import { saveImportedReviewSource, resumeImportedPreparation, prepareImportedPrivateReview, readImportedPreparation, preparationPending,
    privateBuildIntent, requestImportedPrivateBuild, reconcileImportedPrivateBuild, readImportedBuild,
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
        request: async args => { calls.push({ kind: 'build', args }); if (buildError) throw buildError; return operationId; },
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
