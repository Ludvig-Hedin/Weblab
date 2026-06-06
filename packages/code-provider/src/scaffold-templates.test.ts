import { describe, expect, test } from 'bun:test';

import {
    getStaticHtmlScaffoldFiles,
    STATIC_HTML_SCAFFOLD_PORT,
    WEBLAB_NEXTJS_GLOBALS_CSS,
} from './scaffold-templates';

describe('scaffold templates', () => {
    test('static-html scaffold is a coherent, bootable file set', () => {
        const files = getStaticHtmlScaffoldFiles();
        const byPath = new Map(files.map((f) => [f.path, f.content]));

        // Required files for a `serve` static-HTML project + the weblab runtime.
        for (const p of [
            'package.json',
            'index.html',
            'styles.css',
            'public/_weblab/interactions.json',
            'public/_weblab/interactions-initial.css',
        ]) {
            expect(byPath.has(p)).toBe(true);
        }

        const pkg = JSON.parse(byPath.get('package.json')!) as {
            scripts: { dev: string };
            dependencies: Record<string, string>;
        };
        // Dev script must bind the port the frame URL is built from.
        expect(pkg.scripts.dev).toContain(String(STATIC_HTML_SCAFFOLD_PORT));
        expect(pkg.dependencies.serve).toBeDefined();

        // interactions.json must be valid JSON so the IX runtime gets a 200.
        expect(() => {
            JSON.parse(byPath.get('public/_weblab/interactions.json')!);
        }).not.toThrow();

        // index.html needs an editable root for the canvas.
        expect(byPath.get('index.html')).toContain('<main></main>');
    });
});

describe('next.js scaffold design tokens (WEBLAB_NEXTJS_GLOBALS_CSS)', () => {
    const css = WEBLAB_NEXTJS_GLOBALS_CSS;

    test('is a valid Tailwind v4 + shadcn token stylesheet', () => {
        expect(css).toContain("@import 'tailwindcss';");
        expect(css).toContain('@custom-variant dark');
        expect(css).toContain('@theme inline');
        expect(css).toContain(':root {');
        expect(css).toContain('.dark {');
        // Impure neutrals / one accent: values are OKLCH, never raw hex.
        expect(css).toContain('oklch(');
        expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    test('defines the shadcn CSS-var contract and maps it to color utilities', () => {
        // Every token shadcn components rely on must exist in :root...
        const required = [
            'background',
            'foreground',
            'card',
            'popover',
            'primary',
            'secondary',
            'muted',
            'accent',
            'destructive',
            'border',
            'input',
            'ring',
        ];
        for (const t of required) {
            expect(css).toContain(`--${t}:`);
            // ...and be mapped so `bg-${t}` / `text-${t}` resolve in Tailwind v4.
            expect(css).toContain(`--color-${t}: var(--${t});`);
        }
        // Radius scale present for differentiated component radii.
        expect(css).toContain('--radius:');
        expect(css).toContain('--radius-lg: var(--radius);');
    });

    test('every mapped --color-* points at a token defined in :root', () => {
        const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'));
        const defined = new Set([...rootBlock.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
        const mappings = [...css.matchAll(/--color-[a-z0-9-]+:\s*var\((--[a-z0-9-]+)\)/g)].map(
            (m) => m[1],
        );
        expect(mappings.length).toBeGreaterThan(0);
        for (const ref of mappings) {
            expect(defined.has(ref)).toBe(true);
        }
    });
});
