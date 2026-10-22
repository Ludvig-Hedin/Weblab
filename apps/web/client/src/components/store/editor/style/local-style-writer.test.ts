import { describe, expect, it } from 'bun:test';

import { affectsLocalTailwindStyleWriter, hasLocalTailwindStyleWriter, hasUnsupportedResponsiveStyleValue } from './local-style-writer';

const valid = new Map<string, string>([
    ['package.json', JSON.stringify({ dependencies: { next: '15.5.0', tailwindcss: '^4.1.0', '@tailwindcss/postcss': '^4.1.0' } })],
    ['postcss.config.mjs', 'export default { plugins: { "@tailwindcss/postcss": {} } };'],
    ['src/app/layout.tsx', 'import "./globals.css"; export default function Layout() {}'],
    ['src/app/globals.css', '@import "tailwindcss";'],
]);

const detects = (files: Map<string, string>, sourcePaths?: readonly string[]) => hasLocalTailwindStyleWriter(async (path) => {
    const content = files.get(path);
    if (content === undefined) throw new Error('missing');
    return content;
}, sourcePaths);

describe('responsive values without a round-trip writer', () => {
    const frames = [
        { frame: { branchId: 'branch', breakpoint: { width: 390 } } },
        { frame: { branchId: 'branch', breakpoint: { width: 1440 } } },
    ];
    it('allows named tokens and plain values above base', () => {
        const target = {
            branchId: 'branch', breakpoint: { minWidth: 1440 },
            change: { updated: { color: { type: 'custom' } } },
        };
        expect(hasUnsupportedResponsiveStyleValue([target], frames)).toBe(false);
        expect(hasUnsupportedResponsiveStyleValue([{
            ...target, change: { updated: { color: { type: 'value' } } },
        }], frames)).toBe(false);
    });
    it('rejects a font stack above base', () => {
        expect(hasUnsupportedResponsiveStyleValue([{
            branchId: 'branch', breakpoint: { minWidth: 1440 },
            change: { updated: { fontFamily: { type: 'value' } } },
        }], frames)).toBe(true);
        expect(hasUnsupportedResponsiveStyleValue([{
            branchId: 'branch', breakpoint: { minWidth: 390 },
            change: { updated: { fontFamily: { type: 'value' } } },
        }], frames)).toBe(false);
    });
});

describe('local visual style writer capability', () => {
    it('accepts a wired Next.js App Router Tailwind v4 project', async () => {
        expect(await detects(valid)).toBe(true);
    });

    it('accepts an isolated site layout without treating the Studio as website CSS', async () => {
        const files = new Map(valid);
        files.delete('src/app/layout.tsx');
        files.delete('src/app/globals.css');
        files.set('src/app/(site)/layout.tsx', 'import "./globals.css"; export default function Layout() {}');
        files.set('src/app/(site)/globals.css', '@import "tailwindcss";');
        files.set('src/app/(studio)/layout.tsx', 'export default function StudioLayout() {}');
        expect(await detects(files)).toBe(true);
        files.set('src/app/(site)/layout.tsx', 'export default function Layout() {}');
        expect(await detects(files)).toBe(false);
        expect(affectsLocalTailwindStyleWriter('src/app/(site)/layout.tsx')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('app/(site)/globals.css')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('src/app/(studio)/layout.tsx')).toBe(true);
    });

    it('rejects a dependency without a wired build plugin or imported stylesheet', async () => {
        const noPlugin = new Map(valid);
        noPlugin.set('postcss.config.mjs', '/* "@tailwindcss/postcss" */ export default { plugins: {} };');
        expect(await detects(noPlugin)).toBe(false);
        const noLayoutImport = new Map(valid);
        noLayoutImport.set('src/app/layout.tsx', '/* import "./globals.css" */ export default function Layout() {}');
        expect(await detects(noLayoutImport)).toBe(false);
        const noCssImport = new Map(valid);
        noCssImport.set('src/app/globals.css', '/* @import "tailwindcss"; */ body { color: red }');
        expect(await detects(noCssImport)).toBe(false);
    });

    it('rejects disabled Tailwind source scanning and other CSS systems', async () => {
        const disabled = new Map(valid);
        disabled.set('src/app/globals.css', '@import "tailwindcss" source(none);');
        expect(await detects(disabled)).toBe(false);
        const noTailwind = new Map(valid);
        noTailwind.set('package.json', JSON.stringify({ dependencies: { next: '15.5.0' } }));
        expect(await detects(noTailwind)).toBe(false);
    });

    it('tracks only files that can disconnect the style writer', () => {
        expect(affectsLocalTailwindStyleWriter('src/app/globals.css')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('postcss.config.mjs')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('src/app/page.tsx')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('src/app/(studio)/page.tsx')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('app/[locale]/page.jsx')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('src/components/page.tsx')).toBe(false);
        expect(affectsLocalTailwindStyleWriter('src/app/[locale]/layout.js')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('src/styles/tokens.css')).toBe(true);
        expect(affectsLocalTailwindStyleWriter('src/components/hero.module.css')).toBe(true);
    });

    it('accepts locale-relative Tailwind wiring without promising CSS Modules writes', async () => {
        const files = new Map(valid);
        files.delete('src/app/layout.tsx');
        files.set('src/app/[locale]/layout.tsx', 'import "../globals.css"; export default function Layout({children}) { return <html><body>{children}</body></html>; }');
        files.set('src/app/globals.css', '@import "tailwindcss"; @import "../styles/tokens.css";');
        files.set('src/styles/tokens.css', ':root { --brand: red; }');
        expect(await detects(files, [...files.keys()])).toBe(true);
        files.set('src/app/(studio)/layout.tsx', 'export default function Studio() { return <html><body /></html>; }');
        expect(await detects(files, [...files.keys()])).toBe(false);
    });

    it('invalidates capability when an uncovered sibling page enters the inventory', async () => {
        const files = new Map(valid);
        files.delete('src/app/layout.tsx');
        files.set('src/app/(site)/layout.tsx', 'import "../globals.css"; export default function Layout({children}) { return <html><body>{children}</body></html>; }');
        expect(await detects(files, [...files.keys()])).toBe(true);
        const sibling = 'src/app/(studio)/page.tsx';
        expect(affectsLocalTailwindStyleWriter(sibling)).toBe(true);
        files.set(sibling, 'export default function Studio() { return <main />; }');
        expect(await detects(files, [...files.keys()])).toBe(false);
        files.delete(sibling);
        expect(await detects(files, [...files.keys()])).toBe(true);
    });
});
