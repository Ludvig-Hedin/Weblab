import type { Animation } from './action-step';
import type { Target } from './target';
import type { BreakpointFlags, BreakpointId, Trigger } from './trigger';

export interface Interaction {
    id: string;
    name: string;
    enabled: boolean;
    breakpoints: BreakpointFlags;
    trigger: Trigger;
    target: Target;
    animations: Animation[];
    createdAt: number;
    updatedAt: number;
}

export interface InteractionsBreakpoint {
    id: BreakpointId;
    name: string;
    minWidth: number;
}

export interface InteractionsDocument {
    version: 1;
    breakpoints: InteractionsBreakpoint[];
    interactions: Interaction[];
}

export const EMPTY_INTERACTIONS_DOCUMENT: InteractionsDocument = {
    version: 1,
    breakpoints: [],
    interactions: [],
};
