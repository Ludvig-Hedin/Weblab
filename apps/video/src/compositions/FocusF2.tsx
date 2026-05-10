import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { FOCUS_F2_CUES } from '../audio/tracks';
import { SceneF2_1Hook } from '../scenes/focus-f2/SceneF2_1Hook';
import { SceneF2_2DragHero } from '../scenes/focus-f2/SceneF2_2DragHero';
import { SceneF2_3Typography } from '../scenes/focus-f2/SceneF2_3Typography';
import { SceneF2_4Color } from '../scenes/focus-f2/SceneF2_4Color';
import { SceneF2_5Breakpoints } from '../scenes/focus-f2/SceneF2_5Breakpoints';
import { SceneF2_6Pullback } from '../scenes/focus-f2/SceneF2_6Pullback';
import { SceneF2_7End } from '../scenes/focus-f2/SceneF2_7End';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: SceneEntry[] = [
    { range: [0, 120], Component: SceneF2_1Hook },
    { range: [120, 360], Component: SceneF2_2DragHero },
    { range: [480, 360], Component: SceneF2_3Typography },
    { range: [840, 480], Component: SceneF2_4Color },
    { range: [1320, 480], Component: SceneF2_5Breakpoints },
    { range: [1800, 600], Component: SceneF2_6Pullback },
    { range: [2400, 300], Component: SceneF2_7End },
];

export const FocusF2: React.FC = () => {
    const { durationInFrames } = useVideoConfig();
    return (
        <AbsoluteFill style={{ background: palette.background }}>
            {TIMELINE.map(({ range, Component }, idx) => (
                <Sequence key={idx} {...s(range[0], range[1])}>
                    <Component />
                </Sequence>
            ))}
            <AudioTracks compositionFrames={durationInFrames} cues={FOCUS_F2_CUES} />
        </AbsoluteFill>
    );
};

export default FocusF2;
