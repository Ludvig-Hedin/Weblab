import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { TextOverlay } from '../../components/TextOverlay';
import { APP_NAME } from '../../utils/brand';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F1.6 — Hold (0..540 scene-local). Headline statement + caption.
 */
export const SceneF1_6Hold: React.FC = () => {
    const frame = useCurrentFrame();
    const captionOpacity = interp(frame, [80, 140], [0, 1]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 16,
            }}
        >
            <TextOverlay
                text="Just describe it."
                enter={10}
                exit={500}
                style="display"
                align="center"
                weight={500}
            />
            <div
                style={{
                    opacity: captionOpacity,
                    fontSize: 16,
                    color: palette.textSecondary,
                    letterSpacing: 0.2,
                }}
            >
                {APP_NAME} AI
            </div>
        </AbsoluteFill>
    );
};
