import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../../components/BrandMark';
import { APP_DOMAIN } from '../../utils/brand';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

const TAGLINE = 'Design real websites.';

/**
 * Beat 6 — 600 frames. End plate. Logo, tagline, URL settle and hold.
 */
export const SceneE6End: React.FC = () => {
    const frame = useCurrentFrame();

    const introFade = interp(frame, [0, 40], [0, 1]);
    const logoOpacity = interp(frame, [20, 90], [0, 1]);
    const logoLift = interp(frame, [20, 90], [14, 0]);
    const taglineOpacity = interp(frame, [80, 160], [0, 1]);
    const taglineLift = interp(frame, [80, 160], [10, 0]);
    const urlOpacity = interp(frame, [160, 240], [0, 1]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontStack,
                opacity: introFade,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 30,
                }}
            >
                <div
                    style={{
                        opacity: logoOpacity,
                        transform: `translateY(${logoLift}px)`,
                    }}
                >
                    <BrandMark variant="logo" width={128} />
                </div>
                <div
                    style={{
                        opacity: taglineOpacity,
                        transform: `translateY(${taglineLift}px)`,
                        fontSize: 56,
                        color: palette.textPrimary,
                        letterSpacing: -0.4,
                        textAlign: 'center',
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
