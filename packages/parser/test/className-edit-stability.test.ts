import type { T } from 'src/packages';
import { describe, expect, test } from 'bun:test';
import { getAstFromContent, getContentFromAst } from 'src';
import { addClassToNode, replaceNodeClasses } from 'src/code-edit/style';
import { getAstFromCodeblock } from 'src/parse';
import { t, traverse } from 'src/packages';

// Realistic shape: one oid (ep_tx99) rendered N times via .map() with an
// arrow BLOCK body returning JSX — this is the structure that ends in
// `}` / `;` / `}` and shares a single source oid across multiple DOM nodes.
const PAGE_MAP = `export default function Page() {
  const items = ["a", "b", "c"];
  return (
    <main data-oid="ep_main">
      {items.map((item) => {
        return (
          <div data-oid="ep_tx99">
            {item}
          </div>
        );
      })}
    </main>
  );
}
`;

function hasOid(opening: T.JSXOpeningElement, oid: string): boolean {
    return opening.attributes.some(
        (attr) =>
            t.isJSXAttribute(attr) &&
            attr.name.name === 'data-oid' &&
            t.isStringLiteral(attr.value) &&
            attr.value.value === oid,
    );
}

// Apply `addClassToNode` to the element with the given oid, then regenerate.
// Returns the regenerated source (or null if the input failed to parse).
async function editClass(content: string, oid: string, className: string): Promise<string | null> {
    const ast = getAstFromContent(content);
    if (!ast) return null;
    traverse(ast, {
        JSXElement(path) {
            if (hasOid(path.node.openingElement, oid)) {
                addClassToNode(path.node, className);
            }
        },
    });
    return getContentFromAst(ast, content);
}

describe('regression: className edits keep source parseable (.map structure)', () => {
    test('add className to mapped element stays parseable', async () => {
        const out = await editClass(PAGE_MAP, 'ep_tx99', 'w-[270px]');
        if (out === null) throw new Error('input failed to parse');
        if (!getAstFromContent(out)) throw new Error('REGENERATED OUTPUT DOES NOT PARSE:\n' + out);
        expect(out).toContain('w-[270px]');
    });

    test('repeated edits through fresh parse stay parseable', async () => {
        let content = PAGE_MAP;
        for (let i = 0; i < 8; i++) {
            const next = await editClass(content, 'ep_tx99', `w-[${270 + i * 10}px]`);
            if (next === null) throw new Error('DOES NOT PARSE at iter ' + i + ':\n' + content);
            content = next;
        }
        expect(getAstFromContent(content)).not.toBeNull();
    });
});

describe('full class replacement preserves source behavior', () => {
    test.each([
        '<div className={active ? "bg-brand" : "bg-muted"} />',
        '<div className={cn("p-2", active && "bg-brand")} />',
        '<div className={`p-2 ${variant}`} />',
        '<div className={classes} />',
    ])('refuses dynamic source without changing it: %s', async (source) => {
        const node = getAstFromCodeblock(source);
        if (!node) throw new Error('Fixture must parse');
        const file = t.file(t.program([t.expressionStatement(node)]));
        const before = await getContentFromAst(file, '');
        expect(() => replaceNodeClasses(node, 'bg-new')).toThrow('Dynamic classes');
        expect(await getContentFromAst(file, '')).toBe(before);
    });

    test.each(['<div className="p-2" title="kept" />', '<div className={"p-2"} title="kept" />'])
        ('replaces static classes without changing other props: %s', (source) => {
            const node = getAstFromCodeblock(source);
            if (!node) throw new Error('Fixture must parse');
            replaceNodeClasses(node, 'p-4 md:bg-brand');
            const attributes = node.openingElement.attributes.filter((attr): attr is T.JSXAttribute => t.isJSXAttribute(attr));
            const classAttr = attributes.find((attr) => attr.name.name === 'className');
            const titleAttr = attributes.find((attr) => attr.name.name === 'title');
            expect(t.isStringLiteral(classAttr?.value) && classAttr.value.value).toBe('p-4 md:bg-brand');
            expect(t.isStringLiteral(titleAttr?.value) && titleAttr.value.value).toBe('kept');
        });
});
