import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../components/BrandMark';
import { interp } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';

export const Scene03Fuse: React.FC = () => {
    const frame = useCurrentFrame();
    const wordmarkOpacity = interp(frame, [40, 90], [0, 1]);
    const wordmarkLift = interp(frame, [40, 90], [12, 0]);
    const haloOpacity = interp(frame, [10, 60], [0, 0.2]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontStack,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    width: 520,
                    height: 520,
                    borderRadius: '50%',
                    background: palette.blue,
                    filter: 'blur(80px)',
                    opacity: haloOpacity,
                }}
            />
            <div
                style={{
                    opacity: wordmarkOpacity,
                    transform: `translateY(${wordmarkLift}px)`,
                    position: 'relative',
                }}
            >
                <BrandMark variant="wordmark" width={420} />
            </div>
        </AbsoluteFill>
    );
};
