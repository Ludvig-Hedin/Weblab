import React from 'react';
import { useCurrentFrame } from 'remotion';

import { interp } from '../utils/timing';

export interface ClickRippleProps {
    /** Composition-local frame at which the click occurs. */
    at: number;
    x: number;
    y: number;
    color?: string;
}

/**
 * Subtle radial click ripple — radius 6 → 16, opacity 0.6 → 0 across 14 frames.
 * White by default. Centered at (x, y).
 */
export const ClickRipple: React.FC<ClickRippleProps> = ({ at, x, y, color = '#ffffff' }) => {
    const frame = useCurrentFrame();
    const local = frame - at;
    if (local < 0 || local > 14) return null;

    const radius = interp(local, [0, 14], [6, 16]);
    const opacity = interp(local, [0, 14], [0.6, 0]);

    const SIZE = 48;
    return (
        <svg
            width={SIZE}
            height={SIZE}
            style={{
                position: 'absolute',
                left: x - SIZE / 2,
                top: y - SIZE / 2,
                pointerEvents: 'none',
            }}
        >
            <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                opacity={opacity}
            />
        </svg>
    );
};
