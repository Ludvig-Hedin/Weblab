import { applyEasing } from './easing';
import {
    applyComposite,
    getComposite,
    snapshotComposite,
    type Composite,
} from './style-writer';

import type {
    ActionStep,
    ActionStepPayload,
    Animation,
    NumericValue,
    PlayOptions,
    IxPlayback,
} from './types';

interface PlaybackRecord {
    el: HTMLElement;
    startMs: number;
    duration: number;
    steps: ActionStep[];
    initialComposite: Composite;
    cancelled: boolean;
    resolve: () => void;
    paused: boolean;
    pausedAtMs: number;
}

const ACTIVE = new Map<HTMLElement, Map<string, PlaybackRecord>>();
let rafId: number | null = null;

function getActiveFor(el: HTMLElement, animationId: string): PlaybackRecord | undefined {
    return ACTIVE.get(el)?.get(animationId);
}

function setActiveFor(el: HTMLElement, animationId: string, rec: PlaybackRecord) {
    let bucket = ACTIVE.get(el);
    if (!bucket) {
        bucket = new Map();
        ACTIVE.set(el, bucket);
    }
    bucket.set(animationId, rec);
}

function removeActive(el: HTMLElement, animationId: string) {
    const bucket = ACTIVE.get(el);
    if (!bucket) return;
    bucket.delete(animationId);
    if (bucket.size === 0) ACTIVE.delete(el);
}

function ensureLoop() {
    if (rafId != null) return;
    const tick = () => {
        rafId = null;
        const now = performance.now();
        let anyAlive = false;

        ACTIVE.forEach((bucket, el) => {
            bucket.forEach((rec, animationId) => {
                if (rec.cancelled) {
                    removeActive(el, animationId);
                    return;
                }
                if (rec.paused) {
                    anyAlive = true;
                    return;
                }
                const t = now - rec.startMs;
                applyAtTime(rec, t);
                if (t >= rec.duration) {
                    rec.resolve();
                    removeActive(el, animationId);
                } else {
                    anyAlive = true;
                }
            });
        });

        if (anyAlive) {
            rafId = requestAnimationFrame(tick);
        }
    };
    rafId = requestAnimationFrame(tick);
}

function lerpNumber(from: number, to: number, p: number): number {
    return from + (to - from) * p;
}

function lerpNumeric(from: NumericValue | undefined, to: NumericValue, p: number): NumericValue {
    const fv = from?.value ?? 0;
    return { value: lerpNumber(fv, to.value, p), unit: to.unit };
}

function applyStep(
    composite: Composite,
    payload: ActionStepPayload,
    p: number,
): Composite {
    switch (payload.kind) {
        case 'move': {
            if (payload.x) composite.tx = lerpNumeric(composite.tx, payload.x, p);
            if (payload.y) composite.ty = lerpNumeric(composite.ty, payload.y, p);
            if (payload.z) composite.tz = lerpNumeric(composite.tz, payload.z, p);
            return composite;
        }
        case 'scale': {
            const fromSx = composite.sx ?? 1;
            const fromSy = composite.sy ?? 1;
            if (payload.x != null) composite.sx = lerpNumber(fromSx, payload.x, p);
            if (payload.y != null) {
                composite.sy = lerpNumber(fromSy, payload.y, p);
            } else if (payload.lockAspect && payload.x != null) {
                composite.sy = composite.sx;
            }
            return composite;
        }
        case 'rotate': {
            composite.rz = lerpNumeric(composite.rz, payload.z, p);
            return composite;
        }
        case 'opacity': {
            const from = composite.opacity ?? 1;
            composite.opacity = lerpNumber(from, payload.value, p);
            return composite;
        }
        case 'size': {
            if (payload.width) {
                composite.width = lerpNumeric(composite.width, payload.width, p);
            }
            if (payload.height) {
                composite.height = lerpNumeric(composite.height, payload.height, p);
            }
            return composite;
        }
        case 'bg-color': {
            // No interpolation in v1; snap at midpoint to keep deterministic.
            if (p >= 0.5) {
                composite.bgColor = payload.color;
            }
            return composite;
        }
        default:
            return composite;
    }
}

function applyAtTime(rec: PlaybackRecord, t: number): void {
    const composite: Composite = { ...rec.initialComposite };
    for (const step of rec.steps) {
        const localStart = step.startAt + step.delay;
        const localEnd = localStart + step.duration;
        let p: number;
        if (t < localStart) continue;
        if (step.duration <= 0) {
            p = 1;
        } else if (t >= localEnd) {
            p = 1;
        } else {
            p = (t - localStart) / step.duration;
        }
        const eased = applyEasing(p, step.easing);
        applyStep(composite, step.payload, eased);
    }
    applyComposite(rec.el, composite);
}

export function computeTotalDuration(animation: Animation): number {
    let max = 0;
    for (const step of animation.steps) {
        const end = step.startAt + step.delay + step.duration;
        if (end > max) max = end;
    }
    return max;
}

export function playAnimationOnElement(
    el: HTMLElement,
    animationId: string,
    animation: Animation,
    opts?: PlayOptions,
): IxPlayback {
    const existing = getActiveFor(el, animationId);
    if (existing && !opts?.restart) {
        existing.cancelled = true;
    }

    const initialComposite = snapshotComposite(el);
    const totalDuration = computeTotalDuration(animation);

    let resolve!: () => void;
    const finished = new Promise<void>((res) => {
        resolve = res;
    });

    const rec: PlaybackRecord = {
        el,
        startMs: performance.now(),
        duration: totalDuration,
        steps: animation.steps.filter((s) => !s.isInitial),
        initialComposite,
        cancelled: false,
        resolve,
        paused: false,
        pausedAtMs: 0,
    };

    setActiveFor(el, animationId, rec);
    ensureLoop();

    return {
        cancel() {
            rec.cancelled = true;
            resolve();
        },
        finished,
    };
}

export function pauseAnimationOnElement(el: HTMLElement, animationId: string): void {
    const rec = getActiveFor(el, animationId);
    if (!rec || rec.paused) return;
    rec.paused = true;
    rec.pausedAtMs = performance.now() - rec.startMs;
}

export function scrubAnimationOnElement(
    el: HTMLElement,
    animationId: string,
    animation: Animation,
    tMs: number,
): void {
    const existing = getActiveFor(el, animationId);
    const initialComposite = existing?.initialComposite ?? snapshotComposite(el);
    const rec: PlaybackRecord = {
        el,
        startMs: performance.now() - tMs,
        duration: computeTotalDuration(animation),
        steps: animation.steps.filter((s) => !s.isInitial),
        initialComposite,
        cancelled: false,
        resolve: () => {
            // no-op for scrub
        },
        paused: true,
        pausedAtMs: tMs,
    };
    setActiveFor(el, animationId, rec);
    applyAtTime(rec, tMs);
}

export function applyInitialStepsToElement(el: HTMLElement, animation: Animation): void {
    // Initial states are the BASELINE for an element — they must not compose
    // onto residual transforms from a previously played animation. Start from
    // an empty composite so calling applyInitialStates() effectively resets
    // the element to its declared initial appearance.
    const next: Composite = {};
    for (const step of animation.steps) {
        if (!step.isInitial) continue;
        applyStep(next, step.payload, 1);
    }
    applyComposite(el, next);
}
