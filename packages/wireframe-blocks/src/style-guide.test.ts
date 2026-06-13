import { describe, expect, test } from 'bun:test';

import { asStyleGuideTokens, styleGuideToCssVars, styleGuideToGlobalsAppend } from './style-guide';

describe('style guide helpers', () => {
    test('asStyleGuideTokens narrows arbitrary JSON to known string fields', () => {
        const parsed = asStyleGuideTokens({
            primary: 'oklch(0.2 0 0)',
            radius: '0.5rem',
            fontHeading: 'Sora',
            bogus: 123,
            nested: { x: 1 },
        });
        expect(parsed.primary).toBe('oklch(0.2 0 0)');
        expect(parsed.radius).toBe('0.5rem');
        expect(parsed.fontHeading).toBe('Sora');
        expect('bogus' in parsed).toBe(false);
        expect(asStyleGuideTokens(null)).toEqual({});
        expect(asStyleGuideTokens('nope')).toEqual({});
    });

    test('styleGuideToCssVars emits only set tokens + body font', () => {
        const vars = styleGuideToCssVars({
            primary: '#111',
            background: '#fff',
            fontBody: 'Inter',
        });
        expect(vars['--primary']).toBe('#111');
        expect(vars['--background']).toBe('#fff');
        expect(vars.fontFamily).toContain('Inter');
        expect('--muted' in vars).toBe(false);
    });

    test('styleGuideToCssVars ignores empty values', () => {
        const vars = styleGuideToCssVars({ primary: '', radius: '   ' });
        expect('--primary' in vars).toBe(false);
        expect('--radius' in vars).toBe(false);
    });

    test('styleGuideToGlobalsAppend produces a :root override block + font rules', () => {
        const css = styleGuideToGlobalsAppend({
            primary: 'oklch(0.3 0.1 250)',
            radius: '0.75rem',
            fontHeading: 'Sora',
            fontBody: 'Inter',
        });
        expect(css).toContain(':root {');
        expect(css).toContain('--primary: oklch(0.3 0.1 250);');
        expect(css).toContain('--radius: 0.75rem;');
        expect(css).toContain('body { font-family:');
        expect(css).toContain('h1, h2, h3, h4 { font-family:');
        expect(css).toContain('Sora');
    });

    test('styleGuideToGlobalsAppend is empty for no tokens', () => {
        expect(styleGuideToGlobalsAppend({})).toBe('');
    });
});
