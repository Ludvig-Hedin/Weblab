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

    // TODO(bug-hunt): `element.location.index` is a DOM child index (counts
    // only element children) but `jsxElements` is the AST element list. These
    // can diverge when the JSX contains expression containers ({items.map(...)})
    // that render multiple DOM nodes from a single AST node — the index may
    // point at the wrong sibling. A faithful fix needs DOM-index → AST-index
    // mapping. The clamp below at least keeps a valid, in-range target instead
    // of silently dropping the move.
    if (jsxElements.length === 0) {
        console.error('Target child not found (no element children)');
        return;
    }
    // Clamp into [0, length-1]. The previous `Math.min(index, length)` allowed
    // `targetIndex === length`, which indexes PAST the end → undefined →
    // "Target child not found" → the move was silently dropped.
    const targetIndex = Math.max(0, Math.min(element.location.index, jsxElements.length - 1));
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
