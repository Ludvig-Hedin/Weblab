import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
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
            <Button
                variant="ghost"
                size="icon"
                onClick={handleCodeButtonClick}
                className="hover:text-foreground-primary rounded-lg"
                aria-label="Open in Code"
            >
                <Icons.Code className="h-4 w-4" />
            </Button>
        </div>
    );
});
