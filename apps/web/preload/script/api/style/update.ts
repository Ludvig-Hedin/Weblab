import type { Change, DomElement, StyleChange } from '@weblab/models';
import type { BreakpointActionContext } from '@weblab/models/actions';
import { EditorAttributes } from '@weblab/constants';

import { getHtmlElement } from '../../helpers';
import { getElementByDomId } from '../elements';
import { cssManager } from './css-manager';

/**
 * Apply a style change inside this iframe.
 *
 * The breakpoint fan-out (parent calls `view.updateStyle` against every
 * sibling frame in the group) hands us the *primary* frame's `domId`, which
 * does NOT match the per-iframe domId assigned during DOM processing. To
 * make sibling fan-out actually land we accept an optional `oid` and, if the
 * provided `domId` doesn't exist in this iframe, resolve the local domId
 * from the source-AST oid via `[data-weblab-id="…"]`.
 *
 * Without this resolution step the sibling injection silently no-ops and the
 * "edit at one breakpoint, see the cascade in the others" UX falls apart.
 */
export function updateStyle(
    domId: string,
    change: Change<Record<string, StyleChange>>,
    breakpoint?: BreakpointActionContext,
    oid?: string | null,
): DomElement | null {
    let resolvedDomId = domId;

    // A domId can be stale or can resolve to a different element in another
    // iframe. Resolve by oid in either case before applying preview CSS.
    const directHit = getHtmlElement(domId);
    const directMatchesOid =
        !oid || directHit?.getAttribute(EditorAttributes.DATA_WEBLAB_ID) === oid;
    if ((!directHit || !directMatchesOid) && oid) {
        const byOid = document.querySelector<HTMLElement>(
            `[${EditorAttributes.DATA_WEBLAB_ID}="${CSS.escape(oid)}"]`,
        );
        const localDomId = byOid?.getAttribute(EditorAttributes.DATA_WEBLAB_DOM_ID);
        if (localDomId) {
            resolvedDomId = localDomId;
        } else {
            // Element not in this iframe (yet) — silently skip rather than
            // injecting CSS for a domId that doesn't exist here.
            return null;
        }
    } else if (!directHit) {
        return null;
    }

    // The resolved element may have disappeared during an iframe update.
    // Never leave a CSS rule behind for a missing domId.
    const resolvedElement = getHtmlElement(resolvedDomId);
    if (
        !resolvedElement ||
        (oid && resolvedElement.getAttribute(EditorAttributes.DATA_WEBLAB_ID) !== oid)
    ) {
        return null;
    }

    cssManager.updateStyle(resolvedDomId, change.updated, breakpoint);
    return getElementByDomId(resolvedDomId, true);
}
