// Per-project, per-tab UI state that survives a reload but isn't worth a
// round-trip to the server: which frame was active, which element the user
// last selected, the active breakpoint. Stored in localStorage so the editor
// reopens where the user left off instead of resetting to defaults.
//
// Intentionally narrow: anything that costs more than a getItem/setItem to
// restore (e.g. panel scroll positions) belongs elsewhere — restoring those
// here would silently slow down every project boot.

const KEY_PREFIX = 'weblab:editor-state:';

export interface EditorPersistedState {
    selectedFrameId?: string;
    selectedElementOid?: string;
    selectedElementFrameId?: string;
    activeBreakpointId?: string;
}

function storageKey(projectId: string): string {
    return `${KEY_PREFIX}${projectId}`;
}

export function loadEditorState(projectId: string): EditorPersistedState | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(storageKey(projectId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed as EditorPersistedState;
    } catch {
        return null;
    }
}

export function saveEditorState(projectId: string, state: EditorPersistedState): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
    } catch {
        // localStorage can throw in private mode or when over quota — best-effort only.
    }
}

export function clearEditorState(projectId: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(storageKey(projectId));
    } catch {
        // ignore
    }
}

export function patchEditorState(projectId: string, patch: Partial<EditorPersistedState>): void {
    const existing = loadEditorState(projectId) ?? {};
    saveEditorState(projectId, { ...existing, ...patch });
}
