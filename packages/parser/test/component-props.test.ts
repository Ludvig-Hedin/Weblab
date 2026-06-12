import { describe, expect, test } from 'bun:test';
import { getAstFromContent, getContentFromAst } from 'src';
import { createPropFromElement, parseInstancePropValues } from 'src/component';

async function applyCreateProp(
    code: string,
    params: Parameters<typeof createPropFromElement>[1],
): Promise<{ result: ReturnType<typeof createPropFromElement>; output: string }> {
    const ast = getAstFromContent(code);
    if (!ast) throw new Error('parse failed');
    const result = createPropFromElement(ast, params);
    const output = await getContentFromAst(ast, code);
    return { result, output };
}

describe('createPropFromElement', () => {
    test('text prop: hoists static text into a default and binds {prop}', async () => {
        const code = `
            interface CardProps { variant?: string }
            export function Card({ variant }: CardProps) {
                return (
                    <div data-oid="root">
                        <h3 data-oid="h1">Hello world</h3>
                    </div>
                );
            }
        `;
        const { result, output } = await applyCreateProp(code, {
            componentName: 'Card',
            elementOid: 'h1',
            propName: 'title',
            kind: 'text',
        });
        expect(result.error).toBeUndefined();
        expect(result.modified).toBe(true);
        expect(result.defaultValue).toBe('Hello world');
        expect(output).toContain("title = \"Hello world\"");
        expect(output).toContain('{title}');
        expect(output).toContain('title?: string');
    });

    test('image prop: binds src attr', async () => {
        const code = `
            export function Hero({ heading }: { heading?: string }) {
                return <img data-oid="img1" src="/cat.png" alt="cat" />;
            }
        `;
        const { result, output } = await applyCreateProp(code, {
            componentName: 'Hero',
            elementOid: 'img1',
            propName: 'image',
            kind: 'image',
        });
        expect(result.error).toBeUndefined();
        expect(result.defaultValue).toBe('/cat.png');
        expect(output).toContain('src={image}');
        expect(output).toContain("image = \"/cat.png\"");
        expect(output).toContain('image?: string');
    });

    test('switch prop: wraps element in a conditional', async () => {
        const code = `
            export function Card() {
                return (
                    <div data-oid="root">
                        <span data-oid="badge">Featured</span>
                    </div>
                );
            }
        `;
        const { result, output } = await applyCreateProp(code, {
            componentName: 'Card',
            elementOid: 'badge',
            propName: 'showBadge',
            kind: 'switch',
        });
        expect(result.error).toBeUndefined();
        expect(result.defaultValue).toBe(true);
        expect(output).toContain('showBadge = true');
        expect(output).toMatch(/\{showBadge &&/);
    });

    test('rejects duplicate prop names', async () => {
        const code = `
            export function Card({ title }: { title?: string }) {
                return <h3 data-oid="h1">Hi</h3>;
            }
        `;
        const { result } = await applyCreateProp(code, {
            componentName: 'Card',
            elementOid: 'h1',
            propName: 'title',
            kind: 'text',
        });
        expect(result.modified).toBe(false);
        expect(result.error).toContain('already exists');
    });

    test('rejects dynamic text', async () => {
        const code = `
            export function Card({ items }: { items: string[] }) {
                return <h3 data-oid="h1">{items.length} items</h3>;
            }
        `;
        const { result } = await applyCreateProp(code, {
            componentName: 'Card',
            elementOid: 'h1',
            propName: 'label',
            kind: 'text',
        });
        expect(result.modified).toBe(false);
        expect(result.error).toContain('static text');
    });

    test('inserts before a rest element', async () => {
        const code = `
            export function Card({ title, ...rest }: { title?: string }) {
                return <div data-oid="root" {...rest}><p data-oid="p1">Sub</p></div>;
            }
        `;
        const { output } = await applyCreateProp(code, {
            componentName: 'Card',
            elementOid: 'p1',
            propName: 'subtitle',
            kind: 'text',
        });
        expect(output).toMatch(/subtitle = \"Sub\"[\s\S]*\.\.\.rest/);
    });
});

describe('parseInstancePropValues', () => {
    test('reads literal attrs and boolean shorthand, skips data-*', () => {
        const values = parseInstancePropValues(
            `<Card data-oid="x" title="Hi" count={3} featured negative={-2} dynamic={foo} />`,
        );
        expect(values.title).toBe('Hi');
        expect(values.count).toBe(3);
        expect(values.featured).toBe(true);
        expect(values.negative).toBe(-2);
        expect(values.dynamic).toBeNull();
        expect(values['data-oid']).toBeUndefined();
    });
});
