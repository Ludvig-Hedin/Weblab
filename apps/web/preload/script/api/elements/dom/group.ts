import type { DomElement, LayerNode } from '@weblab/models';
import type { ActionTarget, GroupContainer } from '@weblab/models/actions';
import { EditorAttributes } from '@weblab/constants';

import { getHtmlElement } from '../../../helpers';
import { getOrAssignDomId } from '../../../helpers/ids';
import { buildLayerTree } from '../../dom';
import { getDomElement } from '../helpers';

export function groupElements(
    parent: ActionTarget,
    container: GroupContainer,
    children: Array<ActionTarget>,
): { domEl: DomElement; newMap: Map<string, LayerNode> | null } | null {
    const parentEl = getHtmlElement(parent.domId);
    if (!parentEl) {
        console.warn('Failed to find parent element', parent.domId);
        return null;
    }

    const containerEl = createContainerElement(container);

    // Find child elements and their positions
    const childrenMap = new Set(children.map((c) => c.domId));
    const childrenWithIndices = Array.from(parentEl.children)
        .map((child, index) => ({
            element: child as HTMLElement,
            index,
            domId: getOrAssignDomId(child as HTMLElement),
        }))
        .filter(({ domId }) => childrenMap.has(domId));

    if (childrenWithIndices.length === 0) {
        console.warn('No valid children found to group');
        return null;
    }

    // Insert container at the position of the first child
    const insertIndex = Math.min(...childrenWithIndices.map((c) => c.index));
    parentEl.insertBefore(containerEl, parentEl.children[insertIndex] ?? null);

    // Move children into container (move, not clone, to avoid duplicate IDs and stale listeners)
    childrenWithIndices.forEach(({ element }) => {
        containerEl.appendChild(element);
    });

    const domEl = getDomElement(containerEl, true);

    return {
        domEl,
        newMap: buildLayerTree(containerEl),
    };
}

export function ungroupElements(
    parent: ActionTarget,
    container: GroupContainer,
): { domEl: DomElement; newMap: Map<string, LayerNode> | null } | null {
    const parentEl = getHtmlElement(parent.domId);
    if (!parentEl) {
        console.warn(`Parent element not found: ${parent.domId}`);
        return null;
    }

    let containerEl: HTMLElement | null;

    if (container.domId) {
        containerEl = getHtmlElement(container.domId);
    } else {
        console.warn(`Container domId is required for ungrouping`);
        return null;
    }

    if (!containerEl) {
        console.warn(`Container element not found for ungrouping`);
        return null;
    }

    // Move all children of the container to the parent
    const children = Array.from(containerEl.children) as HTMLElement[];
    children.forEach((child) => {
        parentEl.appendChild(child);
    });

    // Remove the empty container
    containerEl.remove();

    const domEl = getDomElement(parentEl, true);

    return {
        domEl,
        newMap: buildLayerTree(parentEl),
    };
}

function createContainerElement(target: GroupContainer): HTMLElement {
    const containerEl = document.createElement(target.tagName);
    Object.entries(target.attributes).forEach(([key, value]) => {
        containerEl.setAttribute(key, value);
    });
    containerEl.setAttribute(EditorAttributes.DATA_WEBLAB_INSERTED, 'true');
    containerEl.setAttribute(EditorAttributes.DATA_WEBLAB_DOM_ID, target.domId);
    containerEl.setAttribute(EditorAttributes.DATA_WEBLAB_ID, target.oid);
    return containerEl;
}
