import { describe, expect, test } from 'bun:test';
import { rebaseToMobileFirst, tailwindPrefixForWidth } from '@weblab/parser';
import { breakpointMinWidth, parseProjectBreakpoints, readProjectBreakpoints, readProjectStylesheet } from './project-breakpoints';

describe('one exact project breakpoint scope', () => {
    test('uses configured named thresholds and exact media between them', () => {
        const prefixes = parseProjectBreakpoints('@import "tailwindcss"; @theme { --breakpoint-lg: 1280px; --breakpoint-wide: 1500px; }');
        expect(tailwindPrefixForWidth(1280, prefixes, true)).toBe('lg:');
        expect(tailwindPrefixForWidth(1200, prefixes, true)).toBe('[@media(min-width:1200px)]:');
        expect(tailwindPrefixForWidth(1500, prefixes, true)).toBe('wide:');
        const entries = rebaseToMobileFirst([
            { id: 'tablet', minWidth: 900, value: '1px' },
            { id: 'desktop', minWidth: 1200, value: '2px' },
        ], { tailwindPrefixes: prefixes, exactThresholds: true });
        expect(entries.map((entry) => entry.tailwindPrefix)).toEqual([
            '[@media(min-width:900px)]:', '[@media(min-width:1200px)]:',
        ]);
    });

    test('honors reset/deleted and unsupported breakpoint declarations', () => {
        const prefixes = parseProjectBreakpoints('@import "tailwindcss"; @theme { --breakpoint-*: initial; --breakpoint-md: 768px; --breakpoint-raw: var(--query); }');
        expect(prefixes).toEqual({ md: 768 });
        expect(tailwindPrefixForWidth(1024, prefixes, true)).toBe('[@media(min-width:1024px)]:');
    });

    test('never assumes JS raw/max screens or imported themes are min-width defaults', () => {
        expect(parseProjectBreakpoints('@import "tailwindcss"; @config "./tailwind.config.ts";')).toEqual({});
        expect(parseProjectBreakpoints('@import "tailwindcss"; @import "./theme.css";')).toEqual({});
    });

    test('loads only the stylesheet wired to the branch layout', async () => {
        const files: Record<string, string> = {
            'src/app/layout.tsx': 'export default function Layout() {}',
            'src/app/globals.css': '@import "tailwindcss"; @theme { --breakpoint-lg: 999px; }',
            'app/layout.tsx': 'import "./globals.css";',
            'app/globals.css': '@import "tailwindcss"; @theme { --breakpoint-lg: 1234px; }',
        };
        expect((await readProjectBreakpoints(async (path) => files[path] ?? ''))['lg']).toBe(1234);
        files['app/globals.css'] = '@import "tailwindcss"; @theme { --breakpoint-lg: 1300px; }';
        expect((await readProjectBreakpoints(async (path) => files[path] ?? ''))['lg']).toBe(1300);
    });

    test('relative and default screens do not pretend to have exact pixel thresholds', () => {
        const prefixes = parseProjectBreakpoints('@import "tailwindcss"; @theme { --breakpoint-lg: 80rem; --breakpoint-tablet: 48em; }');
        expect(prefixes).toEqual({});
        expect(tailwindPrefixForWidth(1280, prefixes, true)).toBe('[@media(min-width:1280px)]:');
    });

    test('ignores inactive globals files and refuses ambiguous wired layouts', async () => {
        const files: Record<string, string> = {
            'legacy/globals.css': '@import "tailwindcss"; @theme { --color-brand: red; }',
            'src/app/layout.tsx': '// import "./globals.css";\nexport default function Layout() {}',
            'src/app/globals.css': '@import "tailwindcss"; @theme { --color-brand: red; }',
            'app/layout.tsx': 'import "./globals.css";',
            'app/globals.css': '@import "tailwindcss"; @theme { --color-brand: blue; }',
        };
        const read = async (path: string) => files[path] ?? '';
        expect((await readProjectStylesheet(read))?.path).toBe('app/globals.css');
        files['src/app/layout.tsx'] = 'import "./globals.css";';
        expect(await readProjectStylesheet(read)).toBeNull();
    });

    test('preview base scope and exact written scope share the same width', () => {
        expect(breakpointMinWidth(375, 375)).toBe(0);
        const width = breakpointMinWidth(1200, 375);
        expect(width).toBe(1200);
        expect(tailwindPrefixForWidth(width, {}, true)).toBe(`[@media(min-width:${width}px)]:`);
    });
});
