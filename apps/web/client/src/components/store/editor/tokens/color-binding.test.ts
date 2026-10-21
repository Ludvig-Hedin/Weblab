import { describe, expect, test } from 'bun:test';

import {
    classForColorLiteral,
    classForColorVariable,
    findColorClassBinding,
    replaceColorClass,
} from './color-binding';

const vars = new Set(['color-brand', 'color-brand-muted']);

describe('findColorClassBinding', () => {
    test('finds a theme color utility', () => {
        expect(findColorClassBinding('background-color', 'p-4 bg-brand', vars)).toEqual({
            className: 'bg-brand',
            varName: 'color-brand',
            builtIn: false,
        });
    });

    test('reads arbitrary and shorthand var syntax', () => {
        expect(findColorClassBinding('color', 'text-(--ink)', vars)?.varName).toBe('ink');
        expect(findColorClassBinding('color', 'text-[var(--ink)]', vars)?.varName).toBe('ink');
    });

    test('keeps the opacity modifier out of the name', () => {
        expect(findColorClassBinding('background-color', 'bg-brand/50', vars)?.varName).toBe(
            'color-brand',
        );
    });

    test('marks the Tailwind palette as built in', () => {
        expect(findColorClassBinding('border-color', 'border-2 border-red-500', vars)).toEqual({
            className: 'border-red-500',
            varName: 'color-red-500',
            builtIn: true,
        });
    });

    test('ignores variants, sizes and literals', () => {
        expect(findColorClassBinding('background-color', 'hover:bg-brand', vars)).toBeNull();
        expect(findColorClassBinding('color', 'text-lg text-center', vars)).toBeNull();
        expect(findColorClassBinding('background-color', 'bg-[#ff0000]', vars)).toBeNull();
    });
});

describe('replaceColorClass', () => {
    test('swaps a variable for a literal and keeps other classes', () => {
        expect(
            replaceColorClass(
                'background-color',
                'p-4 bg-brand hover:bg-red-500',
                'bg-[#FF0000]',
                vars,
            ),
        ).toBe('p-4 hover:bg-red-500 bg-[#FF0000]');
    });

    test('removes literal and palette colors when binding', () => {
        expect(
            replaceColorClass('color', 'text-lg text-[#111] text-white', 'text-brand', vars),
        ).toBe('text-lg text-brand');
    });

    test('leaves non-color border classes alone', () => {
        expect(replaceColorClass('border-color', 'border border-2 border-brand', null, vars)).toBe(
            'border border-2',
        );
    });
});

describe('edge forms', () => {
    test('reads bracketed opacity modifiers and trailing important', () => {
        expect(findColorClassBinding('background-color', 'bg-brand/[.5]', vars)?.varName).toBe(
            'color-brand',
        );
        expect(findColorClassBinding('background-color', 'bg-brand/(--a)', vars)?.varName).toBe(
            'color-brand',
        );
        expect(findColorClassBinding('background-color', 'bg-red-500!', vars)?.varName).toBe(
            'color-red-500',
        );
    });

    test('strips color-mix literals', () => {
        expect(
            replaceColorClass('color', 'text-[color-mix(in_oklab,red,blue)]', 'text-brand', vars),
        ).toBe('text-brand');
    });
});

describe('class builders', () => {
    test('uses the theme utility for color variables', () => {
        expect(classForColorVariable('background-color', 'color-brand')).toBe('bg-brand');
        expect(classForColorVariable('color', 'ink')).toBe('text-(--ink)');
    });

    test('wraps literals in an arbitrary value', () => {
        expect(classForColorLiteral('border-color', '#FF0000')).toBe('border-[#FF0000]');
        expect(classForColorLiteral('color', 'rgb(0, 0, 0)')).toBe('text-[rgb(0,_0,_0)]');
    });
});
