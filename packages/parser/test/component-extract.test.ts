import { describe, expect, test } from 'bun:test';
import { getAstFromContent, getContentFromAst } from 'src';
import {
    addVariant,
    addVariantProp,
    detachInstance,
    extractComponent,
    suggestPropExtractions,
    updateVariantClasses,
} from 'src/component';

import type { ComponentDef } from '@weblab/models';

describe('extractComponent', () => {
    const page = `
        import Image from 'next/image';
        export default function Home() {
            return (
                <main data-oid="main1">
                    <div data-oid="card1" className="card">
                        <h3 data-oid="h1">Hello</h3>
                        <img data-oid="img1" src="/cat.png" />
                        <a data-oid="a1" href="/about">About</a>
                    </div>
                </main>
            );
        }
    `;

    test('extracts subtree into a new component with hoisted props', async () => {
        const ast = getAstFromContent(page)!;
        const result = extractComponent(ast, {
            rootOid: 'card1',
            componentName: 'InfoCard',
            importPath: '@/components/InfoCard',
            propExtractions: [
                { sourceOid: 'h1', kind: 'text', propName: 'title' },
                { sourceOid: 'img1', kind: 'image', propName: 'image' },
            ],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.componentFileContent).toContain('export function InfoCard');
        expect(result.componentFileContent).toContain('interface InfoCardProps');
        expect(result.componentFileContent).toContain('title = "Hello"');
        expect(result.componentFileContent).toContain('image = "/cat.png"');
        expect(result.componentFileContent).toContain('{title}');
        expect(result.componentFileContent).toContain('src={image}');
        // oids stripped — fresh ones minted on write
        expect(result.componentFileContent).not.toContain('data-oid');

        const source = await getContentFromAst(ast, page);
        expect(source).toContain('<InfoCard');
        expect(source).toContain(`data-oid="${result.instanceOid}"`);
        expect(source).toContain(`import { InfoCard } from "@/components/InfoCard"`);
        expect(source).not.toContain('card');
    });

    test('fails with actionable error on closure capture', () => {
        const code = `
            export default function Home() {
                const items = ['a'];
                return (
                    <div data-oid="card1">
                        {items.map((item) => <span data-oid="s1" key={item}>{item}</span>)}
                    </div>
                );
            }
        `;
        const ast = getAstFromContent(code)!;
        const result = extractComponent(ast, {
            rootOid: 'card1',
            componentName: 'List',
            importPath: '@/components/List',
            propExtractions: [],
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toContain('items');
    });

    test('copies imports used by the subtree', () => {
        const code = `
            import { Star } from 'lucide-react';
            export default function Home() {
                return <div data-oid="card1"><Star data-oid="st1" /></div>;
            }
        `;
        const ast = getAstFromContent(code)!;
        const result = extractComponent(ast, {
            rootOid: 'card1',
            componentName: 'Rating',
            importPath: '@/components/Rating',
            propExtractions: [],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.componentFileContent).toContain(`import { Star } from "lucide-react"`);
    });

    test('suggestPropExtractions proposes text/image/link props', () => {
        const ast = getAstFromContent(page)!;
        const suggestions = suggestPropExtractions(ast, 'card1');
        const byKind = Object.groupBy?.(suggestions, (s) => s.kind) ?? {};
        expect(suggestions.some((s) => s.kind === 'text' && s.propName === 'title')).toBe(true);
        expect(suggestions.some((s) => s.kind === 'image')).toBe(true);
        expect(suggestions.some((s) => s.kind === 'link')).toBe(true);
        void byKind;
    });
});

describe('variants', () => {
    test('addVariantProp converts className to cn(base, map[variant])', async () => {
        const code = `
            export function Card({ title }: { title?: string }) {
                return <div data-oid="root" className="rounded p-4">{title}</div>;
            }
        `;
        const ast = getAstFromContent(code)!;
        const result = addVariantProp(ast, {
            componentName: 'Card',
            elementOid: 'root',
            initialVariants: ['default', 'dark'],
        });
        expect(result.error).toBeUndefined();
        const output = await getContentFromAst(ast, code);
        expect(output).toContain('const cardVariants');
        expect(output).toContain('cn("rounded p-4", cardVariants[variant])');
        expect(output).toContain('variant = "default"');
        expect(output).toContain(`"default" | "dark"`);
    });

    test('addVariant + updateVariantClasses round-trip', async () => {
        const code = `
            const cardVariants = { default: '' };
            export function Card({ variant = 'default' }: { variant?: 'default' }) {
                return <div data-oid="root" className={cn('p-4', cardVariants[variant])} />;
            }
        `;
        const ast = getAstFromContent(code)!;
        expect(addVariant(ast, { mapName: 'cardVariants', variantName: 'dark' }).modified).toBe(
            true,
        );
        expect(
            updateVariantClasses(ast, {
                mapName: 'cardVariants',
                variantName: 'dark',
                classes: 'bg-zinc-900 text-white',
            }).modified,
        ).toBe(true);
        const output = await getContentFromAst(ast, code);
        expect(output).toContain('dark: "bg-zinc-900 text-white"');
        expect(output).toMatch(/['"]default['"] \| ['"]dark['"]/);
    });
});

describe('detachInstance', () => {
    test('inlines master with instance values, resolves variant, drops import', async () => {
        const master = `
            const cardVariants = { default: 'bg-white', dark: 'bg-zinc-900 text-white' };
            export function Card({ title = 'Default', variant = 'default', children }: any) {
                return (
                    <div data-oid="m-root" className={cn('rounded p-4', cardVariants[variant])}>
                        <h3 data-oid="m-h">{title}</h3>
                        <div data-oid="m-slot">{children}</div>
                    </div>
                );
            }
        `;
        const page = `
            import { Card } from '@/components/Card';
            export default function Home() {
                return (
                    <main data-oid="p-main">
                        <Card data-oid="p-card" title="Hi there" variant="dark">
                            <p data-oid="p-child">Slot content</p>
                        </Card>
                    </main>
                );
            }
        `;
        const def: ComponentDef = {
            key: 'src/components/Card.tsx#Card',
            name: 'Card',
            filePath: 'src/components/Card.tsx',
            exportType: 'named',
            kind: 'react',
            rootOid: 'm-root',
            props: [
                {
                    name: 'title',
                    type: 'text',
                    required: false,
                    defaultValue: 'Default',
                    bindings: [{ kind: 'text-child', oid: 'm-h' }],
                    editable: true,
                },
                {
                    name: 'variant',
                    type: 'variant',
                    required: false,
                    defaultValue: 'default',
                    bindings: [{ kind: 'variant-class', mapName: 'cardVariants' }],
                    editable: true,
                    options: ['default', 'dark'],
                },
                {
                    name: 'children',
                    type: 'slot',
                    required: false,
                    defaultValue: null,
                    bindings: [{ kind: 'slot-site', containerOid: 'm-slot' }],
                    editable: false,
                },
            ],
            slots: [{ name: 'children', containerOid: 'm-slot' }],
            variants: {
                propName: 'variant',
                style: 'plain-map',
                mapName: 'cardVariants',
                variants: { default: 'bg-white', dark: 'bg-zinc-900 text-white' },
                defaultVariant: 'default',
            },
            hasSpread: false,
            editable: true,
        };

        const pageAst = getAstFromContent(page)!;
        const result = detachInstance(pageAst, {
            instanceOid: 'p-card',
            def,
            masterContent: master,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.removedImport).toBe(true);

        const output = await getContentFromAst(pageAst, page);
        expect(output).not.toContain('<Card');
        expect(output).toContain('Hi there');
        expect(output).toContain('rounded p-4 bg-zinc-900 text-white');
        expect(output).toContain('Slot content');
        expect(output).not.toContain("import { Card }");
        // The inlined root keeps the instance oid for selection continuity.
        expect(output).toContain('data-oid="p-card"');
    });
});
