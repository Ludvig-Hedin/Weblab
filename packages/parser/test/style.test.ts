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

    test('pushes argument when className is a CallExpression (e.g. cn(...))', async () => {
        const node = parseJsx('<div className={cn("p-2", isActive && "bg-red")}>x</div>');
        addClassToNode(node, 'extra');
        const out = await generate(node);
        expect(out).toContain('"extra"');
        // original args are preserved
        expect(out).toContain('"p-2"');
        expect(out).toContain('isActive && "bg-red"');
    });

    test('wraps a TemplateLiteral className with binary `+ " " + new`', async () => {
        const node = parseJsx('<div className={`p-2 ${size}`}>x</div>');
        addClassToNode(node, 'extra');
        const out = await generate(node);
        // Expression should be (`p-2 ${size}` + " ") + "extra"
        expect(out).toContain('+ " " + "extra"');
        expect(out).toContain('`p-2 ${size}`');
    });

    test('wraps a ConditionalExpression className with binary concat', async () => {
        const node = parseJsx('<div className={isActive ? "a" : "b"}>x</div>');
        addClassToNode(node, 'extra');
        const out = await generate(node);
        expect(out).toContain('+ " " + "extra"');
        expect(out).toContain('isActive ? "a" : "b"');
    });

    test('wraps an Identifier className with binary concat', async () => {
        const node = parseJsx('<div className={cls}>x</div>');
        addClassToNode(node, 'extra');
        const out = await generate(node);
        expect(out).toContain('cls + " " + "extra"');
    });

    test('wraps a BinaryExpression className with binary concat', async () => {
        const node = parseJsx('<div className={"a " + b}>x</div>');
        addClassToNode(node, 'extra');
        const out = await generate(node);
        // Result should include the existing concat plus " " plus "extra"
        expect(out).toContain('"a " + b + " " + "extra"');
    });

    test('inserts a className attribute when one is missing', async () => {
        const node = parseJsx('<div>x</div>');
        addClassToNode(node, 'p-4');
        const out = await generate(node);
        expect(out).toContain('className="p-4"');
    });
});
