import type { DomElement, EditTextResult, LayerNode, TextSlotEdit } from '@weblab/models';
import { EditorAttributes } from '@weblab/constants';

import { getHtmlElement } from '../../helpers';
import { buildLayerTree } from '../dom';
import { collectEditingFontFaces, getEditingTypography } from './font-faces';
import { getDomElement, restoreElementStyle } from './helpers';
import {
    applyGapTexts,
    collectRichText,
    diffSlots,
    distributeText,
    gapKey,
    hasInlineElementChildren,
    isTextLevelElement,
    serializeItems,
    snapshotGaps,
} from './rich-text';

/**
 * Gap texts of each whole-block edit session at start, keyed by element. The
 * source write is expressed as per-gap changes relative to this snapshot.
 */
const richSessions = new WeakMap<HTMLElement, Map<string, string>>();

export function editTextByDomId(domId: string, content: string): DomElement | null {
    const el: HTMLElement | null = getHtmlElement(domId);
    if (!el) {
        return null;
    }
    updateTextContent(el, content);
    return getDomElement(el, true);
}

export async function startEditingText(
    domId: string,
    allowPromote = true,
): Promise<EditTextResult | null> {
    const hit = getHtmlElement(domId);
    if (!hit) {
        console.warn('Start editing text failed. No element for selector:', domId);
        return null;
    }
    // Double-clicking one line (<span>) of a heading edits the whole heading,
    // like Framer/Webflow: climb to the outermost text block.
    const el = allowPromote ? promoteToTextBlock(hit) : hit;

    let originalContent: string;
    let rich = false;
    if (hasOnlyTextAndBreaks(el)) {
        originalContent = extractTextContent(el);
    } else {
        const model = collectRichText(el);
        if (!model) {
            console.warn('Start editing text failed. Element is not a text block:', domId);
            return null;
        }
        rich = true;
        richSessions.set(el, snapshotGaps(model));
        originalContent = serializeItems(model.items);
    }

    prepareElementForEditing(el);

    return {
        originalContent,
        domEl: getDomElement(el, true),
        rich,
        typography: getEditingTypography(el),
        fontFaces: await collectEditingFontFaces(el),
    };
}

function hasOnlyTextAndBreaks(el: HTMLElement): boolean {
    return Array.from(el.childNodes).every(
        (node) =>
            node.nodeType === Node.COMMENT_NODE ||
            node.nodeType === Node.TEXT_NODE ||
            (node.nodeType === Node.ELEMENT_NODE &&
                (node as Element).tagName.toLowerCase() === 'br'),
    );
}

function promoteToTextBlock(el: HTMLElement): HTMLElement {
    let current = el;
    while (isTextLevelElement(current)) {
        const parent = current.parentElement;
        if (!parent || parent === document.body || parent === document.documentElement) {
            break;
        }
        if (!collectRichText(parent)) {
            break;
        }
        current = parent;
    }
    return current;
}

export function editText(
    domId: string,
    content: string,
    textSlots?: TextSlotEdit[],
): {
    domEl: DomElement;
    newMap: Map<string, LayerNode> | null;
    textSlots?: TextSlotEdit[];
} | null {
    const el = getHtmlElement(domId);
    if (!el) {
        console.warn('Edit text failed. No element for selector:', domId);
        return null;
    }
    if (textSlots?.length || hasInlineElementChildren(el)) {
        return editRichText(el, content, textSlots);
    }
    prepareElementForEditing(el);
    updateTextContent(el, content);
    return {
        domEl: getDomElement(el, true),
        newMap: buildLayerTree(el),
    };
}

/**
 * Whole-block edit: put the new text into the element's existing text runs,
 * keeping inline elements (spans, <strong>, …). With `textSlots` (undo/redo)
 * the runs are set exactly; otherwise the change is distributed by diff.
 */
function editRichText(
    el: HTMLElement,
    content: string,
    textSlots?: TextSlotEdit[],
): { domEl: DomElement; newMap: Map<string, LayerNode> | null; textSlots?: TextSlotEdit[] } | null {
    const model = collectRichText(el);
    if (!model) {
        console.warn('Edit text failed. Element is not a text block');
        return null;
    }
    const texts = textSlots?.length
        ? new Map(textSlots.map((slot) => [gapKey(slot.oid, slot.index), slot.newText]))
        : distributeText(model.items, content);
    if (!texts) {
        console.warn('Edit text failed. Change cannot be placed in the text block');
        return null;
    }
    applyGapTexts(model, texts);
    return {
        domEl: getDomElement(el, true),
        newMap: buildLayerTree(el),
        textSlots: getSessionSlots(el),
    };
}

function getSessionSlots(el: HTMLElement): TextSlotEdit[] | undefined {
    const original = richSessions.get(el);
    const model = original ? collectRichText(el) : null;
    return original && model ? diffSlots(original, model) : undefined;
}

export function stopEditingText(domId: string): {
    newContent: string;
    domEl: DomElement;
    textSlots?: TextSlotEdit[];
} | null {
    const el = getHtmlElement(domId);
    if (!el) {
        console.warn('Stop editing text failed. No element for selector:', domId);
        return null;
    }
    cleanUpElementAfterEditing(el);
    const textSlots = getSessionSlots(el);
    richSessions.delete(el);
    const model = textSlots ? collectRichText(el) : null;
    return {
        newContent: model ? serializeItems(model.items) : extractTextContent(el),
        domEl: getDomElement(el, true),
        textSlots,
    };
}

function prepareElementForEditing(el: HTMLElement) {
    el.setAttribute(EditorAttributes.DATA_WEBLAB_EDITING_TEXT, 'true');
}

function cleanUpElementAfterEditing(el: HTMLElement) {
    restoreElementStyle(el);
    removeEditingAttributes(el);
}

function removeEditingAttributes(el: HTMLElement) {
    el.removeAttribute(EditorAttributes.DATA_WEBLAB_EDITING_TEXT);
}

function updateTextContent(el: HTMLElement, content: string): void {
    // SECURITY INVARIANT: Only escaped text nodes and explicit <br> elements are allowed.
    // 1. Normalize line endings (CRLF/CR -> LF)
    // 2. Split on newlines to get text segments
    // 3. Build DOM with text nodes (auto-escaped) interleaved with <br> elements
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');

    el.innerHTML = '';
    lines.forEach((line, index) => {
        el.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
            el.appendChild(document.createElement('br'));
        }
    });
}

export function extractTextContent(el: HTMLElement): string {
    let content = el.innerHTML;
    // Browsers' contenteditable can insert block elements (e.g. <div>) on
    // Enter or paste — preserve their boundaries as newlines before stripping
    // tags, otherwise multi-line edits collapse onto one line.
    // Layer discovery assigns DOM IDs to inserted breaks before this final
    // read, so attributed <br> elements must retain their newline too.
    content = content.replace(/<br(?=[\s/>])[^>]*>/gi, '\n');
    content = content.replace(/<\/(div|p|h[1-6]|li|tr|blockquote|pre)>/gi, '\n');
    content = content.replace(/<[^>]*>/g, '');
    const textArea = document.createElement('textarea');
    textArea.innerHTML = content;
    // Trim trailing newlines added by the block-close replacement above so
    // `<p>Hello</p>` returns "Hello", not "Hello\n". Leading whitespace is
    // similarly meaningless for edit-roundtrip and would create phantom
    // diffs against the source.
    return textArea.value.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
}

export function isChildTextEditable(oid: string): boolean | null {
    return true;
}
