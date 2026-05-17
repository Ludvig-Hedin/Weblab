export type {
    ActionStep,
    ActionStepKind,
    ActionStepPayload,
    Animation,
    AnimationRole,
    BgColorStep,
    BreakpointFlags,
    BreakpointId,
    EasingNamed,
    EasingSpec,
    Interaction,
    InteractionsBreakpoint,
    InteractionsDocument,
    MoveStep,
    NumericUnit,
    NumericValue,
    OpacityStep,
    RotateStep,
    ScaleStep,
    SizeStep,
    Target,
    TargetKind,
    Trigger,
    TriggerKind,
    TriggerOptions,
} from '@weblab/models';

export interface PlayOptions {
    triggerEl?: HTMLElement;
    restart?: boolean;
}

export interface IxPlayback {
    cancel(): void;
    finished: Promise<void>;
}

export interface IxRuntime {
    loadConfig(doc: import('@weblab/models').InteractionsDocument): void;
    reloadFromUrl(): Promise<void>;
    playInteraction(
        ixId: string,
        animationId: string,
        opts?: PlayOptions,
    ): IxPlayback | null;
    pauseInteraction(ixId: string, animationId: string): void;
    setScrubTime(ixId: string, animationId: string, tMs: number): void;
    applyInitialStates(): void;
    resolveTargets(ixId: string): HTMLElement[];
}

declare global {
    interface Window {
        __weblabIx?: IxRuntime;
    }
}
