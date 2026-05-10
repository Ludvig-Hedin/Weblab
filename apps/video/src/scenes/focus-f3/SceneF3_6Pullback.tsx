import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { TextOverlay } from '../../components/TextOverlay';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F3.6 — Pullback. Calm centered statement.
 */
export const SceneF3_6Pullback: React.FC = () => {
    const frame = useCurrentFrame();
    const haloOpacity = interp(frame, [10, 80], [0, 0.16]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                fontFamily: fontStack,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    width: 580,
                    height: 580,
                    borderRadius: '50%',
                    background: 'rgba(146,14,255,0.16)',
                    filter: 'blur(90px)',
                    opacity: haloOpacity,
                }}
            />
            <TextOverlay
                text="Connect. Design. Ship."
                enter={20}
                exit={400}
                style="display"
                align="center"
                weight={500}
            />
        </AbsoluteFill>
    );
};
