import type { BreakpointEntry } from 'src/code-edit/responsive-rebase';
import { describe, expect, test } from 'bun:test';
import { rebaseToMobileFirst, tailwindPrefixForWidth } from 'src/code-edit/responsive-rebase';

const PHONE: Omit<BreakpointEntry, 'value'> = { id: 'phone', minWidth: 0, name: 'Phone' };
const TABLET: Omit<BreakpointEntry, 'value'> = { id: 'tablet', minWidth: 768, name: 'Tablet' };
const DESKTOP: Omit<BreakpointEntry, 'value'> = { id: 'desktop', minWidth: 1024, name: 'Desktop' };

describe('rebaseToMobileFirst', () => {
    test('only-Desktop edited → emits as base, no prefixes', () => {
        const out = rebaseToMobileFirst([
            { ...PHONE, value: undefined },
            { ...TABLET, value: undefined },
            { ...DESKTOP, value: '16px' },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]?.value).toBe('16px');
        expect(out[0]?.tailwindPrefix).toBe('');
    });

    test('only-Tablet edited → cascades to Desktop, emits as base', () => {
        const out = rebaseToMobileFirst([
            { ...PHONE, value: undefined },
            { ...TABLET, value: '8px' },
            { ...DESKTOP, value: undefined },
        ]);
        // Tablet's value cascades down to Phone (smallest defined gets emitted as base)
        // and up to Desktop. All three converge → one emit.
        expect(out).toHaveLength(1);
        expect(out[0]?.value).toBe('8px');
    });

    test('Desktop and Phone differ → mobile-first emit (Tablet inherits Desktop ⇒ md:)', () => {
        const out = rebaseToMobileFirst([
            { ...PHONE, value: '8px' },
            { ...TABLET, value: undefined },
            { ...DESKTOP, value: '16px' },
        ]);
        // Tablet's value cascades down from Desktop (16px), so the mobile-first
        // emit is base=8px, md:=16px (Desktop is identical to Tablet, no lg).
        expect(out).toHaveLength(2);
        expect(out[0]?.value).toBe('8px');
        expect(out[0]?.tailwindPrefix).toBe('');
        expect(out[1]?.value).toBe('16px');
        expect(out[1]?.tailwindPrefix).toBe('md:');
    });

    test('all three different → emits base + md: + lg:', () => {
        const out = rebaseToMobileFirst([
            { ...PHONE, value: '4px' },
            { ...TABLET, value: '8px' },
            { ...DESKTOP, value: '16px' },
        ]);
        expect(out).toHaveLength(3);
        expect(out.map((e) => e.tailwindPrefix)).toEqual(['', 'md:', 'lg:']);
        expect(out.map((e) => e.value)).toEqual(['4px', '8px', '16px']);
    });

    test('two breakpoints collide in the same prefix band → one class, larger minWidth wins', () => {
        // Desktop frame resized from 1024 down to 900 — still in the `md:` band
        // (768 ≤ 900 < 1024), so Tablet (768) and resized-Desktop (900) both map
        // to `md:`. Must emit a single `md:` class, not `md:8px md:16px` which
        // twMerge would silently collapse to the last value downstream.
        const out = rebaseToMobileFirst([
            { ...PHONE, value: '4px' },
            { ...TABLET, value: '8px' },
            { id: 'desktop', minWidth: 900, name: 'Desktop', value: '16px' },
        ]);
        const mdEntries = out.filter((e) => e.tailwindPrefix === 'md:');
        expect(mdEntries).toHaveLength(1);
        expect(mdEntries[0]?.value).toBe('16px');
        // No two emitted entries share a prefix.
        const prefixes = out.map((e) => e.tailwindPrefix);
        expect(new Set(prefixes).size).toBe(prefixes.length);
    });

    test('all three same → single base emit', () => {
        const out = rebaseToMobileFirst([
            { ...PHONE, value: '12px' },
            { ...TABLET, value: '12px' },
            { ...DESKTOP, value: '12px' },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]?.tailwindPrefix).toBe('');
    });

    test('custom breakpoint width without preset match → arbitrary @media prefix', () => {
        const out = rebaseToMobileFirst([
            { ...PHONE, value: '4px' },
            { id: 'custom', minWidth: 600, value: '12px' },
        ]);
        expect(out).toHaveLength(2);
        expect(out[0]?.tailwindPrefix).toBe('');
        expect(out[1]?.tailwindPrefix).toMatch(/^\[@media\(min-width:600px\)\]:$/);
    });

    test('non-default Tailwind config breakpoints', () => {
        const out = rebaseToMobileFirst(
            [
                { ...PHONE, value: '4px' },
                { id: 'tablet', minWidth: 900, value: '8px' },
            ],
            {
                tailwindPrefixes: { sm: 600, md: 900, lg: 1200 },
            },
        );
        expect(out[1]?.tailwindPrefix).toBe('md:');
    });

    test('only Phone edited → single base, no prefix', () => {
        const out = rebaseToMobileFirst([
            { ...PHONE, value: '6px' },
            { ...TABLET, value: undefined },
            { ...DESKTOP, value: undefined },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]?.tailwindPrefix).toBe('');
        expect(out[0]?.value).toBe('6px');
    });
});

describe('tailwindPrefixForWidth', () => {
    test('exact preset → matching prefix', () => {
        expect(tailwindPrefixForWidth(768)).toBe('md:');
        expect(tailwindPrefixForWidth(1024)).toBe('lg:');
        expect(tailwindPrefixForWidth(1280)).toBe('xl:');
    });

    test('snaps to nearest preset at-or-below the width', () => {
        // Desktop at 1200px → uses lg: (>=1024) since xl: (1280) is above.
        expect(tailwindPrefixForWidth(1200)).toBe('lg:');
        // Slightly above lg: keeps using lg:.
        expect(tailwindPrefixForWidth(1100)).toBe('lg:');
        // 900px → md: (768) since lg: (1024) is above.
        expect(tailwindPrefixForWidth(900)).toBe('md:');
    });

    test('below smallest preset → arbitrary @media', () => {
        expect(tailwindPrefixForWidth(500)).toMatch(/\[@media\(min-width:500px\)\]:/);
    });

    test('zero or negative → empty (base)', () => {
        expect(tailwindPrefixForWidth(0)).toBe('');
        expect(tailwindPrefixForWidth(-1)).toBe('');
    });
});
