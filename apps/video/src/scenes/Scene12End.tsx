import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../components/BrandMark';
import { APP_DOMAIN } from '../utils/brand';
import { interp } from '../utils/timing';
import { fontStack, palette } from '../utils/tokens';

const TAGLINE = 'Design real websites.';

export const Scene12End: React.FC = () => {
    const frame = useCurrentFrame();
    const logoOpacity = interp(frame, [12, 60], [0, 1]);
    const logoLift = interp(frame, [12, 60], [12, 0]);
    const taglineOpacity = interp(frame, [60, 120], [0, 1]);
    const urlOpacity = interp(frame, [120, 180], [0, 1]);

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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 28,
                }}
            >
                <div
                    style={{
                        opacity: logoOpacity,
                        transform: `translateY(${logoLift}px)`,
                    }}
                >
                    <BrandMark variant="logo" width={120} />
                </div>
                <div
                    style={{
                        opacity: taglineOpacity,
                        fontSize: 56,
                        color: palette.textPrimary,
                        letterSpacing: -0.4,
                    }}
                >
                    {TAGLINE}
                </div>
                <div
                    style={{
                        opacity: urlOpacity,
                        fontSize: 18,
                        color: palette.textSecondary,
                        letterSpacing: 0.3,
                    }}
                >
                    {APP_DOMAIN}
                </div>
            </div>
        </AbsoluteFill>
    );
};
