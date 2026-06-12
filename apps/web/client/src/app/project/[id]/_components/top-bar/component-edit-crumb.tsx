'use client';

import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Breadcrumb tail shown while a master component is being edited in-context:
 * `← ComponentName`. Clicking it exits the session (back to the page).
 */
export const ComponentEditCrumb = observer(() => {
    const editorEngine = useEditorEngine();
    const session = editorEngine.components.editing;
    if (!session) return null;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-small desktop-no-drag h-7 gap-1 px-1.5"
                    onClick={() => editorEngine.components.exitEditMode()}
                >
                    <Icons.ArrowLeft className="h-3 w-3 text-purple-400" />
                    <span className="text-foreground-primary max-w-[140px] truncate font-mono text-[11px]">
                        {session.def.name}
                    </span>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
                Editing component — click to go back
            </TooltipContent>
        </Tooltip>
    );
});
