import type {
    Color,
    FigmaMessage,
    FigmaScene,
    FigmaSceneNode,
    NodeChange,
    Paint,
    SceneRect,
} from './types';
import { parseCssColor } from './color';
import { positionForIndex } from './fractional-index';

const PAGE_GUID = { sessionID: 0, localID: 1 } as const;
/** Safety cap so a pathological subtree can't produce a multi-MB buffer. */
const MAX_NODES = 2000;
const PLACEHOLDER_FILL: Color = { r: 0.85, g: 0.85, b: 0.85, a: 1 };

// TODO(figma-fidelity): v1 maps solid fills/borders/radius/text/opacity with
// absolute positioning. Deferred (see BACKLOG "Copy to Figma (F-783)"):
// real image fills (buffer blobs), flex→auto-layout, gradients/shadows/transforms,
// and the live-Figma checks for clipboard version + parentIndex.position.

interface BuildOptions {
    /** Deterministic id for tests; defaults to a random int. */
    pasteID?: number;
}

export function sceneToFigmaMessage(scene: FigmaScene, opts: BuildOptions = {}): FigmaMessage {
    const pasteID = opts.pasteID ?? Math.floor(Math.random() * 0x7fffffff);
    const ctx = { nextLocalID: 2, nodeChanges: [] as NodeChange[] };

    if (scene.name) {
        // Override the root's display name when provided (e.g. a frame label).
        emitNode(ctx, scene.root, PAGE_GUID, 0, 1, scene.root.rect, scene.name);
    } else {
        emitNode(ctx, scene.root, PAGE_GUID, 0, 1, scene.root.rect);
    }

    return {
        type: 'NODE_CHANGES',
        sessionID: 0,
        ackID: 0,
        pasteID,
        pasteFileKey: '',
        pasteIsPartiallyOutsideEnclosingFrame: false,
        pastePageId: { ...PAGE_GUID },
        nodeChanges: ctx.nodeChanges,
    };
}

function emitNode(
    ctx: { nextLocalID: number; nodeChanges: NodeChange[] },
    node: FigmaSceneNode,
    parentGuid: { sessionID: number; localID: number },
    index: number,
    siblingCount: number,
    parentRect: SceneRect,
    nameOverride?: string,
): void {
    if (ctx.nodeChanges.length >= MAX_NODES) return;
    const { rect, styles } = node;
    if (rect.width <= 0 || rect.height <= 0) return;
    if (styles.visibility === 'hidden' || styles.display === 'none') return;

    const guid = { sessionID: 0, localID: ctx.nextLocalID++ };
    const isText = node.text != null && node.text.trim().length > 0;

    const change: NodeChange = {
        guid,
        phase: 'CREATED',
        parentIndex: { guid: parentGuid, position: positionForIndex(index, siblingCount) },
        type: isText ? 'TEXT' : 'FRAME',
        name: nameOverride ?? defaultName(node, isText),
        visible: true,
        size: { x: round(rect.width), y: round(rect.height) },
        // Position is relative to the parent's top-left.
        transform: {
            m00: 1,
            m01: 0,
            m02: round(rect.x - parentRect.x),
            m10: 0,
            m11: 1,
            m12: round(rect.y - parentRect.y),
        },
    };

    const opacity = parseNumber(styles.opacity);
    if (opacity != null && opacity < 1) change.opacity = clamp01(opacity);

    if (isText) {
        applyText(change, node);
    } else {
        applyBox(change, node);
    }

    ctx.nodeChanges.push(change);

    // Text nodes are treated as leaves (their text is the content).
    if (!isText) {
        const children = node.children ?? [];
        for (let i = 0; i < children.length; i++) {
            emitNode(ctx, children[i]!, guid, i, children.length, rect);
        }
    }
}

function applyBox(change: NodeChange, node: FigmaSceneNode): void {
    const { styles } = node;

    if (node.isImage) {
        change.fillPaints = [solidPaint(PLACEHOLDER_FILL)];
    } else {
        const bg = parseCssColor(styles.backgroundColor);
        if (bg) change.fillPaints = [solidPaint(bg)];
    }

    // Borders (treated as uniform — top edge wins).
    const borderWidth = parseNumber(styles.borderTopWidth) ?? 0;
    const borderColor = parseCssColor(styles.borderTopColor ?? styles.borderColor);
    if (borderWidth > 0 && borderColor && styles.borderTopStyle !== 'none') {
        change.strokePaints = [solidPaint(borderColor)];
        change.strokeWeight = round(borderWidth);
        change.strokeAlign = 'INSIDE';
    }

    applyCornerRadius(change, styles);
}

function applyCornerRadius(change: NodeChange, styles: Record<string, string>): void {
    const tl = parseNumber(styles.borderTopLeftRadius) ?? 0;
    const tr = parseNumber(styles.borderTopRightRadius) ?? 0;
    const br = parseNumber(styles.borderBottomRightRadius) ?? 0;
    const bl = parseNumber(styles.borderBottomLeftRadius) ?? 0;
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) return;

    if (tl === tr && tr === br && br === bl) {
        change.cornerRadius = round(tl);
        return;
    }
    change.rectangleCornerRadiiIndependent = true;
    change.rectangleTopLeftCornerRadius = round(tl);
    change.rectangleTopRightCornerRadius = round(tr);
    change.rectangleBottomRightCornerRadius = round(br);
    change.rectangleBottomLeftCornerRadius = round(bl);
}

function applyText(change: NodeChange, node: FigmaSceneNode): void {
    const { styles } = node;
    change.textData = { characters: node.text ?? '' };

    const fontSize = parseNumber(styles.fontSize);
    if (fontSize != null) change.fontSize = round(fontSize);

    change.fontName = {
        family: firstFontFamily(styles.fontFamily) || 'Inter',
        style: fontStyleName(styles.fontWeight, styles.fontStyle),
        postscript: '',
    };

    const color = parseCssColor(styles.color) ?? { r: 0, g: 0, b: 0, a: 1 };
    change.fillPaints = [solidPaint(color)];
    change.textAlignHorizontal = mapTextAlign(styles.textAlign);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function solidPaint(color: Color): Paint {
    return {
        type: 'SOLID',
        color: { r: color.r, g: color.g, b: color.b, a: 1 },
        opacity: color.a,
        visible: true,
        blendMode: 'NORMAL',
    };
}

function defaultName(node: FigmaSceneNode, isText: boolean): string {
    if (isText) {
        const t = (node.text ?? '').trim().replace(/\s+/g, ' ');
        return t.length > 24 ? `${t.slice(0, 24)}…` : t || 'Text';
    }
    if (node.isImage) return 'Image';
    return node.tag ? node.tag.toLowerCase() : 'Frame';
}

function firstFontFamily(fontFamily: string | undefined): string {
    if (!fontFamily) return '';
    const first = fontFamily.split(',')[0] ?? '';
    return first.trim().replace(/^["']|["']$/g, '');
}

function fontStyleName(weightRaw: string | undefined, styleRaw: string | undefined): string {
    const italic = (styleRaw ?? '').includes('italic') || (styleRaw ?? '').includes('oblique');
    const weight = parseNumber(weightRaw) ?? (weightRaw === 'bold' ? 700 : 400);
    const base =
        weight >= 800
            ? 'ExtraBold'
            : weight >= 700
              ? 'Bold'
              : weight >= 600
                ? 'SemiBold'
                : weight >= 500
                  ? 'Medium'
                  : weight <= 300
                    ? 'Light'
                    : 'Regular';
    if (!italic) return base;
    return base === 'Regular' ? 'Italic' : `${base} Italic`;
}

function mapTextAlign(textAlign: string | undefined): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
    switch ((textAlign ?? '').trim()) {
        case 'center':
            return 'CENTER';
        case 'right':
        case 'end':
            return 'RIGHT';
        case 'justify':
            return 'JUSTIFIED';
        default:
            return 'LEFT';
    }
}

function parseNumber(value: string | undefined): number | null {
    if (value == null) return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

function clamp01(n: number): number {
    return Math.max(0, Math.min(1, n));
}

function round(n: number): number {
    return Math.round(n * 100) / 100;
}
