import type { CodeGroup, CodeUngroup } from '@weblab/models/actions';
import { CodeActionType } from '@weblab/models/actions';

import type { NodePath, T } from '../packages';
import { generate, t } from '../packages';
import { getAstFromCodeblock } from '../parse';
import { getOidFromJsxElement, jsxFilter } from './helpers';
import { createInsertedElement } from './insert';

function isIndentation(child: T.JSXElement['children'][number]): boolean {
    return t.isJSXText(child) && (child.value === '' ||
        (/[\r\n]/.test(child.value) && /^[\t \r\n]*$/.test(child.value)));
}

/** Every requested child must be direct and the selected source run contiguous. */
export function assertGroupSelectionSafe(node: T.JSXElement, oids: Array<string | null>): T.JSXElement[] {
    if (oids.length === 0 || oids.some((oid) => !oid) || new Set(oids).size !== oids.length) {
        throw new Error('Cannot group an empty or repeated source selection.');
    }
    const requested = new Set(oids.filter((oid): oid is string => typeof oid === 'string'));
    const selected = node.children.filter((child): child is T.JSXElement =>
        t.isJSXElement(child) && requested.has(getOidFromJsxElement(child.openingElement) ?? ''));
    if (selected.length !== requested.size || new Set(selected.map((child) =>
        getOidFromJsxElement(child.openingElement))).size !== requested.size) {
        throw new Error('Cannot group: every selected element must be a direct source child.');
    }
    const start = node.children.indexOf(selected[0]!);
    const end = node.children.indexOf(selected[selected.length - 1]!);
    if (node.children.slice(start, end + 1).some((child) =>
        !(t.isJSXElement(child) && selected.includes(child)) && !isIndentation(child))) {
        throw new Error('Cannot group elements across text, comments or unselected children.');
    }
    return selected;
}

export function assertUngroupContainerSafe(container: T.JSXElement): void {
    if (container.children.some((child) => !t.isJSXElement(child) && !isIndentation(child))) {
        throw new Error('Cannot ungroup a container with direct text, fragments or expressions.');
    }
}

export function groupElementsInNode(path: NodePath<T.JSXElement>, element: CodeGroup): void {
    const children = path.node.children;
    const snapshot = element.container.sourceCode
        ? getAstFromCodeblock(element.container.sourceCode)
        : undefined;
    if (element.container.sourceCode && !snapshot) throw new Error('The original group source cannot be restored.');
    if (snapshot) assertUngroupContainerSafe(snapshot);
    const targetChildren = element.children.length === 0 && snapshot
        ? []
        : assertGroupSelectionSafe(path.node, element.children.map((c) => c.oid));
    const insertIndex = targetChildren.length > 0
        ? children.indexOf(targetChildren[0]!)
        : element.container.sourceIndex;
    if (insertIndex === undefined || insertIndex < 0 || insertIndex > children.length) {
        throw new Error('The original group position cannot be restored.');
    }
    const endIndex = targetChildren.length > 0
        ? children.indexOf(targetChildren[targetChildren.length - 1]!)
        : insertIndex - 1;
    const container = snapshot ?? createInsertedElement({
        type: CodeActionType.INSERT,
        textContent: null,
        pasteParams: {
            oid: element.container.oid,
            domId: element.container.domId,
        },
        codeBlock: null,
        children: [],
        oid: element.container.oid,
        tagName: element.container.tagName,
        attributes: element.container.attributes,
        location: {
            type: 'index',
            targetDomId: element.container.domId,
            targetOid: element.container.oid,
            index: insertIndex,
            originalIndex: insertIndex,
        },
    });
    if (snapshot) {
        const byOid = new Map(targetChildren.map((child) => [getOidFromJsxElement(child.openingElement), child]));
        const snapshotOids = snapshot.children.filter((child): child is T.JSXElement => t.isJSXElement(child)).map((child) =>
            getOidFromJsxElement(child.openingElement));
        if (snapshotOids.length !== targetChildren.length || snapshotOids.some((oid) => !byOid.has(oid))) {
            throw new Error('The original group children no longer match the source.');
        }
        container.children = snapshot.children.map((child) => t.isJSXElement(child)
            ? byOid.get(getOidFromJsxElement(child.openingElement))!
            : child);
    } else {
        container.children = children.slice(insertIndex, endIndex + 1);
        element.container.sourceCode = generate(container).code;
    }
    if (snapshot && targetChildren.length > 0) {
        const leading = snapshot.children[0];
        const trailing = snapshot.children[snapshot.children.length - 1];
        const before = children[insertIndex - 1];
        const after = children[endIndex + 1];
        const leadingText = t.isJSXText(leading) ? leading.value : '';
        const trailingText = t.isJSXText(trailing) ? trailing.value : '';
        if ((leadingText && (!t.isJSXText(before) || !before.value.endsWith(leadingText))) ||
            (trailingText && (!t.isJSXText(after) || !after.value.startsWith(trailingText)))) {
            throw new Error('The original group indentation no longer matches the source.');
        }
        if (leadingText && t.isJSXText(before)) before.value = before.value.slice(0, -leadingText.length);
        if (trailingText && t.isJSXText(after)) after.value = after.value.slice(trailingText.length);
    }
    children.splice(insertIndex, endIndex - insertIndex + 1, container);
    path.stop();
}

export function ungroupElementsInNode(path: NodePath<T.JSXElement>, element: CodeUngroup): void {
    const children = path.node.children;
    const jsxElements = children.filter(jsxFilter);

    const container = jsxElements.find((el) => {
        if (!t.isJSXElement(el)) {
            return false;
        }
        const oid = getOidFromJsxElement(el.openingElement);
        if (!oid) {
            throw new Error('Element has no oid');
        }
        return oid === element.container.oid;
    });

    if (!container || !t.isJSXElement(container)) {
        throw new Error('Container element not found');
    }

    // The action and its inverse only track element children. Refuse content
    // they cannot restore before filtering or changing the source tree.
    assertUngroupContainerSafe(container);
    const sourceOids = container.children.filter((child): child is T.JSXElement => t.isJSXElement(child))
        .map((child) => getOidFromJsxElement(child.openingElement));
    const requested = new Set(element.children.map((child) => child.oid));
    if (sourceOids.length !== element.children.length || new Set(sourceOids).size !== sourceOids.length ||
        sourceOids.some((oid) => !oid || !requested.has(oid))) {
        throw new Error('Cannot ungroup: the rendered children do not match direct source children.');
    }

    const containerIndex = children.indexOf(container);

    if (sourceOids.length === 0 && (container.children.length > 0 ||
        t.isJSXText(children[containerIndex - 1]) || t.isJSXText(children[containerIndex + 1]))) {
        throw new Error('Cannot ungroup an empty wrapper with surrounding indentation safely.');
    }
    const snapshot = element.container.sourceCode && getAstFromCodeblock(element.container.sourceCode);
    if (element.container.sourceCode && !snapshot) throw new Error('The original group source cannot be restored.');
    if (snapshot && generate(snapshot.openingElement).code !== generate(container.openingElement).code) {
        throw new Error('The group wrapper changed since it was selected.');
    }
    element.container.sourceCode = generate(container).code;
    element.container.sourceIndex = containerIndex;
    // Preserve original child keys, indentation and props instead of deriving
    // source from the rendered DOM or rewriting unrelated sibling keys.
    children.splice(containerIndex, 1, ...container.children);

    path.stop();
}
