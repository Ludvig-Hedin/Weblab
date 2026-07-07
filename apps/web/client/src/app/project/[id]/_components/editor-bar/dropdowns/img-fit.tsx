'use client';

import { useEffect, useState } from 'react';

import { Button } from '@weblab/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { useDropdownControl } from '../hooks/use-dropdown-manager';
import { HoverOnlyTooltip } from '../hover-tooltip';
import { ToolbarButton } from '../toolbar-button';

type ObjectFitValue = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

const FIT_LABELS: Record<ObjectFitValue, string> = {
    fill: 'Fill',
    contain: 'Contain',
    cover: 'Cover',
    none: 'None',
    'scale-down': 'Scale down',
};

export const ImgFit = () => {
    const editorEngine = useEditorEngine();
    const { isOpen, onOpenChange } = useDropdownControl({
        id: 'img-fit-dropdown',
    });

    const [objectFit, setObjectFit] = useState<ObjectFitValue>(
        (editorEngine.style.selectedStyle?.styles.computed.objectFit as ObjectFitValue) ?? 'fill',
    );

    useEffect(() => {
        setObjectFit(
            (editorEngine.style.selectedStyle?.styles.computed.objectFit as ObjectFitValue) ??
                'fill',
        );
    }, [editorEngine.style.selectedStyle?.styles.computed.objectFit]);

    const handleFitChange = (newFit: ObjectFitValue) => {
        setObjectFit(newFit);
        editorEngine.style.update('objectFit', newFit);
    };

    return (
        <DropdownMenu open={isOpen} onOpenChange={onOpenChange} modal={false}>
            <HoverOnlyTooltip
                content="Image fit"
                side="bottom"
                className="mt-1"
                hideArrow
                disabled={isOpen}
            >
                <DropdownMenuTrigger asChild>
                    <ToolbarButton isOpen={isOpen} className="flex items-center gap-2 px-3">
                        <Icons.Image className="h-4 min-h-4 w-4 min-w-4" />
                        <span className="text-small">{FIT_LABELS[objectFit] ?? 'Fill'}</span>
                    </ToolbarButton>
                </DropdownMenuTrigger>
            </HoverOnlyTooltip>
            <DropdownMenuContent align="start" className="mt-2 min-w-[120px] rounded-lg p-1">
                <div className="space-y-2 p-2">
                    <div className="space-y-1">
                        <span className="text-muted-foreground text-small">Type</span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => handleFitChange('cover')}
                                className={`text-small flex-1 rounded-md px-3 py-1 ${
                                    objectFit === 'cover'
                                        ? 'bg-background-tertiary/20 text-foreground'
                                        : 'text-muted-foreground hover:bg-background-tertiary/10'
                                }`}
                            >
                                Cover
                            </button>
                            <button
                                onClick={() => handleFitChange('contain')}
                                className={`text-small flex-1 rounded-md px-3 py-1 ${
                                    objectFit === 'contain'
                                        ? 'bg-background-tertiary/20 text-foreground'
                                        : 'text-muted-foreground hover:bg-background-tertiary/10'
                                }`}
                            >
                                Contain
                            </button>
                            <button
                                onClick={() => handleFitChange('fill')}
                                className={`text-small flex-1 rounded-md px-3 py-1 ${
                                    objectFit === 'fill'
                                        ? 'bg-background-tertiary/20 text-foreground'
                                        : 'text-muted-foreground hover:bg-background-tertiary/10'
                                }`}
                            >
                                Fill
                            </button>
                        </div>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
