import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../../components/BrandMark';
import { APP_DOMAIN } from '../../utils/brand';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * Scene B7 — End plate (4800–5400, 10s).
 *
 * Logo + tagline + URL stagger in. Logo gets a soft halo pulse.
 */

const TAGLINE = 'Design real websites';

export const SceneB7End: React.FC = () => {
    const frame = useCurrentFrame();

    const logoOpacity = interp(frame, [12, 60], [0, 1]);
    const logoLift = interp(frame, [12, 60], [12, 0]);
    const haloOpacity = interp(frame, [40, 200], [0, 0.35]);

    const taglineOpacity = interp(frame, [70, 130], [0, 1]);
    const taglineLift = interp(frame, [70, 130], [10, 0]);

    const urlOpacity = interp(frame, [130, 190], [0, 1]);

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
                    gap: 32,
                }}
            >
                <div
                    style={{
                        position: 'relative',
                        opacity: logoOpacity,
                        transform: `translateY(${logoLift}px)`,
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: -28,
                            borderRadius: 999,
                            background: `rgba(0,129,222,${haloOpacity})`,
                            filter: 'blur(28px)',
                        }}
                    />
                    <BrandMark variant="logo" width={132} style={{ position: 'relative' }} />
                </div>
                <div
                    style={{
                        opacity: taglineOpacity,
                        transform: `translateY(${taglineLift}px)`,
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
