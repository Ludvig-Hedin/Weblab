import { describe, expect, test } from 'bun:test';
import {
    applyResponsiveTailwind,
    removeUtilityClasses,
    tailwindClassFor,
} from 'src/code-edit/responsive-classes';

describe('tailwindClassFor', () => {
    test('padding 16px → p-4', () => {
        expect(tailwindClassFor('padding', '16px')).toBe('p-4');
    });

    test('padding-top with arbitrary px → pt-[17px]', () => {
        expect(tailwindClassFor('paddingTop', '17px')).toBe('pt-[17px]');
    });

    test('display: none → hidden', () => {
        expect(tailwindClassFor('display', 'none')).toBe('hidden');
    });

    test('background-color → bg-[…]', () => {
        expect(tailwindClassFor('backgroundColor', '#abcdef')).toBe('bg-[#abcdef]');
    });

    test('unknown property → null', () => {
        expect(tailwindClassFor('grid-template-columns', 'repeat(3, 1fr)')).toBeNull();
    });
});

describe('removeUtilityClasses', () => {
    test('strips base + variant classes for the same family', () => {
        expect(removeUtilityClasses('p-4 md:p-2 lg:p-8 bg-red-500', 'p')).toBe('bg-red-500');
    });

    test('preserves unrelated families', () => {
        expect(removeUtilityClasses('p-4 m-2', 'p')).toBe('m-2');
    });

    test('empty utility (display) preserves non-display tokens', () => {
        expect(removeUtilityClasses('p-4 bg-red-500', '')).toBe('p-4 bg-red-500');
    });

    test('empty utility strips bare display tokens (block, flex)', () => {
        expect(removeUtilityClasses('block flex md:hidden p-4', '')).toBe('p-4');
    });

    test('empty utility strips a single display token', () => {
        expect(removeUtilityClasses('block', '')).toBe('');
    });

    test('empty utility strips arbitrary [display:...] utilities', () => {
        expect(removeUtilityClasses('[display:grid] p-4', '')).toBe('p-4');
    });

    test('removes both base and responsive padding tokens', () => {
        expect(removeUtilityClasses('p-4 md:p-8', 'p')).toBe('');
    });
});

describe('applyResponsiveTailwind', () => {
    test('only-Desktop intent → unprefixed base', () => {
        const out = applyResponsiveTailwind('flex gap-2', 'padding', [
            { tailwindPrefix: '', value: '16px' },
        ]);
        expect(out.split(/\s+/).sort()).toEqual(['flex', 'gap-2', 'p-4']);
    });

    test('mobile-first intent → base + md:', () => {
        const out = applyResponsiveTailwind('flex', 'padding', [
            { tailwindPrefix: '', value: '8px' },
            { tailwindPrefix: 'md:', value: '16px' },
        ]);
        expect(out).toContain('p-2');
        expect(out).toContain('md:p-4');
    });

    test('clears stale variants for the same family', () => {
        const out = applyResponsiveTailwind('p-12 md:p-2 lg:p-8', 'padding', [
            { tailwindPrefix: '', value: '16px' },
        ]);
        expect(out).not.toContain('md:p-2');
        expect(out).not.toContain('lg:p-8');
        expect(out).toContain('p-4');
    });
});
