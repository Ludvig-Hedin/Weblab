import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { STORYBOARD_A_CUES } from '../audio/tracks';
import { SceneA1Hook } from '../scenes/storyboard-a/SceneA1Hook';
import { SceneA2Widgets } from '../scenes/storyboard-a/SceneA2Widgets';
import { SceneA3Fuse } from '../scenes/storyboard-a/SceneA3Fuse';
import { SceneA4DesignWithAI } from '../scenes/storyboard-a/SceneA4DesignWithAI';
import { SceneA5BringYourSite } from '../scenes/storyboard-a/SceneA5BringYourSite';
import { SceneA6Montage } from '../scenes/storyboard-a/SceneA6Montage';
import { SceneA7End } from '../scenes/storyboard-a/SceneA7End';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: SceneEntry[] = [
    { range: [0, 180], Component: SceneA1Hook },
    { range: [180, 420], Component: SceneA2Widgets },
    { range: [600, 480], Component: SceneA3Fuse },
    { range: [1080, 1020], Component: SceneA4DesignWithAI },
    { range: [2100, 900], Component: SceneA5BringYourSite },
    { range: [3000, 900], Component: SceneA6Montage },
    { range: [3900, 600], Component: SceneA7End },
];

export const StoryboardA: React.FC = () => {
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
                cues={STORYBOARD_A_CUES}
                musicVolume={0.35}
            />
        </AbsoluteFill>
    );
};
