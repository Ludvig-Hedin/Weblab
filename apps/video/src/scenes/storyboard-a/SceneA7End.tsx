import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { BrandMark } from '../../components/BrandMark';
import { APP_DOMAIN } from '../../utils/brand';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * Storyboard A — Scene 7 (1:05–1:15, frames 3900–4500, scene length 600).
 *
 * End plate: full Weblab logo, tagline "Design real websites", URL
 * `weblab.build`.
 */

const SCENE_LENGTH = 600;

export const SceneA7End: React.FC = () => {
    const frame = useCurrentFrame();

    // Logo: settle in over 18 frames.
    const logoOpacity = interp(frame, [10, 36], [0, 1]);
    const logoLift = interp(frame, [10, 36], [10, 0]);

    // Tagline: stagger 18 frames after.
    const taglineOpacity = interp(frame, [40, 80], [0, 1]);
    const taglineLift = interp(frame, [40, 80], [12, 0]);

    // URL: stagger 18 frames after the tagline.
    const urlOpacity = interp(frame, [70, 110], [0, 1]);
    const urlLift = interp(frame, [70, 110], [10, 0]);

    // Soft halo behind the logo.
    const halo =
        interp(frame, [0, 80], [0, 0.22]) *
        interp(frame, [SCENE_LENGTH - 80, SCENE_LENGTH], [1, 0.4]);

    // Resolve fade at the very end so the cut is gentle.
    const finalFade = interp(frame, [SCENE_LENGTH - 30, SCENE_LENGTH], [1, 0.7]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: finalFade,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    width: 640,
                    height: 640,
                    borderRadius: '50%',
                    background: 'rgba(0,129,222,0.30)',
                    filter: 'blur(120px)',
                    opacity: halo,
                }}
            />
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 40,
                }}
            >
                <div
                    style={{
                        opacity: logoOpacity,
                        transform: `translateY(${logoLift}px)`,
                    }}
                >
                    <BrandMark variant="logo" width={140} />
                </div>
                <div
                    style={{
                        opacity: taglineOpacity,
                        transform: `translateY(${taglineLift}px)`,
                        fontSize: 56,
                        fontWeight: 400,
                        color: palette.textPrimary,
                        letterSpacing: -0.4,
                        lineHeight: 1.05,
                        textAlign: 'center',
                    }}
                >
                    Design real websites
                </div>
                <div
                    style={{
                        opacity: urlOpacity,
                        transform: `translateY(${urlLift}px)`,
                        fontSize: 22,
                        color: palette.textSecondary,
                        letterSpacing: 0.2,
                    }}
                >
                    {APP_DOMAIN}
                </div>
            </div>
        </AbsoluteFill>
    );
};
