import { describe, expect, test } from 'bun:test';

import type { CodeDiffRequest } from '@weblab/models/code';
import { StyleChangeType } from '@weblab/models/style';

import { addResponsiveTailwindToRequest, addTailwindToRequest, getTailwindClasses } from './tailwind';

function request(className: string): CodeDiffRequest {
    return {
        oid: 'element',
        branchId: 'branch',
        attributes: { className },
        tagName: null,
        textContent: null,
        overrideClasses: null,
        structureChanges: [],
    };
}

describe('responsive source classes', () => {
    test('layer visibility values produce durable Tailwind classes', () => {
        expect(getTailwindClasses('element', {
            visibility: { type: StyleChangeType.Value, value: 'hidden' },
        })).toContain('invisible');
        expect(getTailwindClasses('element', {
            visibility: { type: StyleChangeType.Value, value: 'visible' },
        })).toContain('visible');
    });

    test('a Desktop edit keeps the Phone base class', () => {
        const target = request('p-2 text-lg');
        addTailwindToRequest(target, {
            padding: { type: StyleChangeType.Value, value: '16px' },
        }, 'lg:');
        expect(target.attributes.className).toBe('p-2 text-lg lg:p-[16px]');
    });

    test('a later Desktop edit replaces only its own breakpoint class', () => {
        const target = request('p-2 lg:p-[16px]');
        addTailwindToRequest(target, {
            padding: { type: StyleChangeType.Value, value: '32px' },
        }, 'lg:');
        expect(target.attributes.className).toBe('p-2 lg:p-[32px]');
    });

    test('a Tablet-only edit stays prefixed', () => {
        const target = request('p-2 text-lg');
        addResponsiveTailwindToRequest(target, 'padding', [
            { id: 'tablet', minWidth: 768, value: '16px' },
        ]);
        expect(target.attributes.className).toContain('md:p-[16px]');
        expect(target.attributes.className).toContain('p-2');
    });

    test('clearing Tablet removes its exact authored token and keeps other classes', () => {
        const target = request('p-2 md:p-[16px] text-lg');
        addResponsiveTailwindToRequest(target, 'padding', [], [
            { id: 'tablet', minWidth: 768, value: '16px' },
        ]);
        expect(target.attributes.className).toBe('p-2 text-lg');
    });
});
