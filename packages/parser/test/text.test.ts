import type { T } from 'src/packages';
import { describe, expect, test } from 'bun:test';
import { updateNodeTextContent } from 'src/code-edit/text';
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

describe('updateNodeTextContent', () => {
    describe('single line', () => {
        test('updates a plain text node', async () => {
            const node = parseJsx('<button>old</button>');
            updateNodeTextContent(node, 'new');
            const out = await generate(node);
            expect(out).toContain('new');
            expect(out).not.toContain('old');
        });

        test('adds a text node when the element has none', async () => {
            const node = parseJsx('<div></div>');
            updateNodeTextContent(node, 'hello');
            expect(await generate(node)).toContain('hello');
        });

        // Regression: the search used to match the FIRST JSXText, which in
        // formatted JSX is the "\n  " indentation between tags — so the real
        // visible text was left stale. It must skip whitespace-only nodes.
        test('skips whitespace-only nodes and updates the visible text run', async () => {
            const node = parseJsx('<p>\n  <strong>x</strong> tail</p>');
            updateNodeTextContent(node, 'updated');
            const out = await generate(node);
            expect(out).toContain('updated');
            expect(out).toContain('<strong>'); // nested markup preserved
            expect(out).toContain('x');
            expect(out).not.toContain('tail'); // stale visible text replaced
        });
    });

    describe('multi line — preserves nested markup (the blocker)', () => {
        // The core bug: `node.children = []` wiped EVERY child, including
        // inline elements, on any multi-line edit.
        test('keeps a trailing inline <strong> when text precedes it', async () => {
            const node = parseJsx('<p>Hello <strong>world</strong></p>');
            updateNodeTextContent(node, 'line1\nline2');
            const out = await generate(node);
            expect(out).toContain('line1');
            expect(out).toContain('line2');
            expect(out).toMatch(/<br\s*\/>/);
            expect(out).toContain('<strong>'); // would be erased before the fix
            expect(out).toContain('world');
            expect(out).not.toContain('Hello'); // old text run replaced
        });

        test('keeps an inline element that sits BEFORE the text', async () => {
            const node = parseJsx('<p><strong>b</strong>c</p>');
            updateNodeTextContent(node, 'x\ny');
            const out = await generate(node);
            // <strong> must remain first; the rebuilt text run follows it.
            expect(out.indexOf('<strong>')).toBeLessThan(out.indexOf('x'));
            expect(out).toContain('b');
            expect(out).toContain('x');
            expect(out).toContain('y');
            expect(out).not.toContain('>c<'); // old trailing text gone
        });

        test('keeps an inline element wrapped by text on both sides', async () => {
            const node = parseJsx('<p>a<strong>b</strong>c</p>');
            updateNodeTextContent(node, 'one\ntwo');
            const out = await generate(node);
            expect(out).toContain('<strong>');
            expect(out).toContain('b');
            expect(out).toContain('one');
            expect(out).toContain('two');
        });

        test('preserves a JSXExpressionContainer child', async () => {
            const node = parseJsx('<p>{count} items</p>');
            updateNodeTextContent(node, 'a\nb');
            const out = await generate(node);
            expect(out).toContain('{count}'); // expression survives
            expect(out).toContain('a');
            expect(out).toContain('b');
            expect(out).not.toContain('items');
        });

        test('plain multi-line text (no markup) still splits on <br/>', async () => {
            const node = parseJsx('<div>old</div>');
            updateNodeTextContent(node, 'a\nb\nc');
            const out = await generate(node);
            expect(out).toContain('a');
            expect(out).toContain('b');
            expect(out).toContain('c');
            expect(out).not.toContain('old');
            // two <br/> between three lines
            expect(out.match(/<br\s*\/>/g)?.length).toBe(2);
        });

        // Regression: a <br/> is this function's OWN line-break marker. On
        // re-edit it must be replaced along with the old text, not kept as
        // "preserved markup" — otherwise every repeated multi-line edit to the
        // same node leaves the previous <br/> behind and they pile up forever.
        test('repeated multi-line edits do not accumulate stray <br/>', async () => {
            const node = parseJsx('<p>Hello <strong>world</strong></p>');
            updateNodeTextContent(node, 'line1\nline2');
            updateNodeTextContent(node, 'line3\nline4');
            updateNodeTextContent(node, 'L5\nL6');
            const out = await generate(node);
            expect(out.match(/<br\s*\/>/g)?.length).toBe(1);
            expect(out.match(/<strong>/g)?.length).toBe(1);
            expect(out).toContain('L5');
            expect(out).toContain('L6');
        });
    });
});
