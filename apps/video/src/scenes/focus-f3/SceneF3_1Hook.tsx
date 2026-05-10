import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { TextOverlay } from '../../components/TextOverlay';
import { interp } from '../../utils/timing';
import { fontStack, palette } from '../../utils/tokens';

/**
 * F3.1 — Hook (0..180). Bring your existing site. Centered statement
 * with subtle gradient backdrop.
 */
export const SceneF3_1Hook: React.FC = () => {
    const frame = useCurrentFrame();
    const haloOpacity = interp(frame, [10, 80], [0, 0.18]);

    return (
        <AbsoluteFill
            style={{
                background: palette.background,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontStack,
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    width: 580,
                    height: 580,
                    borderRadius: '50%',
                    background: 'rgba(0,129,222,0.16)',
                    filter: 'blur(90px)',
                    opacity: haloOpacity,
                }}
            />
            <TextOverlay
                text="Bring your site."
                enter={20}
                exit={170}
                style="display"
                align="center"
                weight={500}
            />
        </AbsoluteFill>
    );
};
