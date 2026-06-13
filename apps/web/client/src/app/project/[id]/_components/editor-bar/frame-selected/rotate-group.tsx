import React from 'react';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { type FrameData } from '@/components/store/editor/frames';
import { HoverOnlyTooltip } from '../hover-tooltip';
import { ToolbarButton } from '../toolbar-button';

export function RotateGroup({ frameData }: { frameData: FrameData }) {
    const t = useTranslations('editor.editorBar');
    return (
        <HoverOnlyTooltip content={t('rotateDevice')} side="bottom" sideOffset={10}>
            <ToolbarButton
                className="w-9"
                onClick={() => {
                    const { width, height } = frameData.frame.dimension;
                    frameData.frame.dimension.width = height;
                    frameData.frame.dimension.height = width;
                }}
            >
                <Icons.Rotate className="h-4 w-4" />
            </ToolbarButton>
        </HoverOnlyTooltip>
    );
}
