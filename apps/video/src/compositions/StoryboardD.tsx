import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { STORYBOARD_D_CUES } from '../audio/tracks';
import { SceneDCh1Canvas } from '../scenes/storyboard-d/SceneDCh1Canvas';
import { SceneDCh2AI } from '../scenes/storyboard-d/SceneDCh2AI';
import { SceneDCh3Components } from '../scenes/storyboard-d/SceneDCh3Components';
import { SceneDCh4Sync } from '../scenes/storyboard-d/SceneDCh4Sync';
import { SceneDCh5Publish } from '../scenes/storyboard-d/SceneDCh5Publish';
import { SceneDIntro } from '../scenes/storyboard-d/SceneDIntro';
import { SceneDOutro } from '../scenes/storyboard-d/SceneDOutro';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: readonly SceneEntry[] = [
    { range: [0, 450], Component: SceneDIntro },
    { range: [450, 900], Component: SceneDCh1Canvas },
    { range: [1350, 900], Component: SceneDCh2AI },
    { range: [2250, 900], Component: SceneDCh3Components },
    { range: [3150, 900], Component: SceneDCh4Sync },
    { range: [4050, 900], Component: SceneDCh5Publish },
    { range: [4950, 450], Component: SceneDOutro },
];

export const StoryboardD: React.FC = () => {
    const { durationInFrames } = useVideoConfig();
    return (
        <AbsoluteFill style={{ background: palette.background }}>
            {TIMELINE.map(({ range, Component }, idx) => (
                <Sequence key={idx} {...s(range[0], range[1])}>
                    <Component />
                </Sequence>
            ))}
            <AudioTracks
                compositionFrames={durationInFrames}
                cues={STORYBOARD_D_CUES}
                musicVolume={0.35}
            />
        </AbsoluteFill>
    );
};

export default StoryboardD;
