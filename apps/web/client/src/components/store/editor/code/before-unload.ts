export interface EditorUnloadState {
    pendingWrites: boolean;
    pendingRebases: boolean;
    pendingStylePreflights: boolean;
    text: { pending: boolean; branchId: string | null };
    branches: ReadonlyArray<{ id: string; runtime: string; historyOpen: boolean }>;
}

/** Unload cannot await a save. Keep unfinished local work behind a warning. */
export function createEditorBeforeUnloadHandler(
    flushPendingRebases: () => void,
    readState: () => EditorUnloadState,
): (event: BeforeUnloadEvent) => void {
    return (event) => {
        flushPendingRebases();
        const state = readState();
        const localText = state.text.pending && state.branches.some((branch) =>
            branch.id === state.text.branchId && branch.runtime === 'local');
        const localHistory = state.branches.some((branch) =>
            branch.runtime === 'local' && branch.historyOpen);
        if (!state.pendingWrites && !state.pendingRebases && !state.pendingStylePreflights &&
            !localText && !localHistory) return;
        event.preventDefault();
        event.returnValue = '';
    };
}
