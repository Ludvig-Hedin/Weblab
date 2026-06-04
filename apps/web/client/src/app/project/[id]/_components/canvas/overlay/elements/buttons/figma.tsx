import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

export const OverlayCopyToFigma = observer(({ isInputting }: { isInputting: boolean }) => {
    const editorEngine = useEditorEngine();
    const isDevMode = editorEngine.state.editorMode === EditorMode.CODE;
    const domId = editorEngine.elements.selected[0]?.domId;
    const isCopying = editorEngine.figma.isCopying;

    if (isDevMode || isInputting || !domId) {
        return null;
    }

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
                onClick={() => void editorEngine.figma.copySelectedToFigma()}
                disabled={isCopying}
                className="hover:text-foreground-primary rounded-lg"
                aria-label="Copy to Figma"
            >
                {isCopying ? (
                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                ) : (
                    <Icons.Figma className="h-4 w-4" />
                )}
            </Button>
        </div>
    );
});
