export type TargetKind = 'self' | 'parent' | 'sibling' | 'child' | 'class' | 'ix-id';

export interface Target {
    kind: TargetKind;
    value: string | null;
}
