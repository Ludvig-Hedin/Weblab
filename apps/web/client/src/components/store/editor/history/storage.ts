import localforage from 'localforage';

import type { Action } from '@weblab/models/actions';

const SCHEMA_VERSION = 1 as const;
const MAX_UNDO_SIZE = 100;
const MAX_REDO_SIZE = 50;
const storageQueues = new Map<string, Promise<void>>();

function inStorageOrder<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const run = (storageQueues.get(key) ?? Promise.resolve()).then(operation);
    const settled = run.then(() => undefined, () => undefined);
    storageQueues.set(key, settled);
    void settled.then(() => {
        if (storageQueues.get(key) === settled) storageQueues.delete(key);
    });
    return run;
}

interface PersistedHistory {
    v: typeof SCHEMA_VERSION;
    undoStack: Action[];
    redoStack: Action[];
    sourceVersion?: string;
}

export function historyStorageKey(branchId: string): string {
    return `weblab_history_v${SCHEMA_VERSION}_${branchId}`;
}

export async function saveHistory(
    branchId: string,
    undoStack: Action[],
    redoStack: Action[],
    sourceVersion?: string,
): Promise<void> {
    const data: PersistedHistory = {
        v: SCHEMA_VERSION,
        undoStack: undoStack.slice(-MAX_UNDO_SIZE),
        redoStack: redoStack.slice(-MAX_REDO_SIZE),
        sourceVersion,
    };
    // localforage persists via IndexedDB's structured-clone algorithm, which
    // throws DataCloneError on MobX observable proxies, class instances, or DOM
    // refs that can ride along inside an action (the error often stringifies to
    // an empty `{}` in the console). Snapshot to plain JSON first so a single
    // non-cloneable action can't wedge all history persistence.
    const plain = JSON.parse(JSON.stringify(data)) as PersistedHistory;
    const key = historyStorageKey(branchId);
    await inStorageOrder(key, () => localforage.setItem(key, plain).then(() => undefined));
}

export async function loadHistory(
    branchId: string,
): Promise<{ undoStack: Action[]; redoStack: Action[]; sourceVersion?: string } | null> {
    const key = historyStorageKey(branchId);
    const data = await inStorageOrder(key, () => localforage.getItem<PersistedHistory>(key));
    if (data?.v !== SCHEMA_VERSION) {
        return null;
    }
    return {
        undoStack: data.undoStack ?? [],
        redoStack: data.redoStack ?? [],
        sourceVersion: data.sourceVersion,
    };
}

export async function clearHistory(branchId: string): Promise<void> {
    const key = historyStorageKey(branchId);
    await inStorageOrder(key, () => localforage.removeItem(key).then(() => undefined));
}
