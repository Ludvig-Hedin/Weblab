import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

export const OverlayOpenCode = observer(({ isInputting }: { isInputting: boolean }) => {
    const editorEngine = useEditorEngine();
    const isDevMode = editorEngine.state.editorMode === EditorMode.CODE;
    const oid = editorEngine.elements.selected[0]?.oid;

    if (isDevMode || isInputting || !oid) {
        return null;
    }

    const handleCodeButtonClick = async () => {
        await editorEngine.ide.openCodeBlock(oid);
    };

    return (
        <div
            className={cn(
                'rounded-xl backdrop-blur-lg transition-all duration-300',
                'shadow-background-secondary/50 shadow-xl',
                'bg-background-secondary/85 dark:bg-background/85 border-foreground-secondary/20 hover:border-foreground-secondary/50 p-0.5',
                'relative flex border',
            )}
        >
            <button
                onClick={handleCodeButtonClick}
                className="hover:text-foreground-primary flex w-full flex-row items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors"
                title="Open in Code"
                aria-label="Open in Code"
            >
                <Icons.Code className="h-4 w-4" />
            </button>
        </div>
    );
});
