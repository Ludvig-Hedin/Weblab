import React from 'react';
import { useCurrentFrame } from 'remotion';

import type { EasingFn } from '../utils/timing';
import { easeOutQuart, interp } from '../utils/timing';

export interface ZoomWrapperProps {
    from: number;
    to: number;
    /** Scene-local frame at which the zoom starts. */
    start: number;
    /** Number of frames the zoom spans. */
    length: number;
    easing?: EasingFn;
    origin?: string;
    children: React.ReactNode;
}

export const ZoomWrapper: React.FC<ZoomWrapperProps> = ({
    from,
    to,
    start,
    length,
    easing = easeOutQuart,
    origin = '50% 50%',
    children,
}) => {
    const frame = useCurrentFrame();
    const scale = interp(frame, [start, start + length], [from, to], easing);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                transform: `scale(${scale})`,
                transformOrigin: origin,
            }}
        >
            {children}
        </div>
    );
};
