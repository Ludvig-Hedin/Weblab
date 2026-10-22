import { describe, expect, it } from 'bun:test';
import {
    getAstFromContent,
    getContentFromAst,
    getJsxTextGaps,
    t,
    traverse,
    updateNodeTextContent,
} from '@weblab/parser';
import type { T } from '@weblab/parser';

import { createCloudEditorFiles } from './cloudEditorTemplate';
import { initialPilotContent } from './cloudPilot';

function element(source: string, oid: string): T.JSXElement {
    const ast = getAstFromContent(source);
    if (!ast) throw new Error('Generated source must parse');
    let found: T.JSXElement | undefined;
    traverse(ast, {
        JSXElement(path) {
            if (path.node.openingElement.attributes.some((attribute) =>
                t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name: 'data-oid' }) &&
                t.isStringLiteral(attribute.value, { value: oid }),
            )) found = path.node;
        },
    });
    if (!found) throw new Error(`Missing editor element: ${oid}`);
    return found;
}

function prop(node: T.JSXElement, name: string): string | undefined {
    const attribute = node.openingElement.attributes.find((attribute) =>
        t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name }),
    );
    return t.isJSXAttribute(attribute) && t.isStringLiteral(attribute.value) ? attribute.value.value : undefined;
}

describe('source-backed cloud starter', () => {
    it('contains a compilable two-page source tree with Tailwind and unique editor IDs', () => {
        const files = createCloudEditorFiles('Studio');
        const byPath = Object.fromEntries(files.map((file) => [file.path, file.content]));
        expect(Object.keys(byPath).length).toBe(files.length);
        for (const path of [
            'package.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs',
            'src/app/globals.css', 'src/app/layout.tsx', 'src/app/page.tsx', 'src/app/about/page.tsx',
            'public/_weblab/interactions.json', 'public/_weblab/interactions-initial.css',
        ]) expect(byPath[path]).toBeDefined();
        const manifest = JSON.parse(byPath['package.json']!);
        expect(manifest.scripts.dev).toContain('next dev');
        expect(manifest.scripts.build).toBe('next build');
        expect(manifest.dependencies.tailwindcss).toMatch(/4\./);
        expect(byPath['postcss.config.mjs']).toContain('@tailwindcss/postcss');
        expect(byPath['src/app/globals.css']).toContain("@import 'tailwindcss'");

        const ids: string[] = [];
        for (const file of files.filter((file) => file.path.endsWith('.tsx'))) {
            const ast = getAstFromContent(file.content);
            expect(ast).not.toBeNull();
            if (!ast) throw new Error(file.path);
            traverse(ast, {
                JSXElement(path) {
                    const name = path.node.openingElement.name;
                    if (!t.isJSXIdentifier(name) || name.name === 'Script') return;
                    const oid = prop(path.node, 'data-oid');
                    expect(oid).toBeDefined();
                    if (oid) ids.push(oid);
                },
            });
        }
        expect(new Set(ids).size).toBe(ids.length);
        expect(prop(element(byPath['src/app/layout.tsx']!, 'ce-layout-about'), 'href')).toBe('/about');
        expect(prop(element(byPath['src/app/page.tsx']!, 'ce-home-work'), 'id')).toBe('work');
        expect(prop(element(byPath['src/app/about/page.tsx']!, 'ce-about-contact'), 'id')).toBe('contact');
        expect(prop(element(byPath['src/app/page.tsx']!, 'ce-home-image'), 'src')).toBe('/studio-image.svg');
        expect(byPath['public/studio-image.svg']).toContain('<svg');
        expect(files.reduce((size, file) => size + file.content.length, 0)).toBeLessThan(40_000);
        expect(createCloudEditorFiles('Studio')).toEqual(files);
    });

    it('preserves arbitrary migrated text and remains editable with the actual editor parser', async () => {
        const title = '  A &amp; <script>alert("x")</script> {customer}\nNext line  ';
        const description = 'Quotes: " \' `; expressions: ${process.exit()} and {globalThis.evil()}\n\tMore > less';
        const imageUrl = 'https://images.example.com/photo?q=" onError={evil}&x=<tag>';
        const imageAlt = 'A "photo" & {title} <hello>';
        const ctaLabel = 'Say "hello" {friend}';
        const ctaHref = 'https://example.com/?q=" onClick={evil}&x=<tag>';
        const files = createCloudEditorFiles(title, {
            title, description, imageUrl, imageAlt, ctaLabel, ctaHref, alignment: 'center',
        });
        const home = files.find((file) => file.path === 'src/app/page.tsx')!.content;
        const layout = files.find((file) => file.path === 'src/app/layout.tsx')!.content;
        expect(getJsxTextGaps(element(layout, 'ce-layout-name'))?.[0]?.text).toBe(title);
        expect(getJsxTextGaps(element(home, 'ce-home-title'))?.[0]?.text).toBe(title);
        expect(getJsxTextGaps(element(home, 'ce-home-description'))?.[0]?.text).toBe(description);
        expect(getJsxTextGaps(element(home, 'ce-home-cta'))?.[0]?.text).toBe(ctaLabel);
        expect(prop(element(home, 'ce-home-cta'), 'href')).toBe(ctaHref);
        expect(prop(element(home, 'ce-home-image'), 'src')).toBe(imageUrl);
        expect(prop(element(home, 'ce-home-image'), 'alt')).toBe(imageAlt);
        expect(prop(element(home, 'ce-home-hero'), 'className')).toContain('text-center');

        const ast = getAstFromContent(home)!;
        traverse(ast, {
            JSXAttribute(path) {
                expect(t.isJSXIdentifier(path.node.name) && /^on[A-Z]/.test(path.node.name.name)).toBe(false);
                expect(t.isStringLiteral(path.node.value)).toBe(true);
            },
            JSXExpressionContainer(path) {
                expect(t.isStringLiteral(path.node.expression)).toBe(true);
            },
            JSXElement(path) {
                if (prop(path.node, 'data-oid') === 'ce-home-title') {
                    updateNodeTextContent(path.node, 'Edited <again> & {still literal}');
                }
            },
        });
        const edited = await getContentFromAst(ast, home);
        expect(getJsxTextGaps(element(edited, 'ce-home-title'))?.[0]?.text)
            .toBe('Edited <again> & {still literal}');
    });

    it('preserves empty legacy sections and rejects unsafe or unbounded input', () => {
        const files = createCloudEditorFiles('Studio', initialPilotContent('Existing title'));
        const home = files.find((file) => file.path === 'src/app/page.tsx')!.content;
        expect(getJsxTextGaps(element(home, 'ce-home-description'))?.[0]?.text ?? '').toBe('');
        expect(home).not.toContain('ce-home-cta');
        expect(home).not.toContain('<img');
        expect(() => createCloudEditorFiles(' ')).toThrow('CLOUD_EDITOR_INVALID_NAME');
        expect(() => createCloudEditorFiles('x'.repeat(161))).toThrow('CLOUD_EDITOR_INVALID_NAME');
        expect(() => createCloudEditorFiles('Studio', {
            ...initialPilotContent('Studio'), ctaLabel: 'Run', ctaHref: 'javascript:alert(1)',
        })).toThrow('PILOT_INVALID_LINK');
        expect(() => createCloudEditorFiles('Studio', {
            ...initialPilotContent('Studio'), description: 'x'.repeat(2001),
        })).toThrow('PILOT_INVALID_CONTENT');
    });
});
