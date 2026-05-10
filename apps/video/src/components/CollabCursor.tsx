import React from 'react';

import { fontStack, palette } from '../utils/tokens';
import { Cursor } from './Cursor';

export type CollabVariant = 'blue' | 'purple' | 'neutral';

const variantToColor: Record<CollabVariant, string> = {
    blue: palette.blueSoft,
    purple: palette.purpleSoft,
    neutral: '#c7c7c7',
};

export interface CollabCursorProps {
    x: number;
    y: number;
    name: string;
    variant?: CollabVariant;
    opacity?: number;
}

export const CollabCursor: React.FC<CollabCursorProps> = ({
    x,
    y,
    name,
    variant = 'blue',
    opacity = 1,
}) => {
    const color = variantToColor[variant];
    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                opacity,
                pointerEvents: 'none',
            }}
        >
            <Cursor x={0} y={0} />
            <div
                style={{
                    position: 'absolute',
                    left: 16,
                    top: 16,
                    background: color,
                    color: '#0a0a0a',
                    fontFamily: fontStack,
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 6,
                    letterSpacing: 0.1,
                    whiteSpace: 'nowrap',
                }}
            >
                {name}
            </div>
        </div>
    );
};
