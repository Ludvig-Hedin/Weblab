import { EditorAttributes } from '@weblab/constants';

import type { Target } from './types';

const IX_ATTR = EditorAttributes.DATA_WEBLAB_IX_ID;

function cssEscape(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

export function findElementByIxId(ixId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[${IX_ATTR}="${cssEscape(ixId)}"]`);
}

export function findElementsByIxId(ixId: string): HTMLElement[] {
    return Array.from(
        document.querySelectorAll<HTMLElement>(`[${IX_ATTR}="${cssEscape(ixId)}"]`),
    );
}

export function resolveTargets(
    triggerEl: HTMLElement | null,
    target: Target,
): HTMLElement[] {
    switch (target.kind) {
        case 'self':
            return triggerEl ? [triggerEl] : [];
        case 'parent':
            if (!triggerEl?.parentElement) return [];
            return [triggerEl.parentElement];
        case 'sibling': {
            if (!triggerEl?.parentElement) return [];
            const all = Array.from(triggerEl.parentElement.children) as HTMLElement[];
            const filtered = all.filter((c) => c !== triggerEl);
            if (!target.value) return filtered;
            // value is an ix-id under parent
            return filtered.filter((c) => c.getAttribute(IX_ATTR) === target.value);
        }
        case 'child': {
            if (!triggerEl) return [];
            if (!target.value) {
                return Array.from(triggerEl.children) as HTMLElement[];
            }
            return Array.from(
                triggerEl.querySelectorAll<HTMLElement>(
                    `[${IX_ATTR}="${cssEscape(target.value)}"]`,
                ),
            );
        }
        case 'class': {
            if (!target.value) return [];
            return Array.from(
                document.querySelectorAll<HTMLElement>(`.${cssEscape(target.value)}`),
            );
        }
        case 'ix-id': {
            if (!target.value) return [];
            return findElementsByIxId(target.value);
        }
        default:
            return [];
    }
}
