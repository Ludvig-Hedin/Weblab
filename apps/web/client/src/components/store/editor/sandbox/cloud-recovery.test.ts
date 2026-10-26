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

describe('imported text recovery protocol', () => {
    it('retains exact v2 epochs while unknown or downgraded protocols stay download-only', () => {
        const record = contentRecord();
        record.operation.transportVersion = 2;
        record.operation.expectedContracts = [{ path: 'src/app/page.tsx', version: 2, generation: 3, designRevision: 1 }];
        const restored = cloudRecoveryOperation(record);
        expect(restored).not.toBeNull();
        expect(JSON.stringify(restored)).toBe(JSON.stringify(record.operation));
        expect(restored?.operationId).toBe(record.operation.operationId);
        for (const version of [0, 1, 3]) {
            const unknown = structuredClone(record);
            unknown.operation.transportVersion = version;
            expect(cloudRecoveryOperation(unknown)).toBeNull();
            expect(unknown.operation.changes[0]?.content).toBe('saved candidate');
        }
    });
    it('refuses absent, duplicate, stale, unexpected or cross-file v2 pins', () => {
        const record = contentRecord();
        record.operation.transportVersion = 2;
        const pin = { path: 'src/app/page.tsx', version: 2 as const, generation: 3, designRevision: 1 };
        for (const pins of [[], [pin, pin], [{ ...pin, path: 'src/app/other.tsx' }],
            [{ ...pin, generation: 0 }], [{ ...pin, designRevision: 2 }], [{ path: pin.path, generation: 3 }]]) {
            record.operation.expectedContracts = pins;
            expect(cloudRecoveryOperation(record)).toBeNull();
        }
        record.operation.expectedContracts = [pin];
        record.operation.changes[0]!.content = new Uint8Array([1]).buffer;
        expect(cloudRecoveryOperation(record)).toBeNull();
    });
});


describe('imported image recovery protocol', () => {
    it('preserves an exact imported image operation and refuses mixed or malformed replay pins', async () => {
        const record = contentRecord();
        delete record.operation.expectedContracts;
        record.operation.transport = 'content-image'; record.operation.transportVersion = 2; record.operation.expectedRevision = 4;
        const asset = { path: 'public/about.webp', hash: 'a'.repeat(64), bytes: 100 };
        record.operation.pin = { version: 2, path: 'src/content/about.ts', generation: 2, designRevision: 3, fingerprint: 'b'.repeat(64),
            binding: { bindingId: 'about', target: { kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' },
                fields: ['src', 'alt'], allowImageUploads: true, originalAsset: asset, allowedAssets: [asset], aspectRatio: { width: 16, height: 9 },
                renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about-hero',
                    callsite: { path: 'src/app/about/page.tsx', exportName: 'AboutPage', oid: 'mount' },
                    renderer: { path: 'src/components/page-hero.tsx', exportName: 'PageHero', oid: 'image' } } } };
        record.operation.previous = { src: '/about.webp', alt: 'Previous photo' };
        record.operation.image = { kind: 'values' };
        record.operation.changes = [{ path: 'src/content/about.ts', content: 'exact approved candidate' }];
        const f = storageFixture(undefined);
        await f.recovery.save(key, record);
        expect<unknown>(cloudRecoveryOperation((await f.recovery.load(key))!)).toEqual(record.operation);
        const upload = structuredClone(record);
        upload.operation.image = { kind: 'upload', attemptId: 'attempt' as Extract<NonNullable<CloudRecoveryRecord['operation']['image']>, { kind: 'upload' }>['attemptId'] };
        upload.operation.changes.push({ path: `public/weblab-upload-${'c'.repeat(64)}.webp`, content: new Uint8Array([1, 2, 3]).buffer });
        expect<unknown>(cloudRecoveryOperation(upload)).toEqual(upload.operation);
        for (const change of [
            (r: CloudRecoveryRecord) => { Reflect.set(r.operation, 'pin', 'broken'); },
            (r: CloudRecoveryRecord) => { r.operation.pin!.designRevision = 5; },
            (r: CloudRecoveryRecord) => { const pin = r.operation.pin!; if (!('binding' in pin)) throw Error('Expected image pin'); pin.binding.allowedAssets = new Array(1); },
            (r: CloudRecoveryRecord) => { r.operation.previous!.alt = '\ud800'; },
            (r: CloudRecoveryRecord) => { r.operation.transportVersion = 1; },
            (r: CloudRecoveryRecord) => { r.operation.expectedContracts = []; },
            (r: CloudRecoveryRecord) => { r.operation.image = { kind: 'values' }; },
            (r: CloudRecoveryRecord) => { r.operation.changes[1]!.path += '\n'; },
            (r: CloudRecoveryRecord) => { r.operation.changes[1]!.content = new ArrayBuffer(600001); },
            (r: CloudRecoveryRecord) => { Reflect.set(r.operation.pin!, 'actorId', 'other'); },
        ]) {
            const invalid = structuredClone(upload); change(invalid);
            expect(cloudRecoveryOperation(invalid)).toBeNull();
        }
        const changed = structuredClone(record); changed.operation.pin!.generation++;
        await expect(f.recovery.save(key, changed)).rejects.toThrow('Browser recovery');
        expect((f.stored() as CloudRecoveryRecord).operation).toEqual(record.operation);
    });

});
