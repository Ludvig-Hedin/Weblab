import type { EasingNamed, EasingSpec } from './types';

const NAMED_BEZIERS: Record<EasingNamed, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1],
    'in-quad': [0.55, 0.085, 0.68, 0.53],
    'out-quad': [0.25, 0.46, 0.45, 0.94],
    'in-out-quad': [0.455, 0.03, 0.515, 0.955],
    'in-cubic': [0.55, 0.055, 0.675, 0.19],
    'out-cubic': [0.215, 0.61, 0.355, 1],
    'in-out-cubic': [0.645, 0.045, 0.355, 1],
    'in-quart': [0.895, 0.03, 0.685, 0.22],
    'out-quart': [0.165, 0.84, 0.44, 1],
    'in-out-quart': [0.77, 0, 0.175, 1],
    'in-back': [0.6, -0.28, 0.735, 0.045],
    'out-back': [0.175, 0.885, 0.32, 1.275],
    'in-out-back': [0.68, -0.55, 0.265, 1.55],
};

function bezier(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    t: number,
): number {
    // Newton-Raphson approximation for cubic-bezier(x1, y1, x2, y2)
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    let u = t;
    for (let i = 0; i < 6; i++) {
        const x = ((ax * u + bx) * u + cx) * u - t;
        if (Math.abs(x) < 1e-5) break;
        const dx = (3 * ax * u + 2 * bx) * u + cx;
        if (Math.abs(dx) < 1e-6) break;
        u -= x / dx;
    }
    return ((ay * u + by) * u + cy) * u;
}

export function applyEasing(t: number, spec: EasingSpec): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (spec.kind === 'named') {
        const b = NAMED_BEZIERS[spec.name];
        if (!b) return t;
        return bezier(b[0], b[1], b[2], b[3], t);
    }
    if (spec.kind === 'cubic-bezier') {
        const [x1, y1] = spec.p1;
        const [x2, y2] = spec.p2;
        return bezier(x1, y1, x2, y2, t);
    }
    // Spring reserved; fall back to ease-out approximation.
    return bezier(0, 0, 0.58, 1, t);
}
