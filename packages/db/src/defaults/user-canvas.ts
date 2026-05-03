import type { UserCanvas as DbUserCanvas } from '@weblab/db';
import { DefaultSettings } from '@weblab/constants';

export const createDefaultUserCanvas = (
    userId: string,
    canvasId: string,
    overrides: Partial<DbUserCanvas> = {},
): DbUserCanvas => {
    return {
        userId,
        canvasId,
        scale: DefaultSettings.SCALE.toString(),
        x: DefaultSettings.PAN_POSITION.x.toString(),
        y: DefaultSettings.PAN_POSITION.y.toString(),
        ...overrides,
    };
};
