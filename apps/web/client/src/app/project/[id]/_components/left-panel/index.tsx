import { useEditorEngine } from "@/components/store/editor";
import { EditorMode } from "@weblab/models";
import { cn } from "@weblab/ui/utils";
import { observer } from "mobx-react-lite";
import { CodePanel } from "./code-panel";
import { DesignPanel } from "./design-panel";

export const LeftPanel = observer(() => {
    const editorEngine = useEditorEngine();
    return <>
        <div className={cn('size-full', editorEngine.state.editorMode !== EditorMode.DESIGN && editorEngine.state.editorMode !== EditorMode.PAN && 'hidden')}>
            <DesignPanel />
        </div>
        <div className={cn('size-full', editorEngine.state.editorMode !== EditorMode.CODE && 'hidden')}>
            <CodePanel />
        </div>
    </>;
});