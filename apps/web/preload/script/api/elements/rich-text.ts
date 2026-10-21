import type { TextSlotEdit } from '@weblab/models';
import { EditorAttributes, INLINE_TEXT_TAGS } from '@weblab/constants';

/**
 * Whole-block inline text editing (Framer/Webflow style).
 *
 * A heading like `<h1><span>AI agents for</span><span>IP analysis</span></h1>`
 * is edited as ONE text surface. Its content is modelled as an ordered list of
 * "gaps": the text + <br> runs between element children of each owner element
 * (the root and every nested inline element). Gap `k` of an owner is the run
 * before its k-th non-<br> element child, so the gap count per owner is
 * deterministic on both the DOM side and the JSX side — the source writer
 * verifies each gap's old text before replacing it.
 *
 * Block-level inline children (e.g. `span { display: block }`) render on their
 * own line; those line boundaries are "separators": visible as `\n` in the
 * editor but not stored in any gap, so they cannot be deleted (the structure
 * that causes them is preserved).
 */

const TEXT_LEVEL_TAGS = new Set(INLINE_TEXT_TAGS);

export type RichTextItem = { kind: 'gap'; key: string; text: string } | { kind: 'sep' };

export function gapKey(oid: string, index: number): string {
    return `${oid}:${index}`;
}

export function serializeItems(items: RichTextItem[]): string {
    return items.map((item) => (item.kind === 'gap' ? item.text : '\n')).join('');
}

/**
 * Distribute an edited plain-text value back onto the gaps. Computes the single
 * changed range (common prefix/suffix), trims every gap by that range and puts
 * the inserted text into the gap at the edit position.
 *
 * Returns only gaps whose text changed, or `null` when the edit cannot be
 * represented (no gap at the insertion point).
 */
export function distributeText(items: RichTextItem[], newText: string): Map<string, string> | null {
    const old = serializeItems(items);
    const result = new Map<string, string>();
    if (old === newText) {
        return result;
    }

    let prefix = 0;
    while (prefix < old.length && prefix < newText.length && old[prefix] === newText[prefix]) {
        prefix++;
    }
    let suffix = 0;
    while (
        suffix < old.length - prefix &&
        suffix < newText.length - prefix &&
        old[old.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) {
        suffix++;
    }
    const start = prefix;
    const end = old.length - suffix;
    const inserted = newText.slice(prefix, newText.length - suffix);

    const gaps: { key: string; text: string; start: number; end: number }[] = [];
    let pos = 0;
    for (const item of items) {
        if (item.kind === 'gap') {
            gaps.push({ key: item.key, text: item.text, start: pos, end: pos + item.text.length });
            pos += item.text.length;
        } else {
            pos += 1;
        }
    }

    // Insertion target: extend the text that ends at (or contains) the caret,
    // else the text that starts there, else an empty gap sitting there.
    const target =
        gaps.find((g) => g.start < start && start <= g.end) ??
        gaps.find((g) => g.start <= start && start < g.end) ??
        gaps.find((g) => g.start === start && g.end === start);
    if (!target && inserted.length > 0) {
        return null;
    }

    const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));
    for (const gap of gaps) {
        const len = gap.text.length;
        const head = gap.text.slice(0, clamp(start - gap.start, len));
        const tail = gap.text.slice(clamp(end - gap.start, len));
        const next = head + (gap === target ? inserted : '') + tail;
        if (next !== gap.text) {
            result.set(gap.key, next);
        }
    }
    return result;
}

interface GapRef {
    key: string;
    oid: string;
    index: number;
    owner: HTMLElement;
    nodes: ChildNode[];
    /** The element child that follows this gap; null = end of owner. */
    before: ChildNode | null;
}

export interface RichTextModel {
    items: RichTextItem[];
    gaps: Map<string, GapRef>;
}

function isBr(node: Node): boolean {
    return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'br';
}

function isBlockDisplay(el: Element): boolean {
    const display = window.getComputedStyle(el).display;
    return !display.startsWith('inline') && display !== 'contents' && display !== 'none';
}

export function isTextLevelElement(el: Element): boolean {
    return TEXT_LEVEL_TAGS.has(el.tagName.toLowerCase());
}

/** True when `el` has at least one text-level element child (not just text/br). */
export function hasInlineElementChildren(el: Element): boolean {
    return Array.from(el.children).some((child) => !isBr(child));
}

/**
 * Model `root` as a rich text block, or null when any descendant is not
 * text/br/text-level element, or when owners lack unique oids (the source
 * write addresses gaps by oid).
 */
export function collectRichText(root: HTMLElement): RichTextModel | null {
    const items: RichTextItem[] = [];
    const gaps = new Map<string, GapRef>();
    const seenOids = new Set<string>();
    let output = '';
    let pendingSep = false;

    const pushGap = (gap: GapRef) => {
        const text = gap.nodes.map((n) => (isBr(n) ? '\n' : (n.textContent ?? ''))).join('');
        if (text.length > 0 && pendingSep) {
            if (output.length > 0 && !output.endsWith('\n')) {
                items.push({ kind: 'sep' });
                output += '\n';
            }
            pendingSep = false;
        }
        items.push({ kind: 'gap', key: gap.key, text });
        output += text;
        gaps.set(gap.key, gap);
    };

    const walk = (owner: HTMLElement): boolean => {
        const oid = owner.getAttribute(EditorAttributes.DATA_WEBLAB_ID);
        if (!oid || seenOids.has(oid)) {
            return false;
        }
        seenOids.add(oid);
        let index = 0;
        let gap: GapRef = { key: gapKey(oid, 0), oid, index: 0, owner, nodes: [], before: null };
        for (const child of Array.from(owner.childNodes)) {
            if (child.nodeType === Node.COMMENT_NODE) {
                continue;
            }
            if (child.nodeType === Node.TEXT_NODE || isBr(child)) {
                gap.nodes.push(child);
                continue;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) {
                return false;
            }
            const el = child as HTMLElement;
            if (!isTextLevelElement(el)) {
                return false;
            }
            gap.before = el;
            pushGap(gap);
            const block = isBlockDisplay(el);
            if (block) {
                pendingSep = true;
            }
            if (!walk(el)) {
                return false;
            }
            if (block) {
                pendingSep = true;
            }
            index++;
            gap = { key: gapKey(oid, index), oid, index, owner, nodes: [], before: null };
        }
        pushGap(gap);
        return true;
    };

    return walk(root) ? { items, gaps } : null;
}

/**
 * Replace one gap's text/br nodes with `text`, leaving element siblings intact.
 * The gap's first text node is reused (its data updated) so the framework's
 * reference to it stays valid when it later re-renders from source.
 */
export function applyGapText(gap: GapRef, text: string): void {
    const reuse = gap.nodes.find((node): node is Text => node.nodeType === Node.TEXT_NODE);
    for (const node of gap.nodes) {
        if (node !== reuse) {
            node.parentNode?.removeChild(node);
        }
    }
    const before = gap.before && gap.before.parentNode === gap.owner ? gap.before : null;
    const lines = text.split('\n');
    const insert = (node: Node) => gap.owner.insertBefore(node, before);
    lines.forEach((line, i) => {
        if (i > 0) {
            insert(document.createElement('br'));
        }
        if (i === 0 && reuse) {
            reuse.data = line;
        } else if (line) {
            insert(document.createTextNode(line));
        }
    });
}

/** Apply per-gap texts keyed by `oid:index`; unknown keys are ignored. */
export function applyGapTexts(model: RichTextModel, texts: Map<string, string>): void {
    for (const [key, text] of texts) {
        const gap = model.gaps.get(key);
        if (gap) {
            applyGapText(gap, text);
        }
    }
}

export function snapshotGaps(model: RichTextModel): Map<string, string> {
    const snapshot = new Map<string, string>();
    for (const item of model.items) {
        if (item.kind === 'gap') {
            snapshot.set(item.key, item.text);
        }
    }
    return snapshot;
}

/** Slots whose text differs between `original` and `model`'s current state. */
export function diffSlots(original: Map<string, string>, model: RichTextModel): TextSlotEdit[] {
    const slots: TextSlotEdit[] = [];
    const currentTexts = snapshotGaps(model);
    for (const [key, gap] of model.gaps) {
        const oldText = original.get(key);
        if (oldText === undefined) {
            continue;
        }
        const current = currentTexts.get(key) ?? '';
        if (current !== oldText) {
            slots.push({ oid: gap.oid, index: gap.index, oldText, newText: current });
        }
    }
    return slots;
}
