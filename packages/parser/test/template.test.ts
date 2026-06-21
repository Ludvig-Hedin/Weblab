import * as t from '@babel/types';
import { describe, expect, test } from 'bun:test';
import { getAstFromContent } from 'src';
import { traverse } from 'src/packages';
import {
    createTemplateNodeMap,
    getCoreElementInfo,
    getDynamicTypeInfo,
    getTemplateNodeChild,
    isNodeElementArray,
} from 'src/template-node/map';

import { CoreElementType, DynamicType } from '@weblab/models';

import type { NodePath } from '@babel/traverse';

describe('Template Tests', () => {
    describe('createTemplateNodeMap', () => {
        test('should create mapping for simple component', () => {
            const code = `
                function App() {
                    return <div data-oid="test-id">Hello</div>;
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            const mapping = createTemplateNodeMap({
                ast,
                filename: 'test.tsx',
                branchId: 'test-branch',
            });

            expect(mapping?.get('test-id')).toBeDefined();
            expect(mapping?.get('test-id')?.component).toBe('App');
            expect(mapping?.get('test-id')?.path).toBe('test.tsx');
        });

        test('should handle nested components', () => {
            const code = `
                function Child() {
                    return <div data-oid="child-id">Child</div>;
                }
                function Parent() {
                    return <div data-oid="parent-id"><Child /></div>;
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            const mapping = createTemplateNodeMap({
                ast,
                filename: 'test.tsx',
                branchId: 'test-branch',
            });

            expect(mapping?.get('child-id')?.component).toBe('Child');
            expect(mapping?.get('parent-id')?.component).toBe('Parent');
        });

        test('should handle dynamic array elements', () => {
            const code = `
                function List() {
                    return (
                        <div>
                            {items.map(item => (
                                <div data-oid="list-item">Item</div>
                            ))}
                        </div>
                    );
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            const mapping = createTemplateNodeMap({
                ast,
                filename: 'test.tsx',
                branchId: 'test-branch',
            });

            expect(mapping?.get('list-item')?.dynamicType).toBe(DynamicType.ARRAY);
        });

        test('should handle conditional elements', () => {
            const code = `
                function Conditional() {
                    return (
                        <div>
                            {condition ? <div data-oid="cond-id">True</div> : null}
                        </div>
                    );
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            const mapping = createTemplateNodeMap({
                ast,
                filename: 'test.tsx',
                branchId: 'test-branch',
            });

            expect(mapping?.get('cond-id')?.dynamicType).toBe(DynamicType.CONDITIONAL);
        });
    });

    describe('isNodeElementArray', () => {
        test('should identify array map calls', () => {
            const mapCall = t.callExpression(
                t.memberExpression(t.identifier('items'), t.identifier('map')),
                [],
            );

            expect(isNodeElementArray(mapCall)).toBe(true);
        });

        test('should return false for non-map calls', () => {
            const nonMapCall = t.callExpression(
                t.memberExpression(t.identifier('items'), t.identifier('filter')),
                [],
            );

            expect(isNodeElementArray(nonMapCall)).toBe(false);
        });
    });

    describe('getCoreElementInfo', () => {
        test('should identify component root elements', () => {
            const code = `
                function App() {
                    return <div data-oid="root">Root</div>;
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            let rootElement: NodePath<t.JSXElement> | undefined;

            // Find the JSX element in the AST
            traverse(ast, {
                JSXElement(path) {
                    rootElement = path;
                },
            });

            expect(rootElement && getCoreElementInfo(rootElement)).toBe(
                CoreElementType.COMPONENT_ROOT,
            );
        });

        test('should identify body tags', () => {
            const code = `
                function App() {
                    return <html><body data-oid="body">Content</body></html>;
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            let bodyElement: NodePath<t.JSXElement> | undefined;

            traverse(ast, {
                JSXElement(path) {
                    if (
                        t.isJSXIdentifier(path.node.openingElement.name) &&
                        path.node.openingElement.name.name === 'body'
                    ) {
                        bodyElement = path;
                    }
                },
            });

            expect(bodyElement && getCoreElementInfo(bodyElement)).toBe(CoreElementType.BODY_TAG);
        });
    });

    describe('getDynamicTypeInfo', () => {
        test('should identify conditional elements', () => {
            const code = `
                function App() {
                    return <div>{condition ? <div data-oid="cond">Test</div> : null}</div>;
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            let conditionalElement: NodePath<t.JSXElement> | undefined;

            traverse(ast, {
                JSXElement(path) {
                    if (
                        path.node.openingElement.attributes.some(
                            (attr) => t.isJSXAttribute(attr) && attr.name.name === 'data-oid',
                        )
                    ) {
                        conditionalElement = path;
                    }
                },
            });

            expect(conditionalElement && getDynamicTypeInfo(conditionalElement)).toBe(
                DynamicType.CONDITIONAL,
            );
        });

        test('should identify array elements', () => {
            const code = `
                function App() {
                    return <div>{items.map(item => <div data-oid="item">Test</div>)}</div>;
                }
            `;
            const ast = getAstFromContent(code);
            if (!ast) {
                throw new Error('Failed to get ast');
            }
            let arrayElement: NodePath<t.JSXElement> | undefined;

            traverse(ast, {
                JSXElement(path) {
                    if (
                        path.node.openingElement.attributes.some(
                            (attr) => t.isJSXAttribute(attr) && attr.name.name === 'data-oid',
                        )
                    ) {
                        arrayElement = path;
                    }
                },
            });

            expect(arrayElement && getDynamicTypeInfo(arrayElement)).toBe(DynamicType.ARRAY);
        });
    });

    describe('getTemplateNodeChild', () => {
        // Only `.component` is read, so a minimal cast keeps the fixtures small.
        const child = { component: 'Card' } as unknown as Parameters<
            typeof getTemplateNodeChild
        >[1];
        const twoSiblings = `
            function Parent() {
                return (
                    <div>
                        <Card data-oid="card-0">A</Card>
                        <Card data-oid="card-1">B</Card>
                    </div>
                );
            }
        `;

        test('maps the Nth same-name sibling to the Nth instance oid', async () => {
            expect(await getTemplateNodeChild(twoSiblings, child, 0)).toEqual({
                instanceId: 'card-0',
                component: 'Card',
            });
            expect(await getTemplateNodeChild(twoSiblings, child, 1)).toEqual({
                instanceId: 'card-1',
                component: 'Card',
            });
        });

        test('index === -1 returns the first matching sibling', async () => {
            expect(await getTemplateNodeChild(twoSiblings, child, -1)).toEqual({
                instanceId: 'card-0',
                component: 'Card',
            });
        });

        test('finds JSXMemberExpression children (e.g. <UI.Button>)', async () => {
            const uiChild = { component: 'UI.Button' } as unknown as Parameters<
                typeof getTemplateNodeChild
            >[1];
            const code = `
                function Parent() {
                    return (
                        <div>
                            <UI.Button data-oid="btn-0">First</UI.Button>
                            <UI.Button data-oid="btn-1">Second</UI.Button>
                        </div>
                    );
                }
            `;
            expect(await getTemplateNodeChild(code, uiChild, 0)).toEqual({
                instanceId: 'btn-0',
                component: 'UI.Button',
            });
            expect(await getTemplateNodeChild(code, uiChild, 1)).toEqual({
                instanceId: 'btn-1',
                component: 'UI.Button',
            });
            expect(await getTemplateNodeChild(code, uiChild, -1)).toEqual({
                instanceId: 'btn-0',
                component: 'UI.Button',
            });
        });

        test('a target sibling without an oid resolves to null, not a sibling oid', async () => {
            // Regression: the second <Card> has no data-oid. The resolver used to
            // overwrite `res` for every sibling and stop at the target, leaking
            // the FIRST sibling's oid here instead of returning null.
            const targetNoOid = `
                function Parent() {
                    return (
                        <div>
                            <Card data-oid="card-0">A</Card>
                            <Card>B</Card>
                        </div>
                    );
                }
            `;
            expect(await getTemplateNodeChild(targetNoOid, child, 1)).toBeNull();
        });
    });
});
