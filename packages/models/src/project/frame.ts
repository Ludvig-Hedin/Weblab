import type { Orientation, Theme } from '@weblab/constants';

import type { RectDimension, RectPosition } from './rect';

export interface Frame {
    // IDs
    id: string;
    branchId: string;
    canvasId: string;

    // display data
    position: RectPosition;
    dimension: RectDimension;

    // content
    url: string;
}

export interface WindowMetadata {
    orientation: Orientation;
    aspectRatioLocked: boolean;
    device: string;
    theme: Theme;
    width: number;
    height: number;
}
