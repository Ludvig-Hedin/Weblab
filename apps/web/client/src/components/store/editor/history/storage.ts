import localforage from 'localforage';

import type { Action } from '@weblab/models/actions';

const SCHEMA_VERSION = 1 as const;
const MAX_UNDO_SIZE = 100;
const MAX_REDO_SIZE = 50;

interface PersistedHistory {
    v: typeof SCHEMA_VERSION;
    undoStack: Action[];
    redoStack: Action[];
}

export function historyStorageKey(branchId: string): string {
    return `weblab_history_v${SCHEMA_VERSION}_${branchId}`;
}

export async function saveHistory(
    branchId: string,
    undoStack: Action[],
    redoStack: Action[],
): Promise<void> {
    const data: PersistedHistory = {
        v: SCHEMA_VERSION,
        undoStack: undoStack.slice(-MAX_UNDO_SIZE),
        redoStack: redoStack.slice(-MAX_REDO_SIZE),
    };
    await localforage.setItem(historyStorageKey(branchId), data);
}

export async function loadHistory(
    branchId: string,
): Promise<{ undoStack: Action[]; redoStack: Action[] } | null> {
    const data = await localforage.getItem<PersistedHistory>(historyStorageKey(branchId));
    if (data?.v !== SCHEMA_VERSION) {
        return null;
    }
    return {
        undoStack: data.undoStack ?? [],
        redoStack: data.redoStack ?? [],
    };
}

export async function clearHistory(branchId: string): Promise<void> {
    await localforage.removeItem(historyStorageKey(branchId));
}
