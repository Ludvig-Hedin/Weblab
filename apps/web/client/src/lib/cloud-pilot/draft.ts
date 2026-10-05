import type { PilotContent, PilotSnapshot } from '@convex/lib/cloudPilot';

export type PilotDraft = {
    base: PilotSnapshot;
    latest: PilotSnapshot;
    content: PilotContent;
    pending: PilotContent | null;
    error: string | null;
};
export type PilotDraftAction =
    | { type: 'edit'; content: PilotContent }
    | { type: 'remote'; snapshot: PilotSnapshot }
    | { type: 'saving' }
    | { type: 'saved'; snapshot: PilotSnapshot }
    | { type: 'failed'; error: string }
    | { type: 'reload' };

export function sameContent(a: PilotContent, b: PilotContent): boolean {
    return (Object.keys(a) as (keyof PilotContent)[]).every((key) => a[key] === b[key]);
}

export function createDraft(snapshot: PilotSnapshot): PilotDraft {
    return {
        base: snapshot,
        latest: snapshot,
        content: snapshot.content,
        pending: null,
        error: null,
    };
}

export function isDirty(state: PilotDraft): boolean {
    return !sameContent(state.content, state.base.content);
}

export function hasConflict(state: PilotDraft): boolean {
    return (
        state.latest.revision > state.base.revision &&
        !(state.pending && sameContent(state.latest.content, state.pending))
    );
}

export function pilotDraftReducer(state: PilotDraft, action: PilotDraftAction): PilotDraft {
    switch (action.type) {
        case 'edit':
            return { ...state, content: action.content, error: null };
        case 'remote': {
            if (action.snapshot.revision < state.latest.revision) return state;
            if (!isDirty(state) && !state.pending && !hasConflict(state))
                return createDraft(action.snapshot);
            return { ...state, latest: action.snapshot };
        }
        case 'saving':
            return { ...state, pending: { ...state.content }, error: null };
        case 'saved': {
            const content =
                state.pending && sameContent(state.content, state.pending)
                    ? action.snapshot.content
                    : state.content;
            const latest =
                state.latest.revision > action.snapshot.revision ? state.latest : action.snapshot;
            return {
                base: action.snapshot,
                latest,
                content,
                pending: null,
                error: null,
            };
        }
        case 'failed':
            return { ...state, pending: null, error: action.error };
        case 'reload':
            return createDraft(state.latest);
    }
}
