import type { CmsBindingPayload, CmsFilterClause } from '@weblab/models';
import { EditorAttributes } from '@weblab/constants';
import { CmsBindingKind } from '@weblab/models';

interface CmsItemSnapshot {
    id: string;
    collectionId: string;
    values: Record<string, unknown>;
}

export interface CmsDataPayload {
    /** Map of oid -> binding payload. */
    bindings: Record<string, CmsBindingPayload>;
    /** Map of itemId -> item, used for ITEM_FIELD bindings. */
    items: Record<string, CmsItemSnapshot>;
    /** Map of collectionId -> ordered itemIds, used for FIRST_FIELD bindings. */
    itemsByCollection: Record<string, string[]>;
    /** v4: when this iframe is showing a collection page, the editor pushes
     *  the "current item" so PAGE_ITEM_FIELD bindings can resolve. */
    currentItem?: CmsItemSnapshot | null;
}

/** Marker attribute on the original list `<div>`. Matches what the editor's
 *  insert pipeline writes into user code. */
const LIST_MARKER_ATTR = 'data-weblab-list';
/** Dataset key (so DOM is `data-weblab-list-template`) that stashes the
 *  pristine inner HTML of a list node so we can re-clone on every refresh
 *  without progressively mutating the source. */
const LIST_TEMPLATE_DATASET = 'weblabListTemplate';

/**
 * Apply CMS bindings to the DOM. Called from the parent editor whenever
 * bindings or item data change.
 *
 * Three-pass design (v2):
 *
 *   0. Reset every `<div data-weblab-list>` to its saved template (if any).
 *      This makes every call idempotent — clones from previous pushes don't
 *      pile up.
 *   1. Apply top-level (non-list-descendant) bindings: ITEM_FIELD and
 *      FIRST_FIELD on elements outside any list.
 *   2. For every REPEAT binding, lazily snapshot the list's template, then
 *      clone the template once per (sorted, limited) item and resolve
 *      CURRENT_FIELD bindings against each cloned subtree.
 *
 * v1 supports ITEM_FIELD + FIRST_FIELD; v2 adds REPEAT + CURRENT_FIELD.
 *
 * Caveats:
 *   - Removing a non-list binding doesn't restore original DOM text within
 *     the iframe lifetime — reload the frame to revert. Source JSX is the
 *     source of truth; we overlay during preview only.
 *   - Cloned subtrees inherit the original template's `data-oid` /
 *     `data-weblab-dom-id`, so multiple DOM nodes share the same id.
 *     Acceptable for preview; selection-time behavior may pick the first.
 *
 * TODO (publish-time materialization, separate ticket): when publishing,
 * replace `data-weblab-list` markers with real `.map()` JSX that fetches
 * from a public read-only endpoint, instead of relying on the runtime
 * preload script.
 */
export function setCmsData(payload: CmsDataPayload): void {
    if (!document.body) return;
    const { bindings, items, itemsByCollection } = payload;
    const currentItem = payload.currentItem ?? null;

    // Pass 0: reset every list node to its saved template (if any).
    // Lists with no saved template yet stay as-is — pass 2 will save and
    // clone them in this same call.
    const allListNodes = document.querySelectorAll<HTMLElement>(`[${LIST_MARKER_ATTR}]`);
    allListNodes.forEach((node) => {
        const saved = node.dataset[LIST_TEMPLATE_DATASET];
        if (saved !== undefined) {
            node.innerHTML = saved;
        }
    });

    // Pass 1: top-level (non-list-descendant) bindings.
    for (const [oid, binding] of Object.entries(bindings)) {
        if (binding.kind === CmsBindingKind.REPEAT) continue;
        const selector = `[${EditorAttributes.DATA_WEBLAB_ID}="${escapeAttr(oid)}"]`;
        const nodes = document.querySelectorAll<HTMLElement>(selector);
        if (nodes.length === 0) continue;
        nodes.forEach((node) => {
            // Skip nodes that live inside a list — pass 2 handles them per
            // cloned item.
            if (node.closest(`[${LIST_MARKER_ATTR}]`)) return;
            const value = resolveBindingValue(
                binding,
                { items, itemsByCollection },
                undefined,
                currentItem,
            );
            if (value === undefined) return;
            applyValueToNode(node, value, binding.kind);
        });
    }

    // Pass 2: per-list iteration. For each REPEAT binding, snapshot the
    // template lazily, then clone-and-resolve once per item.
    for (const [listOid, binding] of Object.entries(bindings)) {
        if (binding.kind !== CmsBindingKind.REPEAT) continue;
        const listSelector = `[${EditorAttributes.DATA_WEBLAB_ID}="${escapeAttr(listOid)}"]`;
        const listNode = document.querySelector<HTMLElement>(listSelector);
        if (!listNode) continue;
        // Snapshot the template lazily. After pass 0's reset this is the
        // pristine template; on the very first run it captures the user's
        // initial inner HTML.
        if (listNode.dataset[LIST_TEMPLATE_DATASET] === undefined) {
            listNode.dataset[LIST_TEMPLATE_DATASET] = listNode.innerHTML;
        }
        const template = listNode.dataset[LIST_TEMPLATE_DATASET] ?? '';
        const orderedItemIds = orderItemsForRepeat(itemsByCollection, items, binding);

        // Clear and re-clone.
        listNode.innerHTML = '';
        for (const itemId of orderedItemIds) {
            const item = items[itemId];
            if (!item) continue;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = template;
            // Resolve any binding on a descendant of the cloned subtree.
            const descendants = wrapper.querySelectorAll<HTMLElement>(
                `[${EditorAttributes.DATA_WEBLAB_ID}]`,
            );
            descendants.forEach((descendant) => {
                const descOid = descendant.getAttribute(EditorAttributes.DATA_WEBLAB_ID);
                if (!descOid) return;
                const descBinding = bindings[descOid];
                if (!descBinding) return;
                const value = resolveBindingValue(
                    descBinding,
                    { items, itemsByCollection },
                    item,
                    currentItem,
                );
                if (value === undefined) return;
                applyValueToNode(descendant, value, descBinding.kind);
            });
            while (wrapper.firstChild) listNode.appendChild(wrapper.firstChild);
        }
    }
}

function resolveBindingValue(
    binding: CmsBindingPayload,
    snapshot: {
        items: Record<string, CmsItemSnapshot>;
        itemsByCollection: Record<string, string[]>;
    },
    currentRepeatItem?: CmsItemSnapshot,
    pageItem?: CmsItemSnapshot | null,
): unknown {
    switch (binding.kind) {
        case CmsBindingKind.ITEM_FIELD: {
            const item = snapshot.items[binding.itemId];
            return item?.values[binding.fieldKey];
        }
        case CmsBindingKind.FIRST_FIELD: {
            const ids = snapshot.itemsByCollection[binding.collectionId] ?? [];
            const filters = binding.filters ?? [];
            const mode = binding.filterMode ?? 'and';
            for (const id of ids) {
                const candidate = snapshot.items[id];
                if (!candidate) continue;
                if (filters.length === 0 || matchesFilters(candidate, filters, mode)) {
                    return candidate.values[binding.fieldKey];
                }
            }
            return undefined;
        }
        case CmsBindingKind.CURRENT_FIELD: {
            return currentRepeatItem?.values[binding.fieldKey];
        }
        case CmsBindingKind.PAGE_ITEM_FIELD: {
            return pageItem?.values[binding.fieldKey];
        }
        case CmsBindingKind.REPEAT:
            // REPEAT is structural; setCmsData handles it in pass 2 directly.
            return undefined;
        default:
            return undefined;
    }
}

/**
 * Evaluate filter clauses against an item. `mode` is 'and' (default) or
 * 'or'. Coercion gotchas:
 *   - `before`/`after` parse both sides as ISO dates; unparseable values
 *     never match.
 *   - `contains`/`starts_with` coerce non-strings via `String()`.
 *   - `is_set` is true when the value is non-null, non-undefined, and not
 *     the empty string.
 */
export function matchesFilters(
    item: CmsItemSnapshot,
    filters: CmsFilterClause[],
    mode: 'and' | 'or' = 'and',
): boolean {
    if (filters.length === 0) return true;
    if (mode === 'or') {
        for (const clause of filters) {
            const v = item.values[clause.fieldKey];
            if (matchesClause(v, clause)) return true;
        }
        return false;
    }
    for (const clause of filters) {
        const v = item.values[clause.fieldKey];
        if (!matchesClause(v, clause)) return false;
    }
    return true;
}

function matchesClause(v: unknown, clause: CmsFilterClause): boolean {
    switch (clause.op) {
        case 'eq':
            return v === clause.value;
        case 'neq':
            return v !== clause.value;
        case 'before':
        case 'after': {
            const itemTime = parseDate(v);
            const clauseTime = parseDate(clause.value);
            if (itemTime === null || clauseTime === null) return false;
            return clause.op === 'before' ? itemTime < clauseTime : itemTime > clauseTime;
        }
        case 'contains':
            return String(v ?? '').includes(clause.value);
        case 'starts_with':
            return String(v ?? '').startsWith(clause.value);
        case 'is_set':
            return v !== null && v !== undefined && v !== '';
        case 'is_unset':
            return v === null || v === undefined || v === '';
        default:
            return false;
    }
}

function parseDate(v: unknown): number | null {
    if (typeof v !== 'string') return null;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Sort + limit the items for a REPEAT binding. Done client-side so multiple
 * REPEAT bindings on the same collection with different sort orders don't
 * require multiple server queries.
 */
function orderItemsForRepeat(
    itemsByCollection: Record<string, string[]>,
    items: Record<string, CmsItemSnapshot>,
    binding: Extract<CmsBindingPayload, { kind: CmsBindingKind.REPEAT }>,
): string[] {
    let ids = (itemsByCollection[binding.collectionId] ?? []).slice();
    // Filters apply before sort + limit so the user sees a stable subset.
    if (binding.filters && binding.filters.length > 0) {
        const mode = binding.filterMode ?? 'and';
        ids = ids.filter((id) => {
            const item = items[id];
            return item ? matchesFilters(item, binding.filters!, mode) : false;
        });
    }
    if (binding.sort) {
        const { fieldKey, direction } = binding.sort;
        const dir = direction === 'desc' ? -1 : 1;
        ids.sort((a, b) => {
            const av = items[a]?.values[fieldKey];
            const bv = items[b]?.values[fieldKey];
            return compareValues(av, bv) * dir;
        });
    }
    if (binding.limit !== undefined && binding.limit >= 0) {
        return ids.slice(0, binding.limit);
    }
    return ids;
}

function compareValues(a: unknown, b: unknown): number {
    // Push undefined / null to the end of an ascending sort.
    const aMissing = a === undefined || a === null || a === '';
    const bMissing = b === undefined || b === null || b === '';
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    // Date strings sort naturally as ISO; otherwise fall through to string compare.
    const as = String(a);
    const bs = String(b);
    return as < bs ? -1 : as > bs ? 1 : 0;
}

function applyValueToNode(node: HTMLElement, value: unknown, _kind: CmsBindingKind): void {
    // Image-shaped values: prefer setting src on <img>, otherwise treat as
    // background. JSON-shape: { url, path? }.
    if (isImageValue(value)) {
        if (node.tagName === 'IMG') {
            (node as HTMLImageElement).src = value.url;
            return;
        }
        node.style.backgroundImage = `url(${JSON.stringify(value.url)})`;
        return;
    }

    // String values: text only for v1. We do not have per-field type info
    // here, so we cannot distinguish "rich text" from "plain text containing
    // angle brackets" — and assigning to innerHTML on user-supplied content
    // is an XSS vector (e.g. `<img onerror=…>`). Until v2 threads field type
    // metadata into the binding payload AND introduces a sanitizer
    // (DOMPurify or similar), always render as text.
    if (typeof value === 'string') {
        node.textContent = value;
        return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        node.textContent = String(value);
        return;
    }

    // Anything else: stringify so the user sees something rather than blank.
    if (value !== null) {
        node.textContent = JSON.stringify(value);
    }
}

function isImageValue(value: unknown): value is { url: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'url' in value &&
        typeof (value as { url: unknown }).url === 'string'
    );
}

function escapeAttr(value: string): string {
    // Order matters: escape backslashes first so we don't double-escape the
    // ones we add below. Without this, an oid containing `\` produces a
    // malformed CSS attribute selector.
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Walks up the DOM from the element identified by `domId` and returns the
 * `data-oid` of the nearest ancestor that carries `data-weblab-list`, or
 * `null` if none. Used by the bind dialog to detect whether the selected
 * element lives inside a CMS list (which switches the dialog into
 * CURRENT_FIELD mode).
 */
export function findListAncestorOid(domId: string): string | null {
    const escapedDomId = domId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const start = document.querySelector<HTMLElement>(
        `[${EditorAttributes.DATA_WEBLAB_DOM_ID}="${escapedDomId}"]`,
    );
    if (!start) return null;
    let cur: HTMLElement | null = start.parentElement;
    while (cur) {
        if (cur.hasAttribute('data-weblab-list')) {
            return cur.getAttribute(EditorAttributes.DATA_WEBLAB_ID);
        }
        cur = cur.parentElement;
    }
    return null;
}
