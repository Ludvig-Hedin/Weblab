import { describe, expect, it } from 'bun:test';

import {
    cloudRecoveryOperation,
    CloudRecoveryStorageError,
    IndexedDbCloudRecoveryStore,
    storedCloudRecoveryRecord,
    type CloudRecoveryKey,
    type CloudRecoveryRecord,
} from './cloud-recovery';

const key = { projectId: 'project', branchId: 'branch', actorId: 'actor' } as CloudRecoveryKey;
function contentRecord(): CloudRecoveryRecord {
    return {
        version: 2, actorId: key.actorId, ambiguous: true, disposition: 'pending', createdAt: Date.now(),
        operation: {
            ...key, actorId: key.actorId as CloudRecoveryRecord['operation']['actorId'],
            expectedRevision: 1, operationId: 'content-operation-1234', transport: 'content', transportVersion: 1,
            changes: [{ path: 'src/app/page.tsx', content: 'saved candidate' }],
            expectedContracts: [{ path: 'src/app/page.tsx', generation: 3 }],
        },
    };
}

/** Exercise the atomic read/compare/write callback without opening real browser storage. */
function storageFixture(initial: unknown) {
    let stored: unknown = structuredClone(initial);
    let writes = 0;
    let deletes = 0;
    const recovery = new IndexedDbCloudRecoveryStore();
    Object.defineProperty(recovery, 'transact', {
        value: async (_mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<unknown>) => {
            let aborted = false;
            const request = {
                result: structuredClone(stored), onsuccess: null,
                transaction: { abort: () => { aborted = true; } },
            } as unknown as IDBRequest<unknown>;
            const store = {
                get: () => request,
                put: (value: unknown) => { writes++; stored = structuredClone(value); },
                delete: () => { deletes++; stored = undefined; },
            } as unknown as IDBObjectStore;
            run(store);
            request.onsuccess?.call(request, {} as Event);
            if (aborted) throw new CloudRecoveryStorageError();
            return request.result;
        },
    });
    return { recovery, stored: () => stored, writes: () => writes, deletes: () => deletes };
}

describe('cloud recovery protocol ownership', () => {
    it('stores oversized and unparsable local-only proposals without making them retryable', async () => {
        const record = contentRecord();
        record.operation.transport = 'local-only';
        delete record.operation.expectedContracts;
        record.disposition = 'rejected';
        record.ambiguous = false;
        record.definitiveRejection = true;
        record.operation.changes = [{ path: 'broken.tsx', content: '<unfinished' + 'x'.repeat(2_000_000) },
            { path: 'image.bin', content: new Uint8Array([0, 255]).buffer }];
        const f = storageFixture(undefined);
        await f.recovery.save(key, record);
        expect(await f.recovery.load(key)).toEqual(record);
        expect(cloudRecoveryOperation(record)).toBeNull();
        for (const invalid of [{ ...record, ambiguous: true }, { ...record, disposition: 'pending' }, { ...record, definitiveRejection: false }])
            expect(() => storedCloudRecoveryRecord(invalid, key)).toThrow('Browser recovery');
    });

    it('cannot replace or discard an existing transport journal with a local-only attempt', async () => {
        const old = contentRecord();
        const local = { ...old, ambiguous: false, disposition: 'rejected' as const, definitiveRejection: true,
            operation: { ...old.operation, operationId: 'local-attempt-12345', transport: 'local-only', expectedContracts: undefined } };
        const f = storageFixture(old);
        await expect(f.recovery.save(key, local)).rejects.toThrow('Browser recovery');
        await expect(f.recovery.remove(key, local.operation.operationId)).rejects.toThrow('Browser recovery');
        expect(f.stored()).toEqual(old);
        expect(f.writes()).toBe(0);
        expect(f.deletes()).toBe(0);
    });

    it('retains unknown versions for backup while refusing to select an endpoint', () => {
        const record = contentRecord();
        record.operation.transportVersion = 9;
        expect(storedCloudRecoveryRecord(record, key)).toEqual(record);
        expect(cloudRecoveryOperation(record)).toBeNull();
        record.version = 3;
        record.operation.transportVersion = 1;
        expect(storedCloudRecoveryRecord(record, key)).toEqual(record);
        expect(cloudRecoveryOperation(record)).toBeNull();
    });

    it('requires a one-to-one generation pin for every content candidate', () => {
        const record = contentRecord();
        expect(cloudRecoveryOperation(record)?.transport).toBe('content');
        record.operation.expectedContracts = [{ path: 'src/app/other/page.tsx', generation: 3 }];
        expect(cloudRecoveryOperation(record)).toBeNull();
        record.operation.expectedContracts = [{ path: 'src/app/page.tsx', generation: 0 }];
        expect(cloudRecoveryOperation(record)).toBeNull();
        record.operation.expectedContracts = [{ path: 'src/app/page.tsx', generation: 3 }];
        record.operation.changes[0]!.content = null;
        expect(cloudRecoveryOperation(record)).toBeNull();
    });

    it('aborts save and removal when existing storage is malformed', async () => {
        for (const malformed of [{}, { version: 2, operation: null }, { ...contentRecord(), actorId: 'someone-else' }]) {
            const f = storageFixture(malformed);
            await expect(f.recovery.save(key, contentRecord())).rejects.toThrow('Browser recovery storage');
            await expect(f.recovery.remove(key, contentRecord().operation.operationId)).rejects.toThrow('Browser recovery storage');
            expect(f.writes()).toBe(0);
            expect(f.deletes()).toBe(0);
            expect(f.stored()).toEqual(malformed);
        }
    });

    it('never overwrites a matching operation ID with another transport, generation or payload', async () => {
        const original = contentRecord();
        for (const mutation of [
            (record: CloudRecoveryRecord) => { record.operation.transport = 'design'; delete record.operation.expectedContracts; },
            (record: CloudRecoveryRecord) => { record.operation.expectedContracts![0]!.generation++; },
            (record: CloudRecoveryRecord) => { record.operation.changes[0]!.content = 'different candidate'; },
        ]) {
            const f = storageFixture(original);
            const changed = structuredClone(original);
            mutation(changed);
            await expect(f.recovery.save(key, changed)).rejects.toThrow('Browser recovery storage');
            expect(f.writes()).toBe(0);
            expect(f.stored()).toEqual(original);
        }
    });

    it('allows only the equivalent legacy designer operation to gain explicit protocol metadata', async () => {
        const original = contentRecord();
        original.version = 1;
        delete original.operation.transport;
        delete original.operation.transportVersion;
        delete original.operation.expectedContracts;
        const f = storageFixture(original);
        const operation = cloudRecoveryOperation(original)!;
        expect(operation.transport).toBe('design');
        await f.recovery.save(key, { ...original, version: 2, operation });
        expect(f.writes()).toBe(1);
        expect((f.stored() as CloudRecoveryRecord).operation.transport).toBe('design');
    });
});
