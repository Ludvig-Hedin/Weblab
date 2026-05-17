import { useState } from 'react';

export type InteractionsTabView = { kind: 'list' } | { kind: 'editor'; interactionId: string };

export function useInteractionsTabView() {
    const [view, setView] = useState<InteractionsTabView>({ kind: 'list' });
    return { view, setView };
}
