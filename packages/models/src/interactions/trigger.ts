import type { BreakpointId } from '../project/frame';

export type { BreakpointId };

export type BreakpointFlags = Record<string, boolean>;

export type TriggerKind =
    | 'mouse-click'
    | 'mouse-second-click'
    | 'mouse-hover'
    | 'page-load'
    | 'scroll-into-view'
    | 'scroll-out-of-view'
    | 'while-scrolling'
    | 'mouse-move';

export interface TriggerOptions {
    autoReverseOnHoverOut?: boolean;
    preventDefault?: boolean;
}

export interface Trigger {
    kind: TriggerKind;
    sourceIxId: string | null;
    sourceIndex?: number;
    options?: TriggerOptions;
}
