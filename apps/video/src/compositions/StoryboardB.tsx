import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { STORYBOARD_B_CUES } from '../audio/tracks';
import { SceneB1Reference } from '../scenes/storyboard-b/SceneB1Reference';
import { SceneB2AIBuilds } from '../scenes/storyboard-b/SceneB2AIBuilds';
import { SceneB3Refine } from '../scenes/storyboard-b/SceneB3Refine';
import { SceneB4Components } from '../scenes/storyboard-b/SceneB4Components';
import { SceneB5CMS } from '../scenes/storyboard-b/SceneB5CMS';
import { SceneB6Sync } from '../scenes/storyboard-b/SceneB6Sync';
import { SceneB7End } from '../scenes/storyboard-b/SceneB7End';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: SceneEntry[] = [
    { range: [0, 300], Component: SceneB1Reference },
    { range: [300, 900], Component: SceneB2AIBuilds },
    { range: [1200, 900], Component: SceneB3Refine },
    { range: [2100, 900], Component: SceneB4Components },
    { range: [3000, 900], Component: SceneB5CMS },
    { range: [3900, 900], Component: SceneB6Sync },
    { range: [4800, 600], Component: SceneB7End },
];

export const StoryboardB: React.FC = () => {
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
                cues={STORYBOARD_B_CUES}
                musicVolume={0.35}
            />
        </AbsoluteFill>
    );
};
