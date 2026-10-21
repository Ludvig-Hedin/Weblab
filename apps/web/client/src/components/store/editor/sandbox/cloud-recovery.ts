import { validateCloudChanges } from '@convex/lib/cloudEditor';

import type {
    CloudEditorCommit,
    CloudImageOperation,
    CloudEditorScope,
    CloudSourceOperation,
    CloudSemanticOperation,
} from '@/lib/cloud-editor/api';

export type CloudRecoveryKey = CloudEditorScope & { actorId: string };
export type CloudRecoveryOperation = CloudEditorCommit & {
    transport?: string;
    transportVersion?: number;
    expectedContracts?: Array<{ path: string; generation: number }>;
    image?: CloudImageOperation['image'];
    expectedGeneration?: number;
    operation?: CloudSemanticOperation['operation'];
};
export type CloudRecoveryRecord = {
    version: number;
    actorId: string;
    operation: CloudRecoveryOperation;
    ambiguous: boolean;
    disposition: 'pending' | 'rejected';
    definitiveRejection?: boolean;
    createdAt: number;
};

export interface CloudRecoveryStore {
    load(key: CloudRecoveryKey): Promise<CloudRecoveryRecord | null>;
    save(key: CloudRecoveryKey, record: CloudRecoveryRecord): Promise<void>;
    remove(key: CloudRecoveryKey, operationId: string): Promise<void>;
}

export class CloudRecoveryStorageError extends Error {
    constructor() {
        super(
            'Browser recovery storage is unavailable. Keep this tab open and download your changes.',
        );
        this.name = 'CloudRecoveryStorageError';
    }
}

function recoveryKey(key: CloudRecoveryKey): string {
    return JSON.stringify([key.actorId, key.projectId, key.branchId]);
}

export function storedCloudRecoveryRecord(
    value: unknown,
    key: CloudRecoveryKey,
): CloudRecoveryRecord | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) throw new CloudRecoveryStorageError();
    const record = value as Partial<CloudRecoveryRecord>;
    const operation = record.operation;
    if (
        !Number.isSafeInteger(record.version) ||
        record.version! < 1 ||
        record.actorId !== key.actorId ||
        operation?.projectId !== key.projectId ||
        operation.branchId !== key.branchId ||
        operation.actorId !== key.actorId ||
        !Array.isArray(operation.changes) ||
        !Number.isSafeInteger(operation.expectedRevision) ||
        operation.expectedRevision < 0 ||
        typeof operation.operationId !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(operation.operationId) ||
        typeof record.ambiguous !== 'boolean' ||
        !Number.isFinite(record.createdAt) ||
        (record.definitiveRejection !== undefined &&
            typeof record.definitiveRejection !== 'boolean') ||
        (record.disposition !== 'pending' && record.disposition !== 'rejected')
    )
        throw new CloudRecoveryStorageError();
    try {
        if (operation.transport === 'local-only') {
            if (record.version !== 2 || operation.transportVersion !== 1 ||
                operation.expectedContracts !== undefined || record.ambiguous ||
                record.disposition !== 'rejected' || record.definitiveRejection !== true)
                throw new CloudRecoveryStorageError();
            // A failed local proposal is download-only. Do not discard its bytes
            // because it exceeds the server's commit limits or cannot be parsed.
            if (operation.changes.some((change) => typeof change?.path !== 'string'))
                throw new CloudRecoveryStorageError();
        } else if (operation.transport === 'studio' || operation.transport === 'journal') {
            if (record.version !== 2 || operation.transportVersion !== 1 || !validSemanticOperation(operation))
                throw new CloudRecoveryStorageError();
        } else validateCloudChanges(operation.changes);
        if (
            operation.changes.some(
                (change) =>
                    !change ||
                    typeof change !== 'object' ||
                    (change.content !== null &&
                        typeof change.content !== 'string' &&
                        !(change.content instanceof ArrayBuffer)) ||
                    (change.directory !== undefined && typeof change.directory !== 'boolean'),
            )
        )
            throw new CloudRecoveryStorageError();
    } catch {
        throw new CloudRecoveryStorageError();
    }
    return record as CloudRecoveryRecord;
}

/** Unknown protocols remain downloadable, but can never choose a save endpoint. */
export function cloudRecoveryOperation(record: CloudRecoveryRecord): CloudSourceOperation | null {
    const operation = record.operation;
    if (record.version === 1) {
        if (
            operation.transport !== undefined ||
            operation.transportVersion !== undefined ||
            operation.expectedContracts !== undefined
        )
            return null;
        return { ...operation, transport: 'design', transportVersion: 1 };
    }
    if (record.version !== 2 || operation.transportVersion !== 1) return null;
    if (operation.transport === 'studio' || operation.transport === 'journal')
        return validSemanticOperation(operation) ? operation as CloudSemanticOperation : null;
    if (operation.transport === 'content-image') {
        const pin = operation.image;
        if (!pin || typeof pin.attemptId !== 'string' || typeof pin.path !== 'string' || typeof pin.oid !== 'string' ||
            !Number.isSafeInteger(pin.generation) || pin.generation < 1 ||
            !/^public\/weblab-upload-[a-f0-9]{64}\.webp$/.test(pin.assetPath) || operation.expectedContracts !== undefined ||
            operation.changes.length < 1 || operation.changes.length > 2 ||
            !operation.changes.some(c => c.path === pin.path && typeof c.content === 'string') ||
            operation.changes.some(c => c.directory !== undefined || (c.path === pin.path ? typeof c.content !== 'string' : c.path !== pin.assetPath || !(c.content instanceof ArrayBuffer)))) return null;
        return operation as CloudImageOperation;
    }
    if (operation.transport === 'design' && operation.expectedContracts === undefined)
        return operation as CloudSourceOperation;
    if (
        operation.transport !== 'content' ||
        !Array.isArray(operation.expectedContracts) ||
        operation.expectedContracts.length !== operation.changes.length ||
        operation.changes.some(
            (change) => typeof change.content !== 'string' || change.directory !== undefined,
        )
    )
        return null;
    const paths = new Set(operation.changes.map((change) => change.path));
    for (const contract of operation.expectedContracts) {
        if (
            !contract ||
            !paths.delete(contract.path) ||
            !Number.isSafeInteger(contract.generation) ||
            contract.generation < 1
        )
            return null;
    }
    return paths.size === 0 ? (operation as CloudSourceOperation) : null;
}

/** A restored semantic request can only select one of the two fixed, validated server actions. */
export function validSemanticOperation(operation: CloudRecoveryOperation): boolean {
    if (operation.changes.length !== 0 || operation.image !== undefined || operation.expectedContracts !== undefined ||
        !Number.isSafeInteger(operation.expectedGeneration) || operation.expectedGeneration! < 0 ||
        !operation.operation || typeof operation.operation !== 'object' || Array.isArray(operation.operation)) return false;
    const kinds = operation.transport === 'studio'
        ? ['install', 'configure', 'approveSlot', 'createPage', 'insertBlock', 'moveBlock', 'removeBlock']
        : operation.transport === 'journal' ? ['save', 'archive', 'restore'] : [];
    if (!kinds.includes(operation.operation.kind)) return false;
    try { return new TextEncoder().encode(JSON.stringify(operation.operation)).byteLength <= 200_000; }
    catch { return false; }
}

function sameOperation(left: CloudRecoveryRecord, right: CloudRecoveryRecord): boolean {
    const canonical = (record: CloudRecoveryRecord) =>
        JSON.stringify(
            cloudRecoveryOperation(record) ?? record.operation,
            (_key, value: unknown) => {
                if (value instanceof ArrayBuffer)
                    return { binary: Array.from(new Uint8Array(value)) };
                if (value && typeof value === 'object' && !Array.isArray(value))
                    return Object.fromEntries(
                        Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
                    );
                return value;
            },
        );
    return canonical(left) === canonical(right);
}

/** IndexedDB preserves ArrayBuffers without converting binary edits to text. */
export class IndexedDbCloudRecoveryStore implements CloudRecoveryStore {
    private async database(): Promise<IDBDatabase> {
        if (typeof indexedDB === 'undefined') throw new CloudRecoveryStorageError();
        return new Promise((resolve, reject) => {
            let rejected = false;
            const request = indexedDB.open('weblab-cloud-source-recovery', 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore('attempts');
            };
            request.onsuccess = () => {
                if (rejected) request.result.close();
                else resolve(request.result);
            };
            request.onerror = () => reject(new CloudRecoveryStorageError());
            request.onblocked = () => {
                rejected = true;
                reject(new CloudRecoveryStorageError());
            };
        });
    }

    private async transact(
        mode: IDBTransactionMode,
        run: (store: IDBObjectStore) => IDBRequest<unknown>,
    ): Promise<unknown> {
        const db = await this.database();
        try {
            return await new Promise<unknown>((resolve, reject) => {
                const tx = db.transaction(
                    'attempts',
                    mode,
                    mode === 'readwrite' ? { durability: 'strict' } : undefined,
                );
                const request = run(tx.objectStore('attempts'));
                tx.oncomplete = () => resolve(request.result);
                tx.onerror = () => reject(new CloudRecoveryStorageError());
                tx.onabort = () => reject(new CloudRecoveryStorageError());
            });
        } catch {
            throw new CloudRecoveryStorageError();
        } finally {
            db.close();
        }
    }

    async load(key: CloudRecoveryKey): Promise<CloudRecoveryRecord | null> {
        const record = await this.transact(
            'readonly',
            (store) => store.get(recoveryKey(key)) as IDBRequest<unknown>,
        );
        return storedCloudRecoveryRecord(record, key);
    }

    async save(key: CloudRecoveryKey, record: CloudRecoveryRecord): Promise<void> {
        storedCloudRecoveryRecord(record, key);
        if (
            record.actorId !== key.actorId ||
            record.operation.projectId !== key.projectId ||
            record.operation.branchId !== key.branchId ||
            record.operation.actorId !== key.actorId
        )
            throw new CloudRecoveryStorageError();
        await this.transact('readwrite', (store) => {
            const request = store.get(recoveryKey(key)) as IDBRequest<unknown>;
            request.onsuccess = () => {
                let current: CloudRecoveryRecord | null;
                try {
                    current = storedCloudRecoveryRecord(request.result, key);
                } catch {
                    request.transaction?.abort();
                    return;
                }
                if (
                    current &&
                    (current.operation.operationId !== record.operation.operationId ||
                        !sameOperation(current, record))
                ) {
                    request.transaction?.abort();
                    return;
                }
                const definitiveRejection =
                    record.definitiveRejection === true || current?.definitiveRejection === true;
                const ambiguous =
                    !definitiveRejection && (record.ambiguous || current?.ambiguous === true);
                store.put(
                    {
                        ...record,
                        definitiveRejection,
                        ambiguous,
                        disposition: definitiveRejection
                            ? 'rejected'
                            : ambiguous
                              ? 'pending'
                              : record.disposition,
                        createdAt: current?.createdAt ?? record.createdAt,
                    },
                    recoveryKey(key),
                );
            };
            return request;
        });
    }

    async remove(key: CloudRecoveryKey, operationId: string): Promise<void> {
        await this.transact('readwrite', (store) => {
            const request = store.get(recoveryKey(key)) as IDBRequest<unknown>;
            request.onsuccess = () => {
                let current: CloudRecoveryRecord | null;
                try {
                    current = storedCloudRecoveryRecord(request.result, key);
                } catch {
                    request.transaction?.abort();
                    return;
                }
                if (current && current.operation.operationId !== operationId) {
                    request.transaction?.abort();
                    return;
                }
                if (current) store.delete(recoveryKey(key));
            };
            return request;
        });
    }
}
