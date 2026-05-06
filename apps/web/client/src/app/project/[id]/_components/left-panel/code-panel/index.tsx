'use client';

import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { ResizablePanel } from '@weblab/ui/resizable';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { CodeTab } from './code-tab';

export const CodePanel = observer(() => {
    const editorEngine = useEditorEngine();
    const editPanelWidth = 500;

    return (
        <div
            className={cn(
                'transition-width bg-background/95 group/panel flex size-full overflow-hidden rounded-tr-xl border-[0.5px] shadow backdrop-blur-xl duration-300',
                editorEngine.state.editorMode !== EditorMode.CODE && 'hidden',
            )}
        >
            <ResizablePanel
                side="left"
                defaultWidth={editPanelWidth}
                minWidth={240}
                maxWidth={1440}
            >
                <CodeTab
                    projectId={editorEngine.projectId}
                    branchId={editorEngine.branches.activeBranch.id}
                />
            </ResizablePanel>
        </div>
    );
});
