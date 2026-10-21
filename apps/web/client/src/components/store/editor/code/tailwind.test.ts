import { describe, expect, test } from 'bun:test';

import type { CodeDiffRequest } from '@weblab/models/code';
import { StyleChangeType } from '@weblab/models/style';
import { getAstFromContent, getContentFromAst, transformAst } from '@weblab/parser';

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

    test('a fresh removal request removes named source classes and keeps other variants/properties', async () => {
        const source = '<div data-oid="element" id="kept" className="p-2 md:bg-brand md:!bg-brand ' +
            'md:text-lg md:hover:bg-brand lg:bg-brand text-brand" />';
        const ast = getAstFromContent(source);
        if (!ast) throw new Error('Invalid fixture');
        const target = request('');
        addResponsiveTailwindToRequest(target, 'background-color', [], [
            { id: 'tablet', minWidth: 768, value: 'rgb(0, 0, 255)' },
        ], { tailwindPrefixes: { md: 768 }, exactThresholds: true });
        transformAst(ast, new Map([['element', target]]));
        const output = await getContentFromAst(ast, source);
        expect(output).not.toMatch(/(?:\s|")md:!?bg-brand(?:\s|")/);
        expect(output).toContain('md:hover:bg-brand');
        expect(output).toContain('lg:bg-brand');
        expect(output).toContain('md:text-lg');
        expect(output).toContain('text-brand');
        expect(output).toContain('p-2');
        expect(output).toContain('id="kept"');
    });

    test('reset at an exact arbitrary threshold leaves nearby media variants intact', async () => {
        const source = '<div data-oid="element" className="p-2 [@media(min-width:1200px)]:p-8 [@media(min-width:1280px)]:p-16 hover:p-4" />';
        const ast = getAstFromContent(source);
        if (!ast) throw new Error('Invalid fixture');
        const target = request('');
        addResponsiveTailwindToRequest(target, 'padding', [], [
            { id: 'desktop', minWidth: 1200, value: '32px' },
        ], { tailwindPrefixes: {}, exactThresholds: true });
        transformAst(ast, new Map([['element', target]]));
        const output = await getContentFromAst(ast, source);
        expect(output).not.toContain('1200px');
        expect(output).toContain('[@media(min-width:1280px)]:p-16');
        expect(output).toContain('hover:p-4');
        expect(output).toContain('p-2');
    });

    test('refused dynamic removal leaves the complete source unchanged', async () => {
        const source = '<div data-oid="element" className={cn("md:p-4", active && "p-2")} />';
        const ast = getAstFromContent(source);
        if (!ast) throw new Error('Invalid fixture');
        const before = await getContentFromAst(ast, source);
        const target = request('');
        addResponsiveTailwindToRequest(target, 'padding', [], [
            { id: 'tablet', minWidth: 768, value: '16px' },
        ]);
        expect(() => transformAst(ast, new Map([['element', target]]))).toThrow('Dynamic classes');
        expect(await getContentFromAst(ast, source)).toBe(before);
    });
});
