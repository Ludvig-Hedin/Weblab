import { resolveTargets, findElementByIxId } from './target-resolver';
import {
    applyInitialStepsToElement,
    playAnimationOnElement,
} from './timeline';

import type {
    Animation,
    Interaction,
    InteractionsDocument,
    BreakpointId,
} from './types';

const TEARDOWN: Array<() => void> = [];
let clickCounts = new WeakMap<HTMLElement, number>();

function detach() {
    while (TEARDOWN.length > 0) {
        const fn = TEARDOWN.pop();
        try {
            fn?.();
        } catch {
            // ignore
        }
    }
    clickCounts = new WeakMap();
}

function currentBreakpointId(doc: InteractionsDocument): BreakpointId | null {
    if (doc.breakpoints.length === 0) return null;
    const w = window.innerWidth;
    // Sort descending by minWidth, pick first match.
    const sorted = [...doc.breakpoints].sort((a, b) => b.minWidth - a.minWidth);
    for (const bp of sorted) {
        if (w >= bp.minWidth) return bp.id;
    }
    return sorted[sorted.length - 1]?.id ?? null;
}

function isEnabledOnBreakpoint(ix: Interaction, bpId: BreakpointId | null): boolean {
    if (!ix.enabled) return false;
    if (!bpId) return true;
    const flag = ix.breakpoints[bpId];
    return flag !== false;
}

function findAnimation(ix: Interaction, role: Animation['role']): Animation | undefined {
    return ix.animations.find((a) => a.role === role);
}

function resolveAnimationTargets(ix: Interaction, animation: Animation, triggerEl: HTMLElement | null): HTMLElement[] {
    const target = animation.targetOverride ?? ix.target;
    return resolveTargets(triggerEl, target);
}

function playAnimation(ix: Interaction, animation: Animation, triggerEl: HTMLElement | null) {
    const targets = resolveAnimationTargets(ix, animation, triggerEl);
    for (const el of targets) {
        playAnimationOnElement(el, animation.id, animation, { restart: true });
    }
}

export function attachAllTriggers(doc: InteractionsDocument) {
    detach();

    for (const ix of doc.interactions) {
        switch (ix.trigger.kind) {
            case 'mouse-click':
                attachClick(ix, doc);
                break;
            case 'mouse-hover':
                attachHover(ix, doc);
                break;
            case 'page-load':
                runPageLoad(ix, doc);
                break;
            default:
                // scroll/mouse-move reserved, ignored in v1
                break;
        }
    }
}

function attachClick(ix: Interaction, doc: InteractionsDocument) {
    const sourceId = ix.trigger.sourceIxId;
    if (!sourceId) return;
    const el = findElementByIxId(sourceId);
    if (!el) return;

    const handler = (event: MouseEvent) => {
        if (!isEnabledOnBreakpoint(ix, currentBreakpointId(doc))) return;
        if (ix.trigger.options?.preventDefault) event.preventDefault();

        const count = (clickCounts.get(el) ?? 0) + 1;
        clickCounts.set(el, count);

        const role = count % 2 === 1 ? 'on-first-click' : 'on-second-click';
        const animation = findAnimation(ix, role);
        if (animation) playAnimation(ix, animation, el);
    };

    el.addEventListener('click', handler);
    TEARDOWN.push(() => el.removeEventListener('click', handler));
}

function attachHover(ix: Interaction, doc: InteractionsDocument) {
    const sourceId = ix.trigger.sourceIxId;
    if (!sourceId) return;
    const el = findElementByIxId(sourceId);
    if (!el) return;

    const onEnter = () => {
        if (!isEnabledOnBreakpoint(ix, currentBreakpointId(doc))) return;
        const animation = findAnimation(ix, 'on-hover-in');
        if (animation) playAnimation(ix, animation, el);
    };
    const onLeave = () => {
        if (!isEnabledOnBreakpoint(ix, currentBreakpointId(doc))) return;
        const animation = findAnimation(ix, 'on-hover-out');
        if (animation) playAnimation(ix, animation, el);
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    TEARDOWN.push(() => el.removeEventListener('mouseenter', onEnter));
    TEARDOWN.push(() => el.removeEventListener('mouseleave', onLeave));
}

function runPageLoad(ix: Interaction, doc: InteractionsDocument) {
    if (!isEnabledOnBreakpoint(ix, currentBreakpointId(doc))) return;
    const animation = findAnimation(ix, 'on-page-load');
    if (!animation) return;

    const trigger = () => {
        // For page-load, the "trigger element" is the document body; targets
        // are resolved against the animation's target (typically class or ix-id).
        playAnimation(ix, animation, document.body);
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        queueMicrotask(trigger);
    } else {
        const handler = () => {
            document.removeEventListener('DOMContentLoaded', handler);
            trigger();
        };
        document.addEventListener('DOMContentLoaded', handler);
        TEARDOWN.push(() => document.removeEventListener('DOMContentLoaded', handler));
    }
}

export function applyAllInitialStates(doc: InteractionsDocument) {
    for (const ix of doc.interactions) {
        for (const animation of ix.animations) {
            const hasInitial = animation.steps.some((s) => s.isInitial);
            if (!hasInitial) continue;
            const target = animation.targetOverride ?? ix.target;
            const triggerEl = ix.trigger.sourceIxId
                ? findElementByIxId(ix.trigger.sourceIxId)
                : document.body;
            const targets = resolveTargets(triggerEl, target);
            for (const el of targets) {
                applyInitialStepsToElement(el, animation);
            }
        }
    }
}

export function findAnimationById(
    doc: InteractionsDocument,
    ixId: string,
    animationId: string,
): { ix: Interaction; animation: Animation } | null {
    const ix = doc.interactions.find((i) => i.id === ixId);
    if (!ix) return null;
    const animation = ix.animations.find((a) => a.id === animationId);
    if (!animation) return null;
    return { ix, animation };
}
