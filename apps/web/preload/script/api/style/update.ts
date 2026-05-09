import type { Change, DomElement, StyleChange } from '@weblab/models';
import type { BreakpointActionContext } from '@weblab/models/actions';
import { EditorAttributes } from '@weblab/constants';

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

    // If the provided domId doesn't resolve in this iframe, fall back to oid.
    const directHit = document.querySelector(`[${EditorAttributes.DATA_WEBLAB_DOM_ID}="${domId}"]`);
    if (!directHit && oid) {
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
    }

    cssManager.updateStyle(resolvedDomId, change.updated, breakpoint);
    return getElementByDomId(resolvedDomId, true);
}
