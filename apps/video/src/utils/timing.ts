import { Easing, interpolate, spring } from 'remotion';

// eslint-disable-next-line @typescript-eslint/unbound-method -- Remotion's Easing returns plain functions; no `this` binding needed.
const QUAD = Easing.quad;
// eslint-disable-next-line @typescript-eslint/unbound-method -- Remotion's Easing returns plain functions; no `this` binding needed.
const CUBIC = Easing.cubic;
// eslint-disable-next-line @typescript-eslint/unbound-method -- Remotion's Easing returns plain functions; no `this` binding needed.
const EASE_OUT = Easing.out;
// eslint-disable-next-line @typescript-eslint/unbound-method -- Remotion's Easing returns plain functions; no `this` binding needed.
const EASE_IN_OUT = Easing.inOut;

export const easeOutQuart: (t: number) => number = EASE_OUT(QUAD);
export const easeOutCubic: (t: number) => number = EASE_OUT(CUBIC);
export const easeInOutQuad: (t: number) => number = EASE_IN_OUT(QUAD);

export type EasingFn = (t: number) => number;

/**
 * Wrapper around `interpolate` that applies an easing function and
 * extrapolates clamped on both edges by default.
 */
export const interp = (
    frame: number,
    range: readonly [number, number],
    output: readonly [number, number],
    easing: EasingFn = easeOutQuart,
): number =>
    interpolate(frame, [range[0], range[1]], [output[0], output[1]], {
        easing,
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

export const SPRING_PRESETS = {
    landing: { damping: 22, stiffness: 180, mass: 1 },
    subtle: { damping: 26, stiffness: 120, mass: 1 },
} as const;

export const sceneSpring = (
    frame: number,
    fps: number,
    preset: keyof typeof SPRING_PRESETS = 'landing',
): number =>
    spring({
        frame,
        fps,
        config: SPRING_PRESETS[preset],
    });
