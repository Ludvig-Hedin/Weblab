import React from 'react';

import type { RectDimensions } from '@weblab/models';
import { InsertMode } from '@weblab/models';

import { BaseRect } from './base';

const INSERT_LABELS: Record<InsertMode, string> = {
    [InsertMode.INSERT_DIV]: 'Div',
    [InsertMode.INSERT_FLEX_DIV]: 'Flex',
    [InsertMode.INSERT_BUTTON]: 'Button',
    [InsertMode.INSERT_TEXT]: 'Text',
    [InsertMode.INSERT_HEADING]: 'Heading',
    [InsertMode.INSERT_LINK]: 'Link',
    [InsertMode.INSERT_INPUT]: 'Input',
    [InsertMode.INSERT_IMAGE]: 'Image',
    [InsertMode.INSERT_WEBLAB_LIST]: 'List',
};

interface InsertRectProps {
    rect: RectDimensions | null;
    mode?: InsertMode | null;
}

export const InsertRect: React.FC<InsertRectProps> = ({ rect, mode }) => {
    if (!rect) {
        return null;
    }
    const label = mode ? INSERT_LABELS[mode] : null;
    return (
        <BaseRect {...rect}>
            {label && rect.width > 32 && rect.height > 16 && (
                <text
                    x={4}
                    y={14}
                    fill="currentColor"
                    fontSize="11"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="500"
                    style={{ opacity: 0.7 }}
                >
                    {label}
                </text>
            )}
        </BaseRect>
    );
};
