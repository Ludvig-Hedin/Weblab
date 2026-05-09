import type { DomElement } from '@weblab/models';
import { EditorAttributes } from '@weblab/constants';

import { getHtmlElement } from '../../helpers';
import { getDomElement } from './helpers';

export const getElementByDomId = (domId: string, getStyle: boolean): DomElement => {
    const el = getHtmlElement(domId) || document.body;
    return getDomElement(el, getStyle);
};

/**
 * Look up an element by its source-AST oid (`data-weblab-id`). Used for
 * cross-iframe operations like the breakpoint fan-out, where the parent only
 * knows the oid and each iframe assigns its own runtime domId.
 *
 * Returns null when the oid isn't present in this iframe — the caller can
 * fall back to a different resolution strategy or skip silently.
 */
export const getElementByOid = (oid: string, getStyle: boolean): DomElement | null => {
    const el = document.querySelector<HTMLElement>(
        `[${EditorAttributes.DATA_WEBLAB_ID}="${CSS.escape(oid)}"]`,
    );
    if (!el) return null;
    return getDomElement(el, getStyle);
};

export const getElementAtLoc = (x: number, y: number, getStyle: boolean): DomElement => {
    const el = getDeepElement(x, y) || document.body;
    return getDomElement(el as HTMLElement, getStyle);
};

const getDeepElement = (x: number, y: number): Element | undefined => {
    const el = document.elementFromPoint(x, y);
    if (!el) {
        return;
    }
    const crawlShadows = (node: Element): Element => {
        if (node?.shadowRoot) {
            const potential = node.shadowRoot.elementFromPoint(x, y);
            if (potential == node) {
                return node;
            } else if (potential?.shadowRoot) {
                return crawlShadows(potential);
            } else {
                return potential || node;
            }
        } else {
            return node;
        }
    };

    const nested_shadow = crawlShadows(el);
    return nested_shadow || el;
};

export const updateElementInstance = (domId: string, instanceId: string, component: string) => {
    const el = getHtmlElement(domId);
    if (!el) {
        console.warn('Failed to updateElementInstanceId: Element not found');
        return;
    }
    el.setAttribute(EditorAttributes.DATA_WEBLAB_INSTANCE_ID, instanceId);
    el.setAttribute(EditorAttributes.DATA_WEBLAB_COMPONENT_NAME, component);
};

export const getParentElement = (domId: string) => {
    const el = getHtmlElement(domId);
    if (!el?.parentElement) {
        return null;
    }
    return getDomElement(el.parentElement, false);
};

export const getChildrenCount = (domId: string) => {
    const el = getHtmlElement(domId);
    if (!el) {
        return 0;
    }
    return el.children.length;
};

export const getOffsetParent = (domId: string) => {
    const el = getHtmlElement(domId);
    if (!el) {
        return null;
    }
    return getDomElement(el.offsetParent as HTMLElement, false);
};
