import type { PenpalChildMethods as PenpalChildMethodsType } from '@weblab/web-preload/script/api';

// Preload methods should be treated as promises
export type PromisifiedPendpalChildMethods = {
    [K in keyof PenpalChildMethods]: (
        ...args: Parameters<PenpalChildMethods[K]>
    ) => Promise<Awaited<ReturnType<PenpalChildMethods[K]>>>;
};

export type PenpalChildMethods = PenpalChildMethodsType;

export const PENPAL_CHILD_CHANNEL = 'PENPAL_CHILD';
