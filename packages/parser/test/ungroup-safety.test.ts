import { expect, test } from 'bun:test';
import { assertGroupSelectionSafe, groupElementsInNode, ungroupElementsInNode } from 'src/code-edit/group';
import { getOidFromJsxElement } from 'src/code-edit/helpers';
import { t, traverse } from 'src/packages';
import { getAstFromCodeblock } from 'src/parse';
import { getAstFromContent, getContentFromAst } from 'src/parse';

import type { CodeUngroup } from '@weblab/models/actions';
import { CodeActionType } from '@weblab/models/actions';

const action: CodeUngroup = {
    type: CodeActionType.UNGROUP,
    oid: 'parent',
    container: { oid: 'container', domId: 'container-dom', tagName: 'div', attributes: {} },
    children: [],
};
function fixture(children: string) {
    const code = `<main data-oid="parent"><div data-oid="container">${children}</div></main>`;
    const ast = getAstFromContent(code);
    if (!ast) throw new Error('Invalid fixture');
    return {
        ast,
        code,
        apply() {
            traverse(ast, {
                JSXElement(path) {
                    if (
                        path.node.openingElement.name.type === 'JSXIdentifier' &&
                        path.node.openingElement.name.name === 'main'
                    ) {
                        const container = path.node.children.find((child) => t.isJSXElement(child));
                        const children = t.isJSXElement(container) ? container.children
                            .filter((child) => t.isJSXElement(child))
                            .map((child) => ({
                                oid: t.isJSXElement(child) ? getOidFromJsxElement(child.openingElement) : null,
                                domId: 'child-dom', frameId: 'frame', branchId: 'branch',
                            })) : [];
                        ungroupElementsInNode(path, { ...action, container: { ...action.container }, children });
                    }
                },
            });
        },
    };
}

test.each([
    'Hello <strong>world</strong>!',
    '{items.map(item => <p>{item.name}</p>)}',
    '<span>first</span> <span>second</span>',
    '{/* keep comment */}<span>child</span>',
    '\n\u00a0\n',
    '\n\u2003\n',
    '<><span data-oid="child">child</span></>',
])('refuses unsafe ungroup without changing the source: %s', async (children) => {
    const f = fixture(children);
    const before = await getContentFromAst(f.ast, f.code);
    expect(() => f.apply()).toThrow('Cannot ungroup');
    expect(await getContentFromAst(f.ast, f.code)).toBe(before);
});

test('ungroups ordinary element wrappers and preserves sibling order', async () => {
    const f = fixture('\n    <span data-oid="first">first</span>\n    <span data-oid="second">second</span>\n');
    f.apply();
    const output = await getContentFromAst(f.ast, f.code);
    expect(output).not.toContain('data-oid="container"');
    expect(output.indexOf('first')).toBeLessThan(output.indexOf('second'));
    expect(output).toContain('<main data-oid="parent">');
});

test.each([
    '<main><p data-oid="a" />{/* keep */}<p data-oid="b" /></main>',
    '<main><p data-oid="a" /><p data-oid="other" /><p data-oid="b" /></main>',
    '<main><p data-oid="a" /> <p data-oid="b" /></main>',
    '<main><p data-oid="a" /><section><p data-oid="b" /></section></main>',
])('refuses grouping across preserved nodes or indirect selections: %s', (code) => {
    const parent = getAstFromCodeblock(code);
    if (!parent) throw new Error('Invalid fixture');
    expect(() => assertGroupSelectionSafe(parent, ['a', 'b'])).toThrow('Cannot group');
});

test.each(['', '\n  '])('Ungroup and regroup preserve source wrapper props, names, indentation and child keys: %s', async (indentation) => {
    const code = '<main data-oid="parent"><Layout.Card data-oid="container" className={variant} ' +
        'onClick={handleClick} {...props} key={identity} xml:lang="sv">' +
        indentation + '<span data-oid="child" key={childKey}>child</span>' + indentation + '</Layout.Card><p data-oid="other" key="kept" /></main>';
    const ast = getAstFromContent(code);
    if (!ast) throw new Error('Invalid fixture');
    const before = await getContentFromAst(ast, code);
    const operation: CodeUngroup = {
        ...action, container: { ...action.container },
        children: [{ oid: 'child', domId: 'child-dom', frameId: 'frame', branchId: 'branch' }],
    };
    traverse(ast, { JSXElement(path) {
        if (getOidFromJsxElement(path.node.openingElement) === 'parent') ungroupElementsInNode(path, operation);
    } });
    const ungrouped = await getContentFromAst(ast, code);
    expect(ungrouped).toContain('key={childKey}');
    expect(ungrouped).not.toContain('Layout.Card');
    traverse(ast, { JSXElement(path) {
        if (getOidFromJsxElement(path.node.openingElement) === 'parent') {
            groupElementsInNode(path, { ...operation, type: CodeActionType.GROUP });
        }
    } });
    expect(await getContentFromAst(ast, code)).toBe(before);
});

test('namespaced wrappers and empty wrappers restore from source snapshots', async () => {
    const code = '<main data-oid="parent"><svg:g data-oid="container" transform={matrix} /></main>';
    const ast = getAstFromContent(code);
    if (!ast) throw new Error('Invalid fixture');
    const before = await getContentFromAst(ast, code);
    const operation: CodeUngroup = { ...action, container: { ...action.container } };
    traverse(ast, { JSXElement(path) {
        if (getOidFromJsxElement(path.node.openingElement) === 'parent') ungroupElementsInNode(path, operation);
    } });
    traverse(ast, { JSXElement(path) {
        if (getOidFromJsxElement(path.node.openingElement) === 'parent') {
            groupElementsInNode(path, { ...operation, type: CodeActionType.GROUP });
        }
    } });
    expect(await getContentFromAst(ast, code)).toBe(before);
});
