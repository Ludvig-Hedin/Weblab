import React from 'react';

import type { RectDimensions } from '@weblab/models';
import { EditorAttributes } from '@weblab/constants';
import { colors } from '@weblab/ui/tokens';

export interface RectProps extends RectDimensions {
    isComponent?: boolean;
    className?: string;
    children?: React.ReactNode;
    strokeWidth?: number;
}

export const BaseRect: React.FC<RectProps> = ({
    width,
    height,
    top,
    left,
    isComponent,
    className,
    children,
    strokeWidth = 2,
}) => {
    if (width === undefined || height === undefined || top === undefined || left === undefined) {
        return null;
    }

    return (
        <div
            style={{
                position: 'absolute',
                top: `${top}px`,
                left: `${left}px`,
                pointerEvents: 'none',
            }}
            className={className}
            data-weblab-ignore="true"
            id={EditorAttributes.WEBLAB_RECT_ID}
        >
            <svg
                overflow="visible"
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
            >
                <rect
                    width={width}
                    height={height}
                    fill="none"
                    stroke={isComponent ? colors.purple[500] : colors.blue[400]}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {children}
            </svg>
        </div>
    );
};
