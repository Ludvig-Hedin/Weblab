import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { STORYBOARD_E_CUES } from '../audio/tracks';
import { SceneE1Designers } from '../scenes/storyboard-e/SceneE1Designers';
import { SceneE2Builders } from '../scenes/storyboard-e/SceneE2Builders';
import { SceneE3Both } from '../scenes/storyboard-e/SceneE3Both';
import { SceneE4Demo } from '../scenes/storyboard-e/SceneE4Demo';
import { SceneE5BringYourSite } from '../scenes/storyboard-e/SceneE5BringYourSite';
import { SceneE6End } from '../scenes/storyboard-e/SceneE6End';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: readonly SceneEntry[] = [
    { range: [0, 900], Component: SceneE1Designers },
    { range: [900, 900], Component: SceneE2Builders },
    { range: [1800, 1200], Component: SceneE3Both },
    { range: [3000, 1500], Component: SceneE4Demo },
    { range: [4500, 1200], Component: SceneE5BringYourSite },
    { range: [5700, 600], Component: SceneE6End },
];

export const StoryboardE: React.FC = () => {
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
                cues={STORYBOARD_E_CUES}
                musicVolume={0.35}
            />
        </AbsoluteFill>
    );
};

export default StoryboardE;
