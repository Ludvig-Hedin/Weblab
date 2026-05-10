import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { APP_DOMAIN } from '../utils/brand';
import { interp } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';
import { BrandMark } from './BrandMark';

/**
 * Shared end-plate used by all focus-sequence end scenes (F1, F2, F3…).
 * Logo fades in with a lift, then the domain URL fades in below.
 * Timings: logo [10, 60], url [80, 140].
 */
export const EndScene: React.FC = () => {
    const frame = useCurrentFrame();
    const logoOpacity = interp(frame, [10, 60], [0, 1]);
    const logoLift = interp(frame, [10, 60], [10, 0]);
    const urlOpacity = interp(frame, [80, 140], [0, 1]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 22,
            }}
        >
            <div
                style={{
                    opacity: logoOpacity,
                    transform: `translateY(${logoLift}px)`,
                }}
            >
                <BrandMark variant="logo" width={96} />
            </div>
            <div
                style={{
                    opacity: urlOpacity,
                    fontSize: 18,
                    color: palette.textSecondary,
                    letterSpacing: 0.2,
                }}
            >
                {APP_DOMAIN}
            </div>
        </AbsoluteFill>
    );
};
