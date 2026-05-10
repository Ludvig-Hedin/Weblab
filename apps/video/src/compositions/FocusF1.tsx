import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { FOCUS_F1_CUES } from '../audio/tracks';
import { SceneF1_1Hook } from '../scenes/focus-f1/SceneF1_1Hook';
import { SceneF1_2Attach } from '../scenes/focus-f1/SceneF1_2Attach';
import { SceneF1_3Type } from '../scenes/focus-f1/SceneF1_3Type';
import { SceneF1_4Send } from '../scenes/focus-f1/SceneF1_4Send';
import { SceneF1_5CanvasUpdate } from '../scenes/focus-f1/SceneF1_5CanvasUpdate';
import { SceneF1_6Hold } from '../scenes/focus-f1/SceneF1_6Hold';
import { SceneF1_7End } from '../scenes/focus-f1/SceneF1_7End';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: SceneEntry[] = [
    { range: [0, 180], Component: SceneF1_1Hook },
    { range: [180, 360], Component: SceneF1_2Attach },
    { range: [540, 360], Component: SceneF1_3Type },
    { range: [900, 360], Component: SceneF1_4Send },
    { range: [1260, 600], Component: SceneF1_5CanvasUpdate },
    { range: [1860, 540], Component: SceneF1_6Hold },
    { range: [2400, 300], Component: SceneF1_7End },
];

export const FocusF1: React.FC = () => {
    const { durationInFrames } = useVideoConfig();
    return (
        <AbsoluteFill style={{ background: palette.background }}>
            {TIMELINE.map(({ range, Component }, idx) => (
                <Sequence key={idx} {...s(range[0], range[1])}>
                    <Component />
                </Sequence>
            ))}
            <AudioTracks compositionFrames={durationInFrames} cues={FOCUS_F1_CUES} />
        </AbsoluteFill>
    );
};

export default FocusF1;
