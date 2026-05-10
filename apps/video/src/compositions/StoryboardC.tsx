import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

import { AudioTracks } from '../audio/AudioTracks';
import { STORYBOARD_C_CUES } from '../audio/tracks';
import { Scene01HookText } from '../scenes/Scene01HookText';
import { Scene02Widgets } from '../scenes/Scene02Widgets';
import { Scene03Fuse } from '../scenes/Scene03Fuse';
import { Scene04EditorWide } from '../scenes/Scene04EditorWide';
import { Scene05AITeammate } from '../scenes/Scene05AITeammate';
import { Scene06RefineCanvas } from '../scenes/Scene06RefineCanvas';
import { Scene07Components } from '../scenes/Scene07Components';
import { Scene08BringYourSite } from '../scenes/Scene08BringYourSite';
import { Scene09Collaborate } from '../scenes/Scene09Collaborate';
import { Scene10CodeStaysYours } from '../scenes/Scene10CodeStaysYours';
import { Scene11ExportOrPublish } from '../scenes/Scene11ExportOrPublish';
import { Scene12End } from '../scenes/Scene12End';
import { s } from '../utils/sequence';
import { palette } from '../utils/tokens';
import { type SceneEntry } from './shared';

const TIMELINE: SceneEntry[] = [
    { range: [0, 180], Component: Scene01HookText },
    { range: [180, 300], Component: Scene02Widgets },
    { range: [480, 240], Component: Scene03Fuse },
    { range: [720, 480], Component: Scene04EditorWide },
    { range: [1200, 600], Component: Scene05AITeammate },
    { range: [1800, 480], Component: Scene06RefineCanvas },
    { range: [2280, 600], Component: Scene07Components },
    { range: [2880, 420], Component: Scene08BringYourSite },
    { range: [3300, 420], Component: Scene09Collaborate },
    { range: [3720, 480], Component: Scene10CodeStaysYours },
    { range: [4200, 600], Component: Scene11ExportOrPublish },
    { range: [4800, 600], Component: Scene12End },
];

export const StoryboardC: React.FC = () => {
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
                cues={STORYBOARD_C_CUES}
                musicVolume={0.35}
            />
        </AbsoluteFill>
    );
};
