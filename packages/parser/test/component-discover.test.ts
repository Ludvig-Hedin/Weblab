import { describe, expect, test } from 'bun:test';
import { discoverComponentsInFile } from 'src/component';

describe('discoverComponentsInFile', () => {
    test('discovers a named function component with destructured TS props', () => {
        const code = `
            interface CardProps {
                title: string;
                count?: number;
                featured?: boolean;
                image: string;
                href?: string;
            }
            export function Card({ title = 'Hello', count, featured, image, href }: CardProps) {
                return (
                    <div data-oid="root1" className="card">
                        <img src={image} data-oid="img1" />
                        <h3 data-oid="h1">{title}</h3>
                        {featured && <span data-oid="badge1">Featured</span>}
                        <a href={href} data-oid="a1">More</a>
                    </div>
                );
            }
        `;
        const defs = discoverComponentsInFile(code, 'src/components/Card.tsx');
        expect(defs).toHaveLength(1);
        const def = defs[0]!;
        expect(def.key).toBe('src/components/Card.tsx#Card');
        expect(def.name).toBe('Card');
        expect(def.exportType).toBe('named');
        expect(def.kind).toBe('react');
        expect(def.rootOid).toBe('root1');
        expect(def.hasSpread).toBe(false);

        const byName = Object.fromEntries(def.props.map((p) => [p.name, p]));
        expect(byName.title?.type).toBe('text');
        expect(byName.title?.defaultValue).toBe('Hello');
        expect(byName.title?.bindings).toEqual([{ kind: 'text-child', oid: 'h1' }]);
        expect(byName.count?.type).toBe('number');
        expect(byName.featured?.type).toBe('switch');
        expect(byName.featured?.bindings).toEqual([{ kind: 'visibility', oid: 'badge1' }]);
        expect(byName.image?.type).toBe('image');
        expect(byName.image?.bindings).toEqual([{ kind: 'attr', oid: 'img1', attr: 'src' }]);
        expect(byName.href?.type).toBe('link');
        expect(byName.title?.required).toBe(false); // has default
        expect(byName.image?.required).toBe(true);
    });

    test('discovers default export arrow component wrapped in memo', () => {
        const code = `
            import { memo } from 'react';
            const Hero = ({ heading }: { heading: string }) => (
                <section data-oid="s1"><h1 data-oid="h2">{heading}</h1></section>
            );
            export default memo(Hero);
        `;
        const defs = discoverComponentsInFile(code, 'src/Hero.tsx');
        expect(defs).toHaveLength(1);
        expect(defs[0]!.name).toBe('Hero');
        expect(defs[0]!.exportType).toBe('default');
        expect(defs[0]!.rootOid).toBe('s1');
    });

    test('detects children slot and named ReactNode slots', () => {
        const code = `
            import type { ReactNode } from 'react';
            export function Panel({ children, header }: { children?: ReactNode; header?: ReactNode }) {
                return (
                    <div data-oid="p1">
                        <div data-oid="hd1">{header}</div>
                        <div data-oid="bd1">{children}</div>
                    </div>
                );
            }
        `;
        const defs = discoverComponentsInFile(code, 'src/Panel.tsx');
        const def = defs[0]!;
        expect(def.slots.map((s) => s.name).sort()).toEqual(['children', 'header']);
        const childrenSlot = def.slots.find((s) => s.name === 'children');
        expect(childrenSlot?.containerOid).toBe('bd1');
    });

    test('detects plain-map variants', () => {
        const code = `
            const cardVariants = {
                default: 'bg-white text-zinc-900',
                dark: 'bg-zinc-900 text-white',
            };
            export function Card({ variant = 'default' }: { variant?: 'default' | 'dark' }) {
                return <div data-oid="c1" className={cn('rounded', cardVariants[variant])}>x</div>;
            }
        `;
        const defs = discoverComponentsInFile(code, 'src/Card.tsx');
        const def = defs[0]!;
        expect(def.variants).not.toBeNull();
        expect(def.variants?.style).toBe('plain-map');
        expect(def.variants?.mapName).toBe('cardVariants');
        expect(def.variants?.defaultVariant).toBe('default');
        expect(Object.keys(def.variants?.variants ?? {})).toEqual(['default', 'dark']);
        const variantProp = def.props.find((p) => p.name === 'variant');
        expect(variantProp?.type).toBe('variant');
        expect(variantProp?.options).toEqual(['default', 'dark']);
    });

    test('detects cva variants with defaultVariants', () => {
        const code = `
            import { cva } from 'class-variance-authority';
            const buttonVariants = cva('rounded px-3', {
                variants: { variant: { solid: 'bg-black text-white', outline: 'border' } },
                defaultVariants: { variant: 'solid' },
            });
            export function Button({ variant }: { variant?: 'solid' | 'outline' }) {
                return <button data-oid="b1" className={buttonVariants({ variant })}>go</button>;
            }
        `;
        const defs = discoverComponentsInFile(code, 'src/Button.tsx');
        const def = defs[0]!;
        expect(def.variants?.style).toBe('cva');
        expect(def.variants?.defaultVariant).toBe('solid');
        expect(Object.keys(def.variants?.variants ?? {}).sort()).toEqual(['outline', 'solid']);
    });

    test('marks complex props unsupported and flags spread', () => {
        const code = `
            interface RowProps {
                item: { id: string; label: string };
                onClick?: () => void;
                label: string;
            }
            export function Row({ item, onClick, label, ...rest }: RowProps) {
                return <div data-oid="r1" {...rest}><span data-oid="sp1">{label}</span></div>;
            }
        `;
        const defs = discoverComponentsInFile(code, 'src/Row.tsx');
        const def = defs[0]!;
        expect(def.hasSpread).toBe(true);
        const byName = Object.fromEntries(def.props.map((p) => [p.name, p]));
        expect(byName.item?.type).toBe('unsupported');
        expect(byName.item?.editable).toBe(false);
        expect(byName.onClick?.type).toBe('unsupported');
        expect(byName.label?.type).toBe('text');
        expect(byName.label?.editable).toBe(true);
    });

    test('ignores non-exported and lowercase functions', () => {
        const code = `
            function helper() { return <div data-oid="x1" />; }
            export const formatDate = (d: Date) => d.toISOString();
            export function Widget() { return <div data-oid="w1" />; }
        `;
        const defs = discoverComponentsInFile(code, 'src/Widget.tsx');
        expect(defs.map((d) => d.name)).toEqual(['Widget']);
    });

    test('recovers props read via props.x member access', () => {
        const code = `
            export function Title(props: { text: string }) {
                return <h1 data-oid="t1">{props.text}</h1>;
            }
        `;
        const defs = discoverComponentsInFile(code, 'src/Title.tsx');
        const def = defs[0]!;
        const text = def.props.find((p) => p.name === 'text');
        expect(text?.type).toBe('text');
        expect(text?.bindings).toEqual([{ kind: 'text-child', oid: 't1' }]);
    });

    test('handles export specifiers (export { Card })', () => {
        const code = `
            const Card = () => <div data-oid="c2">hi</div>;
            export { Card };
        `;
        const defs = discoverComponentsInFile(code, 'src/Card.tsx');
        expect(defs).toHaveLength(1);
        expect(defs[0]!.name).toBe('Card');
    });
});
