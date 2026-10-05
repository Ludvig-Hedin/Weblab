'use client';

import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';

import { useEditorEngine } from '@/components/store/editor';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';

export const CloudModeSwitch = observer(() => {
    const engine = useEditorEngine();
    const source = engine.activeSandbox.cloudSource;
    const copy = useCloudEditorCopy();
    if (!source) return null;
    if (!source.canDesign)
        return (
            <span className="text-small text-foreground-secondary">
                {source.canEditContent ? copy.contentBuildMode : copy.contentReadOnly}
            </span>
        );
    const busy = source.hasLocalWork || source.hasPendingChanges || source.state.pending;
    const select = (build: boolean, code = false) => {
        if (busy) return;
        source.setContentMode(build);
        engine.state.setEditorMode(code ? EditorMode.CODE : EditorMode.DESIGN);
        engine.clearUI();
    };
    return (
        <div className="bg-background-secondary flex rounded-full border p-1">
            <Button
                size="sm"
                variant={
                    !source.isContentMode && engine.state.editorMode !== EditorMode.CODE
                        ? 'secondary'
                        : 'ghost'
                }
                disabled={busy}
                onClick={() => select(false)}
            >
                {copy.contentDesignMode}
            </Button>
            <Button
                size="sm"
                variant={source.isContentMode ? 'secondary' : 'ghost'}
                disabled={busy}
                onClick={() => select(true)}
            >
                {copy.contentBuildMode}
            </Button>
            <Button
                size="sm"
                variant={engine.state.editorMode === EditorMode.CODE ? 'secondary' : 'ghost'}
                disabled={busy}
                onClick={() => select(false, true)}
            >
                {copy.contentCodeMode}
            </Button>
        </div>
    );
});
