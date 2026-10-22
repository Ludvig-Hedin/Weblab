export interface ItemDraft {
    slug: string;
    status: 'draft' | 'published';
    values: Record<string, unknown>;
}
export interface ItemEditorState {
    identity: string;
    baseline: string;
    revision: number | null;
    draft: ItemDraft;
    conflict: boolean;
    missing: boolean;
}
export function draftKey(input: unknown): string {
    return JSON.stringify(input, (_key, value: unknown) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
        }
        return value;
    }) ?? 'null';
}
export function emptyItemState(identity: string): ItemEditorState {
    const draft: ItemDraft = { slug: '', status: 'draft', values: {} };
    return { identity, baseline: draftKey(draft), revision: null, draft, conflict: false, missing: false };
}
export function receiveItem(state: ItemEditorState, incoming: { revision: number; slug?: string; status: 'draft' | 'published'; values: unknown } | null, reload = false): ItemEditorState {
    if (!incoming) return { ...state, missing: true, conflict: state.revision !== null };
    if (!Number.isSafeInteger(incoming.revision) || incoming.revision < 0) return { ...state, conflict: true };
    const dirty = draftKey(state.draft) !== state.baseline;
    if (!reload && state.revision !== null && dirty) {
        return { ...state, conflict: state.conflict || state.revision !== incoming.revision };
    }
    if (!incoming.values || typeof incoming.values !== 'object' || Array.isArray(incoming.values)) return { ...state, conflict: true };
    const draft: ItemDraft = { slug: incoming.slug ?? '', status: incoming.status, values: structuredClone(incoming.values as Record<string, unknown>) };
    return { ...state, draft, baseline: draftKey(draft), revision: incoming.revision, conflict: false, missing: false };
}
