import { type FC } from 'react';
import { loadFont } from '@remotion/google-fonts/Inter';

loadFont('normal', { weights: ['400', '500', '600'] });

export interface SceneEntry {
    range: [number, number];
    Component: FC;
}
