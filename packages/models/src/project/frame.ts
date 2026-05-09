import type { Orientation, Theme } from '@weblab/constants';

import type { RectDimension, RectPosition } from './rect';

export type BreakpointId = 'desktop' | 'tablet' | 'phone' | (string & {});

export interface FrameBreakpoint {
    id: BreakpointId;
    name: string;
    width: number;
    order: number;
}

export interface Frame {
    // IDs
    id: string;
    branchId: string;
    canvasId: string;

    // group + responsive metadata
    groupId: string;
    breakpoint: FrameBreakpoint;

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
