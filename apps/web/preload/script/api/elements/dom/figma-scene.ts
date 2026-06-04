import { getHtmlElement, isValidHtmlElement } from '../../../helpers';

/**
 * Serialized DOM subtree consumed by `@weblab/figma-clipboard` (mirrors its
 * `FigmaSceneNode` — keep the two in sync). Built inside the preview iframe so we
 * can read live geometry + computed styles, which the editor frame cannot do
 * across origins.
 */
interface SceneNode {
    tag: string;
    rect: { x: number; y: number; width: number; height: number };
    text: string | null;
    isImage: boolean;
    styles: Record<string, string>;
    children: SceneNode[];
}

const MAX_NODES = 2000;
const MAX_DEPTH = 60;
const MAX_TEXT = 5000;

const STYLE_KEYS = [
    'backgroundColor',
    'color',
    'opacity',
    'borderTopWidth',
    'borderTopStyle',
    'borderTopColor',
    'borderColor',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'textAlign',
    'display',
    'visibility',
] as const;

/**
 * Capture a DOM element (or the whole frame body when `domId` is omitted) as a
 * scene tree the editor can encode into Figma's clipboard format.
 */
export function getFigmaSceneData(domId?: string): SceneNode | null {
    const root = domId ? getHtmlElement(domId) : document.body;
    if (!root) {
        if (domId) console.warn('Figma copy: element not found for domId', domId);
        return null;
    }
    const rootRect = root.getBoundingClientRect();
    const counter = { count: 0 };
    return serialize(root, rootRect, 0, counter);
}

function serialize(
    el: HTMLElement,
    rootRect: DOMRect,
    depth: number,
    counter: { count: number },
): SceneNode | null {
    if (counter.count >= MAX_NODES || depth > MAX_DEPTH) return null;
    if (!isValidHtmlElement(el)) return null;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const computed = window.getComputedStyle(el);
    if (computed.visibility === 'hidden' || computed.display === 'none') return null;

    counter.count++;

    const styles: Record<string, string> = {};
    for (const key of STYLE_KEYS)
        styles[key] = computed[key as keyof CSSStyleDeclaration] as string;

    const elementChildren = Array.from(el.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement,
    );
    // Only a real replaced <img> is treated as an image *leaf* (→ placeholder
    // rect). A container that merely has a `background-image` must NOT be
    // flagged here — doing so would skip child recursion below and silently drop
    // its entire subtree (e.g. a hero with a bg image + text/buttons).
    const isImage = el.tagName === 'IMG';

    // Leaf with text and no element children → a Figma TEXT node.
    const ownText = elementChildren.length === 0 ? (el.textContent ?? '').trim() : '';
    const text = ownText.length > 0 ? ownText.slice(0, MAX_TEXT) : null;

    const children: SceneNode[] = [];
    if (!text && !isImage) {
        for (const child of elementChildren) {
            const node = serialize(child, rootRect, depth + 1, counter);
            if (node) children.push(node);
        }
    }

    return {
        tag: el.tagName.toLowerCase(),
        rect: {
            x: rect.left - rootRect.left,
            y: rect.top - rootRect.top,
            width: rect.width,
            height: rect.height,
        },
        text,
        isImage,
        styles,
        children,
    };
}
