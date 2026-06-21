'use client';

import localforage from 'localforage';

export type QueueOp = 'write' | 'delete' | 'rename' | 'mkdir';

export interface QueueRecord {
    id: string;
    projectId: string;
    branchId: string;
    op: QueueOp;
    path: string;
    oldPath?: string;
    contentRef?: string;
    baseHash?: string;
    enqueuedAt: number;
    attempts: number;
    lastError?: string;
}

let metaStorePromise: Promise<LocalForage> | null = null;
let blobStorePromise: Promise<LocalForage> | null = null;
let deadStorePromise: Promise<LocalForage> | null = null;

function makeStore(storeName: string): Promise<LocalForage> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('write-queue is browser-only'));
    }
    return Promise.resolve(
        localforage.createInstance({
            name: 'weblab',
            storeName,
            description: 'Weblab offline write queue',
        }),
    );
}

function getMetaStore(): Promise<LocalForage> {
    metaStorePromise ??= makeStore('offline-queue');
    return metaStorePromise;
}

function getBlobStore(): Promise<LocalForage> {
    blobStorePromise ??= makeStore('offline-queue-blobs');
    return blobStorePromise;
}

function getDeadStore(): Promise<LocalForage> {
    deadStorePromise ??= makeStore('offline-queue-dead');
    return deadStorePromise;
}

/**
 * Lexicographically-sortable id (timestamp + random suffix). Avoids the
 * dependency footprint of a full ULID library while still preserving enqueue
 * order under monotonic-clock conditions.
 */
function makeId(): string {
    const ts = Date.now().toString(36).padStart(9, '0');
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 8);
    return `${ts}-${rand}`;
}

// Serialize enqueues so each record's coalesce (`supersedePriorRecords`) runs
// against the fully-committed state of the prior enqueue. Without this, two
// concurrent writes to the same path each run their supersede pass against the
// pre-insert state (neither sees the other) and BOTH records survive — which
// defeats coalescing and can log a spurious conflict from a stale `baseHash`
// on replay. The queue is an offline buffer, so global serialization is cheap.
let enqueueLock: Promise<unknown> = Promise.resolve();

export function enqueue(
    record: Omit<QueueRecord, 'id' | 'enqueuedAt' | 'attempts'> & {
        content?: string | Uint8Array;
    },
): Promise<QueueRecord> {
    const result = enqueueLock.then(() => enqueueInner(record));
    // Keep the chain alive even if this enqueue rejects.
    enqueueLock = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

async function enqueueInner(
    record: Omit<QueueRecord, 'id' | 'enqueuedAt' | 'attempts'> & {
        content?: string | Uint8Array;
    },
): Promise<QueueRecord> {
    const id = makeId();
    const meta: QueueRecord = {
        id,
        projectId: record.projectId,
        branchId: record.branchId,
        op: record.op,
        path: record.path,
        oldPath: record.oldPath,
        baseHash: record.baseHash,
        enqueuedAt: Date.now(),
        attempts: 0,
        contentRef: record.content !== undefined ? id : undefined,
    };

    // Coalesce: drop prior unreplayed writes/mkdirs/deletes for the same path
    // before inserting this new one. Without this a single offline session
    // with rapid auto-saves bloats the queue (and the blob store) by orders
    // of magnitude. We only coalesce within the same project + branch.
    if (record.op === 'write' || record.op === 'delete' || record.op === 'mkdir') {
        await supersedePriorRecords(record.projectId, record.branchId, record.path, [
            'write',
            'mkdir',
            'delete',
        ]);
    } else if (record.op === 'rename' && record.oldPath) {
        // A rename invalidates any pending edits to the OLD path — once the
        // file moves, those writes were targeting a path that no longer
        // exists. Pending writes to the NEW path are kept.
        await supersedePriorRecords(record.projectId, record.branchId, record.oldPath, [
            'write',
            'mkdir',
            'delete',
            'rename',
        ]);
    }

    if (record.content !== undefined) {
        const blobs = await getBlobStore();
        await blobs.setItem(id, record.content);
    }
    const store = await getMetaStore();
    await store.setItem(id, meta);
    return meta;
}

async function supersedePriorRecords(
    projectId: string,
    branchId: string,
    path: string,
    ops: QueueOp[],
): Promise<void> {
    const store = await getMetaStore();
    const blobs = await getBlobStore();
    const toDelete: QueueRecord[] = [];
    await store.iterate<QueueRecord, void>((rec) => {
        if (!rec) return;
        if (rec.projectId !== projectId) return;
        if (rec.branchId !== branchId) return;
        if (rec.path !== path) return;
        if (!ops.includes(rec.op)) return;
        toDelete.push(rec);
    });
    await Promise.all(
        toDelete.map(async (rec) => {
            await store.removeItem(rec.id);
            if (rec.contentRef) {
                await blobs.removeItem(rec.contentRef);
            }
        }),
    );
}

export async function listQueueForProject(projectId: string): Promise<QueueRecord[]> {
    const store = await getMetaStore();
    const all: QueueRecord[] = [];
    await store.iterate<QueueRecord, void>((rec) => {
        if (rec?.projectId === projectId) all.push(rec);
    });
    all.sort((a, b) => a.id.localeCompare(b.id));
    return all;
}

export async function getQueueDepth(projectId: string): Promise<number> {
    const store = await getMetaStore();
    let count = 0;
    await store.iterate<QueueRecord, void>((rec) => {
        if (rec?.projectId === projectId) count++;
    });
    return count;
}

export async function getQueueContent(record: QueueRecord): Promise<string | Uint8Array | null> {
    if (!record.contentRef) return null;
    const blobs = await getBlobStore();
    return (await blobs.getItem<string | Uint8Array>(record.contentRef)) ?? null;
}

export async function removeRecord(record: QueueRecord): Promise<void> {
    const store = await getMetaStore();
    await store.removeItem(record.id);
    if (record.contentRef) {
        const blobs = await getBlobStore();
        await blobs.removeItem(record.contentRef);
    }
}

export async function bumpAttempt(record: QueueRecord, error: unknown): Promise<QueueRecord> {
    const store = await getMetaStore();
    const next: QueueRecord = {
        ...record,
        attempts: record.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
    };
    await store.setItem(record.id, next);
    return next;
}

export async function moveToDeadLetter(record: QueueRecord): Promise<void> {
    const dead = await getDeadStore();
    const content = await getQueueContent(record);
    await dead.setItem(record.id, { ...record, content });
    await removeRecord(record);
}

export async function getDeadLetterDepth(): Promise<number> {
    const dead = await getDeadStore();
    return dead.length();
}

export interface DeadLetterRecord extends QueueRecord {
    content?: string | Uint8Array;
}

export async function listDeadLetter(): Promise<DeadLetterRecord[]> {
    const dead = await getDeadStore();
    const all: DeadLetterRecord[] = [];
    await dead.iterate<DeadLetterRecord, void>((rec) => {
        if (rec) all.push(rec);
    });
    all.sort((a, b) => a.id.localeCompare(b.id));
    return all;
}

export async function clearDeadLetter(): Promise<void> {
    const dead = await getDeadStore();
    await dead.clear();
}

export async function retryDeadLetterRecord(record: DeadLetterRecord): Promise<void> {
    const dead = await getDeadStore();
    const meta = await getMetaStore();
    // Destructure both content and contentRef so the requeued record gets a
    // fresh contentRef only when actual content is present.
    const { content, contentRef: _contentRef, ...rest } = record;
    const requeued: QueueRecord = {
        ...rest,
        attempts: 0,
        lastError: undefined,
        contentRef: undefined,
    };
    if (content !== undefined && content !== null) {
        const blobs = await getBlobStore();
        await blobs.setItem(requeued.id, content);
        requeued.contentRef = requeued.id;
    }
    await meta.setItem(requeued.id, requeued);
    await dead.removeItem(record.id);
}

export const QUEUE_MAX_ATTEMPTS = 5;

/* ---------------------------- Conflict store ---------------------------- */

export interface ConflictRecord {
    id: string;
    projectId: string;
    branchId: string;
    path: string;
    /** Hash of the file at the moment we queued the write. */
    baseHash?: string;
    /** Remote content at replay time (decoded as UTF-8 if it was binary it'll be a Uint8Array). */
    remoteContent: string | Uint8Array;
    /** Hash of `remoteContent` at replay time. */
    remoteHash: string;
    /** What the user actually wrote (the version that won via LWW). */
    localContent: string | Uint8Array;
    detectedAt: number;
}

let conflictStorePromise: Promise<LocalForage> | null = null;
function getConflictStore(): Promise<LocalForage> {
    conflictStorePromise ??= makeStore('offline-queue-conflicts');
    return conflictStorePromise;
}

export async function logConflict(
    record: Omit<ConflictRecord, 'id' | 'detectedAt'>,
): Promise<void> {
    const store = await getConflictStore();
    const id = makeId();
    const conflict: ConflictRecord = {
        ...record,
        id,
        detectedAt: Date.now(),
    };
    await store.setItem(id, conflict);
}

export async function listConflicts(projectId?: string): Promise<ConflictRecord[]> {
    const store = await getConflictStore();
    const all: ConflictRecord[] = [];
    await store.iterate<ConflictRecord, void>((rec) => {
        if (!rec) return;
        if (projectId && rec.projectId !== projectId) return;
        all.push(rec);
    });
    all.sort((a, b) => b.detectedAt - a.detectedAt);
    return all;
}

export async function getConflictDepth(projectId?: string): Promise<number> {
    const store = await getConflictStore();
    if (!projectId) return store.length();
    let count = 0;
    await store.iterate<ConflictRecord, void>((rec) => {
        if (rec?.projectId === projectId) count++;
    });
    return count;
}

export async function dismissConflict(id: string): Promise<void> {
    const store = await getConflictStore();
    await store.removeItem(id);
}

export async function clearConflicts(): Promise<void> {
    const store = await getConflictStore();
    await store.clear();
}
