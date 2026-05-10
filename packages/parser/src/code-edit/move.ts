import type { CodeMove } from '@weblab/models/actions';

import type { NodePath, T } from '../packages';
import { addKeyToElement, getOidFromJsxElement, jsxFilter } from './helpers';

export function moveElementInNode(path: NodePath<T.JSXElement>, element: CodeMove): void {
    const children = path.node.children;
    const jsxElements = children.filter(jsxFilter).map((child) => {
        return child;
    });

    const elementToMove = jsxElements.find((child) => {
        if (child.type !== 'JSXElement' || !child.openingElement) {
            return false;
        }
        const oid = getOidFromJsxElement(child.openingElement);
        return oid === element.oid;
    });

    if (!elementToMove) {
        console.error('Element not found for move');
        return;
    }

    addKeyToElement(elementToMove);

    const targetIndex = Math.min(element.location.index, jsxElements.length);
    const targetChild = jsxElements[targetIndex];
    if (!targetChild) {
        console.error('Target child not found');
        return;
    }
    const targetChildIndex = children.indexOf(targetChild);
    const originalIndex = children.indexOf(elementToMove);

    // Move to new location. NOTE: real-world JSX `children` arrays are
    // interleaved with JSXText whitespace nodes, so inserting at
    // `targetChildIndex` after a removal lands the element AFTER the target —
    // which is the desired behavior for "move to higher index". Do not add a
    // -1 adjustment here; that breaks forward moves on every realistic AST.
    children.splice(originalIndex, 1);
    children.splice(targetChildIndex, 0, elementToMove);
}
