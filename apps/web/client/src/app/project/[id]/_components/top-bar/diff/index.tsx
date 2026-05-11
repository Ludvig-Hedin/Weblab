'use client';

import { useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';
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
                    <HotkeyLabel hotkey={Hotkey.OPEN_DIFF} />
                </TooltipContent>
            </Tooltip>
            <DiffModal open={open} onOpenChange={handleOpenChange} />
        </>
    );
});
