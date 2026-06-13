'use client';

import { useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { DiffModal } from './diff-modal';

export const DiffButton = observer(() => {
    const editorEngine = useEditorEngine();
    const [open, setOpen] = useState(false);

    const handleOpenChange = useCallback(
        (next: boolean) => {
            setOpen(next);
            if (next) {
                void editorEngine.activeSandbox?.gitManager?.getDiffs();
            }
        },
        [editorEngine],
    );

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8"
                        onClick={() => handleOpenChange(true)}
                    >
                        <Icons.Code className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="mt-1" hideArrow>
                    {/* No HotkeyLabel: OPEN_DIFF isn't bound — the modal's open
                        state is local to this component and not reachable from
                        the global hotkeys area — so advertising a shortcut here
                        would be a dead key. Show a plain label instead. */}
                    {Hotkey.OPEN_DIFF.description}
                </TooltipContent>
            </Tooltip>
            <DiffModal open={open} onOpenChange={handleOpenChange} />
        </>
    );
});
