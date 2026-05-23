import { nanoid } from 'nanoid/non-secure';

import type { Animation, AnimationRole, Interaction, TriggerKind } from '@weblab/models';

const ID = (prefix: string) => `${prefix}_${nanoid(8)}`;

export function makeAnimation(role: AnimationRole, name: string): Animation {
    return {
        id: ID('an'),
        name,
        role,
        steps: [],
    };
}

function defaultAnimationsFor(triggerKind: TriggerKind): Animation[] {
    switch (triggerKind) {
        case 'mouse-click':
            return [
                makeAnimation('on-first-click', 'First click'),
                makeAnimation('on-second-click', 'Second click'),
            ];
        case 'mouse-hover':
            return [
                makeAnimation('on-hover-in', 'Hover in'),
                makeAnimation('on-hover-out', 'Hover out'),
            ];
        case 'page-load':
            return [makeAnimation('on-page-load', 'Reveal')];
        default:
            return [makeAnimation('on-trigger', 'Animation')];
    }
}

export function makeInteraction(opts: {
    triggerKind: TriggerKind;
    sourceIxId: string | null;
    name?: string;
}): Interaction {
    const now = Date.now();
    return {
        id: ID('ix'),
        name: opts.name ?? defaultInteractionName(opts.triggerKind),
        enabled: true,
        breakpoints: {},
        trigger: {
            kind: opts.triggerKind,
            sourceIxId: opts.sourceIxId,
        },
        target: {
            kind: opts.triggerKind === 'page-load' ? 'class' : 'self',
            value: null,
        },
        animations: defaultAnimationsFor(opts.triggerKind),
        createdAt: now,
        updatedAt: now,
    };
}

function defaultInteractionName(kind: TriggerKind): string {
    switch (kind) {
        case 'mouse-click':
            return 'Click interaction';
        case 'mouse-hover':
            return 'Hover interaction';
        case 'page-load':
            return 'Page load animation';
        default:
            return 'Interaction';
    }
}
