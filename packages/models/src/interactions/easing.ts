export type EasingNamed =
    | 'linear'
    | 'ease'
    | 'ease-in'
    | 'ease-out'
    | 'ease-in-out'
    | 'in-quad'
    | 'out-quad'
    | 'in-out-quad'
    | 'in-cubic'
    | 'out-cubic'
    | 'in-out-cubic'
    | 'in-quart'
    | 'out-quart'
    | 'in-out-quart'
    | 'in-back'
    | 'out-back'
    | 'in-out-back';

export type EasingSpec =
    | { kind: 'named'; name: EasingNamed }
    | { kind: 'cubic-bezier'; p1: [number, number]; p2: [number, number] }
    | { kind: 'spring'; mass: number; stiffness: number; damping: number };
