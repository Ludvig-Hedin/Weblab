import type { Frame, FrameBreakpoint } from '@weblab/models';

import type { Frame as DbFrame } from '../../schema';
import { DEFAULT_BREAKPOINT_PRESETS } from '../../defaults/frame';

const DEFAULT_BREAKPOINT: FrameBreakpoint = {
    id: 'desktop',
    name: 'Desktop',
    width: 1200,
    order: 0,
};

const breakpointFromDb = (dbFrame: DbFrame): FrameBreakpoint => {
    const id = dbFrame.breakpointId ?? DEFAULT_BREAKPOINT.id;
    const name = dbFrame.breakpointName ?? DEFAULT_BREAKPOINT.name;
    const order =
        dbFrame.breakpointOrder !== null && dbFrame.breakpointOrder !== undefined
            ? Number(dbFrame.breakpointOrder)
            : DEFAULT_BREAKPOINT.order;
    // Resolve canonical breakpoint width from presets rather than the frame's
    // current dimension — a resized frame should not change the breakpoint width.
    const preset = DEFAULT_BREAKPOINT_PRESETS.find((p) => p.id === id);
    const width = preset?.width ?? DEFAULT_BREAKPOINT.width;
    return { id, name, width, order };
};

export const fromDbFrame = (dbFrame: DbFrame): Frame => {
    if (dbFrame.branchId === null) {
        throw new Error('Frame branchId should not be null');
    }
    return {
        id: dbFrame.id,
        canvasId: dbFrame.canvasId,
        branchId: dbFrame.branchId,
        url: dbFrame.url,
        position: {
            x: Number(dbFrame.x),
            y: Number(dbFrame.y),
        },
        dimension: {
            width: Number(dbFrame.width),
            height: Number(dbFrame.height),
        },
        groupId: dbFrame.groupId ?? dbFrame.id,
        breakpoint: breakpointFromDb(dbFrame),
    };
};

export const toDbFrame = (frame: Frame): DbFrame => {
    return {
        id: frame.id,
        branchId: frame.branchId,
        canvasId: frame.canvasId,
        url: frame.url,
        x: frame.position.x.toString(),
        y: frame.position.y.toString(),
        width: frame.dimension.width.toString(),
        height: frame.dimension.height.toString(),

        groupId: frame.groupId,
        breakpointId: frame.breakpoint.id,
        breakpointName: frame.breakpoint.name,
        breakpointOrder: frame.breakpoint.order.toString(),

        // deprecated
        type: null,
    };
};

export const toDbPartialFrame = (frame: Partial<Frame>): Partial<DbFrame> => {
    return {
        id: frame.id,
        url: frame.url,
        x: frame.position?.x.toString(),
        y: frame.position?.y.toString(),
        canvasId: frame.canvasId,
        width: frame.dimension?.width.toString(),
        height: frame.dimension?.height.toString(),
        groupId: frame.groupId,
        breakpointId: frame.breakpoint?.id,
        breakpointName: frame.breakpoint?.name,
        breakpointOrder: frame.breakpoint?.order?.toString(),
    };
};
