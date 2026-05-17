'use client';

import { observer } from 'mobx-react-lite';

import { useInteractionsTabView } from './hooks/use-editor-state';
import { ListView } from './list-view';
import { TimelineEditorPlaceholder } from './timeline/timeline-editor';

export const InteractionsTab = observer(function InteractionsTab() {
    const { view, setView } = useInteractionsTabView();

    if (view.kind === 'editor') {
        return (
            <TimelineEditorPlaceholder
                interactionId={view.interactionId}
                onBack={() => setView({ kind: 'list' })}
            />
        );
    }

    return <ListView onOpenInteraction={(id) => setView({ kind: 'editor', interactionId: id })} />;
});
