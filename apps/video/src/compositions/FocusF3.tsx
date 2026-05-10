import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { FOCUS_F3_CUES } from '../audio/tracks';
import { SceneF3_1Hook } from '../scenes/focus-f3/SceneF3_1Hook';
import { SceneF3_2Dialog } from '../scenes/focus-f3/SceneF3_2Dialog';
import { SceneF3_3ConnectForm } from '../scenes/focus-f3/SceneF3_3ConnectForm';
import { SceneF3_4FileTree } from '../scenes/focus-f3/SceneF3_4FileTree';
import { SceneF3_5KeepDesigning } from '../scenes/focus-f3/SceneF3_5KeepDesigning';
import { SceneF3_6Pullback } from '../scenes/focus-f3/SceneF3_6Pullback';
import { SceneF3_7End } from '../scenes/focus-f3/SceneF3_7End';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: SceneEntry[] = [
    { range: [0, 180], Component: SceneF3_1Hook },
    { range: [180, 300], Component: SceneF3_2Dialog },
    { range: [480, 600], Component: SceneF3_3ConnectForm },
    { range: [1080, 420], Component: SceneF3_4FileTree },
    { range: [1500, 600], Component: SceneF3_5KeepDesigning },
    { range: [2100, 420], Component: SceneF3_6Pullback },
    { range: [2520, 180], Component: SceneF3_7End },
];

export const FocusF3: React.FC = () => {
    const { durationInFrames } = useVideoConfig();
    return (
        <AbsoluteFill style={{ background: palette.background }}>
            {TIMELINE.map(({ range, Component }, idx) => (
                <Sequence key={idx} {...s(range[0], range[1])}>
                    <Component />
                </Sequence>
            ))}
            <AudioTracks compositionFrames={durationInFrames} cues={FOCUS_F3_CUES} />
        </AbsoluteFill>
    );
};

export default FocusF3;
