import type { T } from 'src/packages';
import { describe, expect, test } from 'bun:test';
import { addClassToNode } from 'src/code-edit/style';
import { t } from 'src/packages';
import { getAstFromCodeblock, getContentFromAst } from 'src/parse';

async function generate(jsx: T.JSXElement): Promise<string> {
    const file = t.file(t.program([t.expressionStatement(jsx)]));
    return getContentFromAst(file, '');
}

function parseJsx(code: string): T.JSXElement {
    const node = getAstFromCodeblock(code);
    if (!node) {
        throw new Error(`Failed to parse JSX: ${code}`);
    }
    return node;
}

describe('addClassToNode', () => {
    test('appends to a StringLiteral className via tw-merge', async () => {
        const node = parseJsx('<div className="p-2 text-sm">x</div>');
        addClassToNode(node, 'p-4');
        const out = await generate(node);
        // tw-merge dedupes p-2 in favor of p-4
        expect(out).toContain('p-4');
        expect(out).toContain('text-sm');
        expect(out).not.toContain('p-2');
    });

    test.each([
        '<div className={cn("p-2", isActive && "bg-red")}>x</div>',
        '<div className={`p-2 ${size}`}>x</div>',
        '<div className={isActive ? "a" : "b"}>x</div>',
        '<div className={cls}>x</div>',
        '<div className={"a " + b}>x</div>',
        '<div className="p-2" {...props}>x</div>',
        '<div {...props}>x</div>',
        '<div className="p-2" className="p-3">x</div>',
    ])('refuses an additive change when classes cannot be proved static: %s', async (source) => {
        const node = parseJsx(source);
        const before = await generate(node);
        expect(() => addClassToNode(node, 'p-4')).toThrow('Dynamic classes');
        expect(await generate(node)).toBe(before);
    });

    test.each([
        '<div className={"p-2 text-sm"}>x</div>',
        '<div className={`p-2 text-sm`}>x</div>',
        '<div {...props} className="p-2 text-sm">x</div>',
    ])('preserves supported static classes and props: %s', async (source) => {
        const node = parseJsx(source);
        addClassToNode(node, 'p-4');
        const out = await generate(node);
        expect(out).toContain('p-4');
        expect(out).toContain('text-sm');
        expect(out).not.toContain('p-2');
        if (source.includes('...props')) expect(out).toContain('{...props}');
    });

    test('inserts a className attribute when one is missing', async () => {
        const node = parseJsx('<div>x</div>');
        addClassToNode(node, 'p-4');
        const out = await generate(node);
        expect(out).toContain('className="p-4"');
    });
});
