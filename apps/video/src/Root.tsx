import React from 'react';
import { Composition } from 'remotion';

import { FocusF1 } from './compositions/FocusF1';
import { FocusF2 } from './compositions/FocusF2';
import { FocusF3 } from './compositions/FocusF3';
import { StoryboardA } from './compositions/StoryboardA';
import { StoryboardB } from './compositions/StoryboardB';
import { StoryboardC } from './compositions/StoryboardC';
import { StoryboardD } from './compositions/StoryboardD';
import { StoryboardE } from './compositions/StoryboardE';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="WeblabExplainerC"
                component={StoryboardC}
                durationInFrames={5400}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="WeblabExplainerA"
                component={StoryboardA}
                durationInFrames={4500}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="WeblabExplainerB"
                component={StoryboardB}
                durationInFrames={5400}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="WeblabExplainerD"
                component={StoryboardD}
                durationInFrames={5400}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="WeblabExplainerE"
                component={StoryboardE}
                durationInFrames={6300}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="WeblabFocusF1"
                component={FocusF1}
                durationInFrames={2700}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="WeblabFocusF2"
                component={FocusF2}
                durationInFrames={2700}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="WeblabFocusF3"
                component={FocusF3}
                durationInFrames={2700}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
        </>
    );
};
