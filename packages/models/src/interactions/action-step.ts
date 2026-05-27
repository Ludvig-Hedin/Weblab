import type { EasingSpec } from './easing';
import type { Target } from './target';

export type ActionStepKind = 'move' | 'scale' | 'rotate' | 'opacity' | 'size' | 'bg-color';

export type NumericUnit = 'px' | '%' | 'rem' | 'em' | 'deg' | 'rad' | 'turn' | 'none';

export interface NumericValue {
    value: number;
    unit: NumericUnit;
}

export interface MoveStep {
    kind: 'move';
    x?: NumericValue;
    y?: NumericValue;
    z?: NumericValue;
}

export interface ScaleStep {
    kind: 'scale';
    x?: number;
    y?: number;
    lockAspect?: boolean;
}

export interface RotateStep {
    kind: 'rotate';
    z: NumericValue;
}

export interface OpacityStep {
    kind: 'opacity';
    value: number;
}

export interface SizeStep {
    kind: 'size';
    width?: NumericValue;
    height?: NumericValue;
}

export interface BgColorStep {
    kind: 'bg-color';
    color: string;
}

export type ActionStepPayload =
    | MoveStep
    | ScaleStep
    | RotateStep
    | OpacityStep
    | SizeStep
    | BgColorStep;

export interface ActionStep {
    id: string;
    startAt: number;
    duration: number;
    delay: number;
    easing: EasingSpec;
    payload: ActionStepPayload;
    isInitial: boolean;
}

export type AnimationRole =
    | 'on-trigger'
    | 'on-hover-in'
    | 'on-hover-out'
    | 'on-first-click'
    | 'on-second-click'
    | 'on-page-load';

export interface Animation {
    id: string;
    name: string;
    role: AnimationRole;
    targetOverride?: Target;
    steps: ActionStep[];
}
