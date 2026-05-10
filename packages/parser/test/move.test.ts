import type { NodePath, T } from 'src/packages';
import { describe, expect, test } from 'bun:test';
import { moveElementInNode } from 'src/code-edit/move';
import { t, traverse } from 'src/packages';
import { getAstFromContent } from 'src/parse';

import type { CodeMove } from '@weblab/models/actions';
import { CodeActionType } from '@weblab/models/actions';

function getRootJsxPath(code: string): NodePath<T.JSXElement> {
    const ast = getAstFromContent(code);
    if (!ast) {
        throw new Error('Failed to parse AST');
    }
    let root: NodePath<T.JSXElement> | undefined;
    traverse(ast, {
        JSXElement(path) {
            if (!root) {
                root = path;
                path.skip();
            }
        },
    });
    if (!root) {
        throw new Error('No root JSX element found');
    }
    return root;
}

function childOidsInOrder(node: T.JSXElement): string[] {
    const oids: string[] = [];
    for (const child of node.children) {
        if (!t.isJSXElement(child)) continue;
        const attr = child.openingElement.attributes.find(
            (a): a is T.JSXAttribute => t.isJSXAttribute(a) && a.name.name === 'data-oid',
        );
        if (attr && t.isStringLiteral(attr.value)) {
            oids.push(attr.value.value);
        }
    }
    return oids;
}

function makeMove(oid: string, index: number, originalIndex: number): CodeMove {
    return {
        type: CodeActionType.MOVE,
        oid,
        location: {
            type: 'index',
            index,
            originalIndex,
            targetDomId: 'parent-dom',
            targetOid: 'parent',
        },
    };
}

describe('moveElementInNode', () => {
    const code = `
        export function Example() {
            return (
                <div data-oid="parent">
                    <span data-oid="A">A</span>
                    <span data-oid="B">B</span>
                    <span data-oid="C">C</span>
                    <span data-oid="D">D</span>
                    <span data-oid="E">E</span>
                </div>
            );
        }
    `;

    test('moves C to higher index 3 → [A, B, D, C, E]', () => {
        const path = getRootJsxPath(code);
        moveElementInNode(path, makeMove('C', 3, 2));
        expect(childOidsInOrder(path.node)).toEqual(['A', 'B', 'D', 'C', 'E']);
    });

    test('moves D to lower index 1 → [A, D, B, C, E]', () => {
        const path = getRootJsxPath(code);
        moveElementInNode(path, makeMove('D', 1, 3));
        expect(childOidsInOrder(path.node)).toEqual(['A', 'D', 'B', 'C', 'E']);
    });

    test('same-position no-op preserves order', () => {
        const path = getRootJsxPath(code);
        moveElementInNode(path, makeMove('C', 2, 2));
        expect(childOidsInOrder(path.node)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    test('moves first element forward to last index', () => {
        const path = getRootJsxPath(code);
        moveElementInNode(path, makeMove('A', 4, 0));
        expect(childOidsInOrder(path.node)).toEqual(['B', 'C', 'D', 'E', 'A']);
    });

    test('moves last element backward to first index', () => {
        const path = getRootJsxPath(code);
        moveElementInNode(path, makeMove('E', 0, 4));
        expect(childOidsInOrder(path.node)).toEqual(['E', 'A', 'B', 'C', 'D']);
    });
});
