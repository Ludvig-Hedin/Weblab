import { v4 as uuidv4 } from 'uuid';

import type { Frame as DbFrame } from '@weblab/db';

export enum DefaultFrameType {
    DESKTOP = 'desktop',
    MOBILE = 'mobile',
}

export interface BreakpointPreset {
    id: 'desktop' | 'tablet' | 'phone';
    name: string;
    width: number;
    height: number;
    order: number;
}

export const DEFAULT_BREAKPOINT_PRESETS: readonly BreakpointPreset[] = [
    { id: 'desktop', name: 'Desktop', width: 1200, height: 960, order: 0 },
    { id: 'tablet', name: 'Tablet', width: 810, height: 1200, order: 1 },
    { id: 'phone', name: 'Phone', width: 390, height: 844, order: 2 },
] as const;

export const GROUP_GUTTER = 80;
export const GROUP_TOP = 40;

export const DefaultDesktopFrame = {
    x: '150',
    y: String(GROUP_TOP),
    width: String(DEFAULT_BREAKPOINT_PRESETS[0]!.width),
    height: String(DEFAULT_BREAKPOINT_PRESETS[0]!.height),
} as const;

export const DefaultMobileFrame = {
    x: '1600',
    y: String(GROUP_TOP),
    width: String(DEFAULT_BREAKPOINT_PRESETS[2]!.width),
    height: String(DEFAULT_BREAKPOINT_PRESETS[2]!.height),
} as const;

const DefaultFrame: Record<
    DefaultFrameType,
    { x: string; y: string; width: string; height: string }
> = {
    [DefaultFrameType.DESKTOP]: DefaultDesktopFrame,
    [DefaultFrameType.MOBILE]: DefaultMobileFrame,
} as const;

export const createDefaultFrame = ({
    canvasId,
    branchId,
    url,
    type = DefaultFrameType.DESKTOP,
    overrides,
}: {
    canvasId: string;
    branchId: string;
    url: string;
    type?: DefaultFrameType;
    overrides?: Partial<DbFrame>;
}): DbFrame => {
    const defaultFrame = DefaultFrame[type];
    const groupId = uuidv4();
    const preset =
        type === DefaultFrameType.MOBILE
            ? DEFAULT_BREAKPOINT_PRESETS[2]!
            : DEFAULT_BREAKPOINT_PRESETS[0]!;
    return {
        id: uuidv4(),
        canvasId,
        branchId,
        url,
        x: defaultFrame.x,
        y: defaultFrame.y,
        width: defaultFrame.width,
        height: defaultFrame.height,
        groupId,
        breakpointId: preset.id,
        breakpointName: preset.name,
        breakpointOrder: preset.order.toString(),
        ...overrides,

        // deprecated
        type: null,
    };
};

/**
 * Create a Desktop+Tablet+Phone group of frames, all sharing one URL,
 * laid out left-to-right with a fixed gutter, sharing one groupId.
 */
export const createDefaultBreakpointGroup = ({
    canvasId,
    branchId,
    url,
    startX = 150,
    startY = GROUP_TOP,
    overrides,
}: {
    canvasId: string;
    branchId: string;
    url: string;
    startX?: number;
    startY?: number;
    overrides?: Partial<DbFrame>;
}): DbFrame[] => {
    const groupId = uuidv4();
    let cursorX = startX;
    return DEFAULT_BREAKPOINT_PRESETS.map((preset) => {
        const frame: DbFrame = {
            id: uuidv4(),
            canvasId,
            branchId,
            url,
            x: cursorX.toString(),
            y: startY.toString(),
            width: preset.width.toString(),
            height: preset.height.toString(),
            groupId,
            breakpointId: preset.id,
            breakpointName: preset.name,
            breakpointOrder: preset.order.toString(),
            ...overrides,
            type: null,
        };
        cursorX += preset.width + GROUP_GUTTER;
        return frame;
    });
};
