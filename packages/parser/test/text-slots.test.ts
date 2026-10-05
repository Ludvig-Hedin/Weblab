import type { T } from 'src/packages';
import { describe, expect, test } from 'bun:test';
import { getJsxTextGaps, getRenderedJsxText, updateNodeTextSlots } from 'src/code-edit/text';
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

function child(node: T.JSXElement, index: number): T.JSXElement {
    const elements = node.children.filter((c): c is T.JSXElement => t.isJSXElement(c));
    const el = elements[index];
    if (!el) throw new Error('missing child');
    return el;
}

const HERO = `<h1>
    <span className="a">AI agents for</span>
    <span className="b">IP and patent analysis</span>
</h1>`;

describe('getRenderedJsxText', () => {
    test('follows JSX whitespace rules', () => {
        expect(getRenderedJsxText('\n    ')).toBe('');
        expect(getRenderedJsxText('Hello ')).toBe('Hello ');
        expect(getRenderedJsxText('\n  Hello\n  world\n')).toBe('Hello world');
        expect(getRenderedJsxText(' tail')).toBe(' tail');
    });
});

describe('getJsxTextGaps', () => {
    test('models the gaps around span children', () => {
        const gaps = getJsxTextGaps(parseJsx(HERO));
        expect(gaps?.map((g) => g.text)).toEqual(['', '', '']);
    });

    test('mixed text, string containers and <br/>', () => {
        const gaps = getJsxTextGaps(parseJsx(`<p>\n  Hello{' '}\n  <strong>world</strong>!<br />Next</p>`));
        expect(gaps?.map((g) => g.text)).toEqual(['Hello ', '!\nNext']);
    });

    test('refuses dynamic expressions', () => {
        expect(getJsxTextGaps(parseJsx('<p>Hi {name}</p>'))).toBeNull();
    });
});

describe('updateNodeTextSlots', () => {
    test('edits one line of a span heading and keeps both spans', async () => {
        const h1 = parseJsx(HERO);
        updateNodeTextSlots(child(h1, 0), [
            { index: 0, oldText: 'AI agents for', newText: 'AI agents built for' },
        ]);
        const out = await generate(h1);
        expect(out).toContain('<span className="a">AI agents built for</span>');
        expect(out).toContain('<span className="b">IP and patent analysis</span>');
    });

    test('a new line inside a span becomes <br />', async () => {
        const h1 = parseJsx(HERO);
        updateNodeTextSlots(child(h1, 1), [
            { index: 0, oldText: 'IP and patent analysis', newText: 'IP and patent\nanalysis' },
        ]);
        const out = await generate(h1);
        expect(out).toMatch(/<span className="b">IP and patent<br \/>analysis<\/span>/);
        expect(out).toContain('<span className="a">AI agents for</span>');
    });

    test('rewrites text between inline elements without touching them', async () => {
        const p = parseJsx(`<p>Hello <strong>world</strong>!</p>`);
        updateNodeTextSlots(p, [{ index: 1, oldText: '!', newText: ', again!' }]);
        const out = await generate(p);
        expect(out).toContain('<p>Hello <strong>world</strong>, again!</p>');
    });

    test('keeps existing <br/> line breaks as line breaks', async () => {
        const h1 = parseJsx(`<h1>AI agents for<br />IP analysis</h1>`);
        updateNodeTextSlots(h1, [
            { index: 0, oldText: 'AI agents for\nIP analysis', newText: 'AI agents for\nIP and patent analysis' },
        ]);
        const out = await generate(h1);
        expect(out).toContain('<h1>AI agents for<br />IP and patent analysis</h1>');
    });

    test('escapes JSX-significant characters', async () => {
        const p = parseJsx(`<p><span>a</span></p>`);
        updateNodeTextSlots(child(p, 0), [{ index: 0, oldText: 'a', newText: 'a {b} <c>' }]);
        const out = await generate(p);
        expect(out).toContain(`{"a {b} <c>"}`);
    });

    test('refuses when the source no longer matches the canvas', () => {
        const p = parseJsx(`<p>Hello <strong>world</strong></p>`);
        expect(() =>
            updateNodeTextSlots(p, [{ index: 0, oldText: 'Goodbye ', newText: 'Hi ' }]),
        ).toThrow();
    });

    test('refuses a gap that does not exist', () => {
        const p = parseJsx(`<p>Hello</p>`);
        expect(() => updateNodeTextSlots(p, [{ index: 3, oldText: '', newText: 'x' }])).toThrow();
    });
});
