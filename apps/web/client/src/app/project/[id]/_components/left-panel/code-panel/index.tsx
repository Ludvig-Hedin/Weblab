'use client';

import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { CodeTab } from './code-tab';

// CODE mode is now full-bleed: the parent container in main.tsx stretches us
// to the AI panel's left edge, so the code editor fills everything except the
// (resizable) right panel. No internal ResizablePanel here — the right
// panel's left edge is the resize handle, like VS Code's editor/sidebar split.
export const CodePanel = observer(() => {
    const editorEngine = useEditorEngine();

    return (
        <div
            className={cn(
                'bg-background-canvas group/panel flex size-full overflow-hidden',
                editorEngine.state.editorMode !== EditorMode.CODE && 'hidden',
            )}
        >
            <CodeTab
                projectId={editorEngine.projectId}
                branchId={editorEngine.branches.activeBranch.id}
            />
        </div>
    );
});
