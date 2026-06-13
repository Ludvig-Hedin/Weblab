/**
 * Pure ordering / slug helpers for the AI wireframes feature. No Convex imports
 * so they can be unit-tested directly (convex/lib/wireframeOrder.test.ts) and
 * reused by both sitemap and wireframe mutations.
 */

/** Turn an arbitrary title into a url-safe slug. Never returns empty. */
export function slugify(title: string): string {
    const s = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return s.length > 0 ? s : 'page';
}

/** Ensure `base` is unique against `taken`, appending -2, -3, … as needed. */
export function dedupeSlug(base: string, taken: Iterable<string>): string {
    const set = new Set(taken);
    if (!set.has(base)) return base;
    let n = 2;
    while (set.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

/** Next order value to append after the current items. */
export function nextOrder(orders: readonly number[]): number {
    return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/** Immutably move an item between positions (clamped). */
export function moveInArray<T>(arr: readonly T[], from: number, to: number): T[] {
    const next = [...arr];
    if (from < 0 || from >= next.length) return next;
    const clampedTo = Math.max(0, Math.min(to, next.length - 1));
    const [item] = next.splice(from, 1);
    if (item === undefined) return next;
    next.splice(clampedTo, 0, item);
    return next;
}

/**
 * Given items already in display order, return the id→order pairs that compact
 * them to a contiguous 0..n-1 sequence. Used after insert/delete/reorder so the
 * `order` column stays dense and stable.
 */
export function reindex<T extends { _id: string }>(orderedItems: readonly T[]): Array<{
    id: string;
    order: number;
}> {
    return orderedItems.map((item, index) => ({ id: item._id, order: index }));
}
