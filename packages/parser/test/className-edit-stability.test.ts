import type { T } from 'src/packages';
import { describe, expect, test } from 'bun:test';
import { getAstFromContent, getContentFromAst } from 'src';
import { addClassToNode } from 'src/code-edit/style';
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
