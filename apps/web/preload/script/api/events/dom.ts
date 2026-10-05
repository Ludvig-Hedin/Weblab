import { EditorAttributes } from '@weblab/constants';

import { penpalParent } from '../..';

export function listenForDomMutation() {
    const targetNode = document.body;
    const config = { childList: true, subtree: true };

    const observer = new MutationObserver((mutationsList) => {
        // The editor only needs to know that editable nodes changed; it then
        // refreshes layers itself. Building a layer tree per mutated node was
        // O(N^2) getComputedStyle work whose payload the editor discarded.
        let changed = false;

        for (const mutation of mutationsList) {
            if (mutation.type !== 'childList') continue;
            mutation.addedNodes.forEach((node) => {
                if (!isEditableElement(node)) return;
                dedupNewElement(node);
                changed = true;
            });
            if (!changed) {
                mutation.removedNodes.forEach((node) => {
                    if (isEditableElement(node)) changed = true;
                });
            }
        }

        if (changed) {
            if (penpalParent) {
                penpalParent
                    .onWindowMutated({ added: {}, removed: {} })
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

function isEditableElement(node: Node): node is HTMLElement {
    return (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as HTMLElement).hasAttribute(EditorAttributes.DATA_WEBLAB_DOM_ID) &&
        !shouldIgnoreMutatedNode(node as HTMLElement)
    );
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
        // scrollHeight/offsetHeight never drop below the frame's own height,
        // so a frame that once grew tall could never shrink back. Measure
        // where the page content actually ends instead.
        const height =
            measureContentBottom() ||
            Math.max(
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

/** Bottom edge of the body's in-flow content, in page pixels (0 if unknown). */
function measureContentBottom(): number {
    const body = document.body;
    if (!body) return 0;
    let bottom = 0;
    for (const child of Array.from(body.children)) {
        const style = getComputedStyle(child);
        if (style.position === 'fixed' || style.display === 'none') continue;
        const rect = child.getBoundingClientRect();
        if (rect.height === 0 && rect.width === 0) continue;
        bottom = Math.max(bottom, rect.bottom + window.scrollY + (parseFloat(style.marginBottom) || 0));
    }
    if (bottom === 0) return 0;
    const bodyStyle = getComputedStyle(body);
    return Math.ceil(
        bottom + (parseFloat(bodyStyle.paddingBottom) || 0) + (parseFloat(bodyStyle.marginBottom) || 0),
    );
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
    document.querySelectorAll(insertedSelectors.join(',')).forEach((targetEl) => {
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
