import { describe, expect, it } from 'bun:test';
import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import { ReleaseSession } from './session';
import { checkPreviousRemoval, guardVersionRemoval, inspectVersionRemoval, previousRemovalNeedsCheck, readRemovalBeginRequest, removalBeginRequest, removeVersion } from './version-removal';
import type { CloudRemovalBeginArgs, CloudRemovalContinueArgs, CloudRemovalInspection, CloudRemovalProgress, CloudRemovalResult, CloudVersionMetadata } from './version-removal';

const actorId = 'users:owner' as Id<'users'>, otherActor = 'users:agency' as Id<'users'>;
const releaseId = 'cloudReleases:saved' as Id<'cloudReleases'>;
const confirmation = { releaseId, expectedHash: 'a'.repeat(64), expectedStatus: 'frozen' as const, expectedRevision: 8 };
const version: CloudVersionMetadata = { id: releaseId, projectId: 'projects:site' as Id<'projects'>, branchId: 'branches:main' as Id<'branches'>, workspaceId: 'workspaces:agency' as Id<'workspaces'>, projectName: 'Site', revision: 8, createdAt: 10, kind: 'backup', status: 'frozen', profile: 'imported-next-v1' };
const available = { state: 'available' as const, version, confirmation };
class MemoryStorage {
    values = new Map<string, string>(); refuseWrite = false; refuseRemove = false;
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { if (this.refuseWrite) throw Error('quota'); this.values.set(key, value); }
    removeItem(key: string) { if (this.refuseRemove) throw Error('quota'); this.values.delete(key); }
}
function fixture() {
    let mounted = true, ownerCurrent = true;
    const controller = new AbortController(), storage = new MemoryStorage();
    const session = new ReleaseSession({ backend: 'https://fixture.convex.cloud', current: () => ownerCurrent, getToken: async () => 'synthetic-token', signal: controller.signal });
    const begins: CloudRemovalBeginArgs[] = [], continues: CloudRemovalContinueArgs[] = [], updates: CloudRemovalProgress[] = [];
    let receipt: CloudRemovalProgress | null = null;
    const progress = (args: CloudRemovalBeginArgs): CloudRemovalProgress => ({ version: 1, releaseId, operationKey: args.operationKey, initiatorActorId: args.expectedActorId, confirmation, requestedAt: 100, phase: 'files', completedAt: null });
    const input = { actorId, session, current: () => mounted, storage, selection: available,
        begin: async (args: CloudRemovalBeginArgs): Promise<CloudRemovalResult> => { begins.push(args); receipt ??= progress(args); return { actorId, progress: receipt }; },
        continueRemoval: async (args: CloudRemovalContinueArgs): Promise<CloudRemovalResult> => {
            continues.push(args); if (!receipt) throw Error('missing receipt');
            return { actorId: args.expectedExecutorActorId, progress: { ...receipt, phase: 'done', completedAt: 200 } };
        }, onProgress: (value: CloudRemovalProgress) => updates.push(value),
    };
    return { input, storage, begins, continues, updates, progress, session, controller,
        unmount: () => { mounted = false; }, changeOwner: () => { ownerCurrent = false; } };
}

describe('explicit saved-version removal', () => {
    it('sends the confirmed hash/status/revision and requires a done receipt', async () => {
        const f = fixture(), done = await removeVersion(f.input);
        expect(f.begins).toHaveLength(1);
        expect(f.begins[0]).toEqual({ ...confirmation, expectedActorId: actorId, operationKey: done.operationKey });
        expect(f.continues).toEqual([{ releaseId, operationKey: done.operationKey, initiatorActorId: actorId, expectedExecutorActorId: actorId }]);
        expect(f.updates.map(p => p.phase)).toEqual(['files', 'done']);
        expect(done.completedAt).toBe(200); expect(f.storage.values.size).toBe(0);
    });
    it('reuses the exact persisted begin after a lost reply and remount', async () => {
        const f = fixture(), requests: CloudRemovalBeginArgs[] = [];
        await expect(removeVersion({ ...f.input, begin: async args => { requests.push(args); await f.input.begin(args); throw Error('reply lost'); } })).rejects.toThrow('reply lost');
        expect(f.storage.values.size).toBe(1); expect(f.updates).toHaveLength(0);
        const next = fixture();
        await removeVersion({ ...next.input, storage: f.storage, begin: async args => { requests.push(args); return f.input.begin(args); }, continueRemoval: f.input.continueRemoval });
        expect(requests[1]).toEqual(requests[0]); expect(f.storage.values.size).toBe(0);
    });
    it('does not dispatch after unmount or session/scope change', async () => {
        for (const change of ['unmount', 'changeOwner'] as const) {
            const f = fixture(); f[change]();
            await expect(removeVersion(f.input)).rejects.toThrow('SESSION_CHANGED');
            expect(f.begins).toHaveLength(0); expect(f.storage.values.size).toBe(0);
        }
    });
    it('checks mount again after captured-session token refresh and before first dispatch', async () => {
        const f = fixture(); let sendCount = 0;
        let resolveToken: (token: string) => void = () => { throw Error('not initialized'); };
        const token = new Promise<string>(resolve => { resolveToken = resolve; });
        const session = new ReleaseSession({ backend: 'https://fixture.convex.cloud', current: () => true, getToken: () => token, signal: new AbortController().signal });
        const guard = { ...f.input, session };
        const attempt = removeVersion({ ...guard, begin: args => session.call(async () => {
            guardVersionRemoval(guard); sendCount++; return f.input.begin(args);
        }) });
        f.unmount(); resolveToken('captured-synthetic-session-token');
        await expect(attempt).rejects.toThrow('SESSION_CHANGED');
        expect(sendCount).toBe(0); expect(f.storage.values.size).toBe(1);
    });
    it('stops after unmount during begin without claiming progress or continuing', async () => {
        const f = fixture();
        await expect(removeVersion({ ...f.input, begin: async args => { const result = await f.input.begin(args); f.unmount(); return result; } })).rejects.toThrow('SESSION_CHANGED');
        expect(f.continues).toHaveLength(0); expect(f.updates).toHaveLength(0); expect(f.storage.values.size).toBe(1);
    });
    it('stops after account change during continuation and retains recovery', async () => {
        const f = fixture();
        await expect(removeVersion({ ...f.input, continueRemoval: async args => { const result = await f.input.continueRemoval(args); f.changeOwner(); return result; } })).rejects.toThrow('SESSION_CHANGED');
        expect(f.updates.map(p => p.phase)).toEqual(['files']); expect(f.storage.values.size).toBe(1);
    });
    it('allows another agency executor only with the original server receipt', async () => {
        const f = fixture(), request = removalBeginRequest(f.storage, actorId, confirmation);
        const receipt = (await f.input.begin(request)).progress;
        if (receipt.phase === 'done') throw Error('fixture');
        const done = await removeVersion({ ...f.input, actorId: otherActor, selection: { state: 'removing', version, progress: receipt } });
        expect(f.begins).toHaveLength(1);
        expect(f.continues[0]).toEqual({ releaseId, operationKey: request.operationKey, initiatorActorId: actorId, expectedExecutorActorId: otherActor });
        expect(done.initiatorActorId).toBe(actorId);
        expect(f.storage.values.size).toBe(1); // Another executor cannot clear the initiator's journal.
    });
    it('refuses every changed receipt pin even if the response says done', async () => {
        const changes: Partial<CloudRemovalProgress>[] = [
            { releaseId: 'cloudReleases:other' as Id<'cloudReleases'> }, { initiatorActorId: otherActor }, { operationKey: 'different-operation-key' },
            { confirmation: { ...confirmation, expectedRevision: 9 } }, { requestedAt: 101 },
        ];
        for (const changed of changes) {
            const f = fixture();
            await expect(removeVersion({ ...f.input, continueRemoval: async args => { const reply = await f.input.continueRemoval(args); return { ...reply, progress: { ...reply.progress, ...changed } as CloudRemovalProgress }; } })).rejects.toThrow('RECEIPT_CHANGED');
            expect(f.updates.map(p => p.phase)).toEqual(['files']); expect(f.storage.values.size).toBe(1);
        }
    });
    it('rejects a reply for a different current actor', async () => {
        const f = fixture();
        await expect(removeVersion({ ...f.input, begin: async args => ({ ...(await f.input.begin(args)), actorId: otherActor }) })).rejects.toThrow('RECEIPT_CHANGED');
        expect(f.updates).toHaveLength(0); expect(f.continues).toHaveLength(0);
    });
    it('cannot send without durable recovery and does not misreport cleanup failure', async () => {
        const f = fixture(); f.storage.refuseWrite = true;
        await expect(removeVersion(f.input)).rejects.toThrow('RECOVERY_UNAVAILABLE'); expect(f.begins).toHaveLength(0);
        f.storage.refuseWrite = false; f.storage.refuseRemove = true;
        expect((await removeVersion(f.input)).phase).toBe('done'); expect(f.storage.values.size).toBe(1);
    });
    it('refuses to replace an unknown request with changed confirmation', () => {
        const f = fixture(), request = removalBeginRequest(f.storage, actorId, confirmation);
        expect(() => removalBeginRequest(f.storage, actorId, { ...confirmation, expectedHash: 'b'.repeat(64) })).toThrow('PREVIOUS_REQUEST');
        expect(removalBeginRequest(f.storage, actorId, confirmation)).toEqual(request);
    });
    it('clears only definitive begin refusals, never continuation or untyped failures', async () => {
        for (const code of ['CLOUD_RELEASE_REMOVAL_CHANGED', 'CLOUD_RELEASE_REMOVAL_BLOCKED']) {
            const f = fixture();
            await expect(removeVersion({ ...f.input, begin: async () => { throw new ConvexError(code); } })).rejects.toThrow(code);
            expect(f.storage.values.size).toBe(0);
            await expect(removeVersion({ ...f.input, begin: async () => { throw new Error(code); } })).rejects.toThrow(code);
            expect(f.storage.values.size).toBe(1);
            await expect(removeVersion({ ...f.input, continueRemoval: async () => { throw new ConvexError(code); } })).rejects.toThrow(code);
            expect(f.storage.values.size).toBe(1);
        }
    });
    it('reconciles a lost precommit request after capture becomes frozen without replacing its identity', async () => {
        const f = fixture(), old = { ...confirmation, expectedHash: null, expectedStatus: 'captured' as const };
        const sent: CloudRemovalBeginArgs[] = [];
        await expect(removeVersion({ ...f.input, selection: { ...available, confirmation: old }, begin: async args => {
            sent.push(args); throw Error('reply lost before commit');
        } })).rejects.toThrow('reply lost');
        expect(previousRemovalNeedsCheck(f.storage, actorId, confirmation)).toBe(true);
        expect(() => removalBeginRequest(f.storage, actorId, confirmation)).toThrow('PREVIOUS_REQUEST');
        await expect(checkPreviousRemoval({ ...f.input, releaseId, begin: async args => {
            sent.push(args); throw new ConvexError('CLOUD_RELEASE_REMOVAL_CHANGED');
        } })).rejects.toThrow('CLOUD_RELEASE_REMOVAL_CHANGED');
        expect(sent).toEqual([sent[0]!, sent[0]!]);
        expect(sent[1]?.expectedStatus).toBe('captured'); expect(sent[1]?.expectedHash).toBeNull();
        expect(readRemovalBeginRequest(f.storage, actorId, releaseId)).toBeNull();
        expect(f.continues).toHaveLength(0);
        // Only a subsequent explicit confirmation creates this new operation.
        const fresh = removalBeginRequest(f.storage, actorId, confirmation);
        expect(fresh.operationKey).not.toBe(sent[0]!.operationKey); expect(fresh.expectedHash).toBe(confirmation.expectedHash);
    });
    it('checking an unknown request retains it on another lost reply and never continues deletion', async () => {
        const f = fixture(), request = removalBeginRequest(f.storage, actorId, confirmation);
        await expect(checkPreviousRemoval({ ...f.input, releaseId, begin: async () => { throw Error('unknown'); } })).rejects.toThrow('unknown');
        expect(readRemovalBeginRequest(f.storage, actorId, releaseId)).toEqual(request);
        const progress = await checkPreviousRemoval({ ...f.input, releaseId });
        expect(progress.phase).toBe('files'); expect(f.continues).toHaveLength(0);
        expect(readRemovalBeginRequest(f.storage, actorId, releaseId)).toEqual(request);
        await expect(checkPreviousRemoval({ ...f.input, actorId: otherActor, releaseId })).rejects.toThrow('PREVIOUS_REQUEST');
        expect(f.begins).toHaveLength(1);
    });
    it('checking a previous request clears only an exact authorized done receipt', async () => {
        const f = fixture(), request = removalBeginRequest(f.storage, actorId, confirmation);
        const done = { ...f.progress(request), phase: 'done' as const, completedAt: 200 };
        await expect(checkPreviousRemoval({ ...f.input, releaseId, begin: async () => ({ actorId, progress: { ...done, operationKey: 'another-operation' } }) })).rejects.toThrow('RECEIPT_CHANGED');
        expect(readRemovalBeginRequest(f.storage, actorId, releaseId)).toEqual(request);
        expect((await checkPreviousRemoval({ ...f.input, releaseId, begin: async () => ({ actorId, progress: done }) })).phase).toBe('done');
        expect(readRemovalBeginRequest(f.storage, actorId, releaseId)).toBeNull();
    });
    it('inspection does not mutate, accepts blocked results and rejects stale actors or late unmount', async () => {
        const f = fixture();
        const inspect = async (): Promise<CloudRemovalInspection> => ({ actorId, result: { state: 'blocked', version, reason: 'live-version', dependentVersion: null } });
        expect((await inspectVersionRemoval({ ...f.input, releaseId, inspect })).result.state).toBe('blocked');
        await expect(inspectVersionRemoval({ ...f.input, releaseId, inspect: async () => ({ ...(await inspect()), actorId: otherActor }) })).rejects.toThrow('SESSION_CHANGED');
        await expect(inspectVersionRemoval({ ...f.input, releaseId, inspect: async () => { f.unmount(); return inspect(); } })).rejects.toThrow('SESSION_CHANGED');
        expect(f.begins).toHaveLength(0);
    });
});
