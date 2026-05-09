import { EditorAttributes } from '@weblab/constants';

import { penpalParent } from '../..';
import { buildLayerTree } from '../dom';

export function listenForDomMutation() {
    const targetNode = document.body;
    const config = { childList: true, subtree: true };

    const observer = new MutationObserver((mutationsList) => {
        let added = new Map();
        let removed = new Map();

        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const parent = mutation.target as HTMLElement;
                // Handle added nodes
                mutation.addedNodes.forEach((node) => {
                    const el = node as HTMLElement;
                    if (
                        node.nodeType === Node.ELEMENT_NODE &&
                        el.hasAttribute(EditorAttributes.DATA_WEBLAB_DOM_ID) &&
                        !shouldIgnoreMutatedNode(el)
                    ) {
                        dedupNewElement(el);
                        if (parent) {
                            const layerMap = buildLayerTree(parent);
                            if (layerMap) {
                                added = new Map([...added, ...layerMap]);
                            }
                        }
                    }
                });

                // Handle removed nodes
                mutation.removedNodes.forEach((node) => {
                    const el = node as HTMLElement;
                    if (
                        node.nodeType === Node.ELEMENT_NODE &&
                        el.hasAttribute(EditorAttributes.DATA_WEBLAB_DOM_ID) &&
                        !shouldIgnoreMutatedNode(el)
                    ) {
                        if (parent) {
                            const layerMap = buildLayerTree(parent);
                            if (layerMap) {
                                removed = new Map([...removed, ...layerMap]);
                            }
                        }
                    }
                });
            }
        }

        if (added.size > 0 || removed.size > 0) {
            if (penpalParent) {
                penpalParent
                    .onWindowMutated({
                        added: Object.fromEntries(added),
                        removed: Object.fromEntries(removed),
                    })
                    .catch((error: Error) => {
                        console.error('Failed to send window mutation event:', error);
                    });
            }
            // Mutations may add tall content; nudge the parent so auto-height keeps up.
            reportContentSize();
        }
    });

    observer.observe(targetNode, config);
}

export function listenForResize() {
    function notifyResize() {
        if (penpalParent) {
            penpalParent.onWindowResized().catch((error: Error) => {
                console.error('Failed to send window resize event:', error);
            });
        }
        reportContentSize();
    }

    window.addEventListener('resize', notifyResize);
}

/**
 * Track the page's intrinsic content size (driving auto-height frames in the
 * canvas). The parent receives `{ width, height }` whenever the body / docEl
 * resizes, on initial load, and after DOM mutations finish.
 */
let lastReportedHeight = 0;
let lastReportedWidth = 0;

export function reportContentSize() {
    if (!penpalParent) return;
    try {
        const docEl = document.documentElement;
        const body = document.body;
        const height = Math.max(
            docEl?.scrollHeight ?? 0,
            docEl?.offsetHeight ?? 0,
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
        );
        const width = Math.max(
            docEl?.scrollWidth ?? 0,
            docEl?.offsetWidth ?? 0,
            body?.scrollWidth ?? 0,
            body?.offsetWidth ?? 0,
        );
        if (Math.abs(height - lastReportedHeight) < 1 && Math.abs(width - lastReportedWidth) < 1) {
            return;
        }
        lastReportedHeight = height;
        lastReportedWidth = width;
        penpalParent.onContentResized({ width, height }).catch((error: Error) => {
            console.error('Failed to send content resize event:', error);
        });
    } catch (error) {
        console.warn('reportContentSize failed:', error);
    }
}

/**
 * Observe the documentElement for size changes (a content-driven height) and
 * push updates to the parent. Called once during ready.
 */
export function listenForContentResize() {
    if (typeof ResizeObserver === 'undefined') {
        return;
    }
    try {
        const ro = new ResizeObserver(() => reportContentSize());
        if (document.documentElement) {
            ro.observe(document.documentElement);
        }
        if (document.body) {
            ro.observe(document.body);
        }
    } catch (error) {
        console.warn('ResizeObserver setup failed:', error);
    }
    // Belt-and-braces in case the page's lifecycle hides scroll-height changes.
    window.addEventListener('load', () => reportContentSize());
    setTimeout(reportContentSize, 100);
    setTimeout(reportContentSize, 500);
    setTimeout(reportContentSize, 1500);
}

function shouldIgnoreMutatedNode(node: HTMLElement): boolean {
    if (node.id === EditorAttributes.WEBLAB_STUB_ID) {
        return true;
    }

    // Recognize both the current `data-weblab-inserted` and the legacy
    // `data-onlook-inserted` attributes so older customer projects keep working.
    if (
        node.getAttribute(EditorAttributes.DATA_WEBLAB_INSERTED) ||
        node.getAttribute(EditorAttributes.DATA_ONLOOK_INSERTED)
    ) {
        return true;
    }

    return false;
}

function dedupNewElement(newEl: HTMLElement) {
    // If the element has an oid and there's an inserted element with the same oid,
    // replace the existing element with the new one and restore the attributes
    const oid = newEl.getAttribute(EditorAttributes.DATA_WEBLAB_ID);
    if (!oid) {
        return;
    }
    const insertedSelectors = [
        `[${EditorAttributes.DATA_WEBLAB_ID}="${oid}"][${EditorAttributes.DATA_WEBLAB_INSERTED}]`,
        `[${EditorAttributes.DATA_WEBLAB_ID}="${oid}"][${EditorAttributes.DATA_ONLOOK_INSERTED}]`,
    ];
    document
        .querySelectorAll(insertedSelectors.join(','))
        .forEach((targetEl) => {
            const ATTRIBUTES_TO_REPLACE = [
                EditorAttributes.DATA_WEBLAB_DOM_ID,
                EditorAttributes.DATA_WEBLAB_DRAG_SAVED_STYLE,
                EditorAttributes.DATA_WEBLAB_EDITING_TEXT,
                EditorAttributes.DATA_WEBLAB_INSTANCE_ID,
            ];

            ATTRIBUTES_TO_REPLACE.forEach((attr) => {
                const targetAttr = targetEl.getAttribute(attr);
                if (targetAttr) {
                    newEl.setAttribute(attr, targetAttr);
                }
            });
            targetEl.remove();
        });
}
