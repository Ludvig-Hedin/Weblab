/// <reference types="@figma/plugin-typings" />

import type { SerializedNode } from '../codegen/types';
import type { PluginToUIMessage, UIToPluginMessage } from '../shared/messages';

figma.showUI(__html__, { width: 480, height: 560, title: 'Weblab Export' });

function colorToHex(color: RGB | RGBA): string {
    const hex = (n: number) =>
        Math.round(Math.max(0, Math.min(1, n)) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

function getSolidFill(fills: ReadonlyArray<Paint> | Paint[]): string | undefined {
    const solid = (fills as Paint[]).find(
        (f): f is SolidPaint => f.type === 'SOLID' && f.visible !== false,
    );
    return solid ? colorToHex(solid.color) : undefined;
}

function serialize(node: SceneNode): SerializedNode {
    const base: SerializedNode = {
        type: node.type as SerializedNode['type'],
        name: node.name,
        width: 'width' in node ? Math.round((node as LayoutMixin).width) : 0,
        height: 'height' in node ? Math.round((node as LayoutMixin).height) : 0,
    };

    // Auto-layout (FRAME / COMPONENT nodes)
    if ('layoutMode' in node) {
        const f = node as FrameNode;
        if (f.layoutMode === 'HORIZONTAL' || f.layoutMode === 'VERTICAL') {
            base.layoutMode = f.layoutMode;
            base.primaryAxisAlignItems = f.primaryAxisAlignItems;
            base.counterAxisAlignItems =
                f.counterAxisAlignItems as SerializedNode['counterAxisAlignItems'];
            base.paddingTop = f.paddingTop;
            base.paddingRight = f.paddingRight;
            base.paddingBottom = f.paddingBottom;
            base.paddingLeft = f.paddingLeft;
            base.itemSpacing = f.itemSpacing;
        }
    }

    // Fills → backgroundColor
    if ('fills' in node) {
        const fills = (node as GeometryMixin).fills;
        if (Array.isArray(fills)) {
            base.backgroundColor = getSolidFill(fills as Paint[]);
        }
    }

    // Corner radius
    if ('cornerRadius' in node) {
        const cr = (node as CornerMixin).cornerRadius;
        if (typeof cr === 'number' && cr > 0) base.borderRadius = Math.round(cr);
    }

    // Opacity
    if ('opacity' in node) {
        const op = (node as BlendMixin).opacity;
        if (typeof op === 'number' && op < 1) base.opacity = Math.round(op * 100) / 100;
    }

    // Strokes → border
    if ('strokes' in node) {
        const strokes = (node as GeometryMixin).strokes as Paint[];
        const solid = strokes.find(
                (s): s is SolidPaint => s.type === 'SOLID' && s.visible !== false,
            );
        if (solid) {
            base.strokeColor = colorToHex(solid.color);
            const sw = (node as GeometryMixin).strokeWeight;
            base.strokeWeight = typeof sw === 'number' ? sw : 1;
        }
    }

    // TEXT node properties
    if (node.type === 'TEXT') {
        base.characters = node.characters;
        const size = node.getRangeFontSize(0, node.characters.length);
        if (typeof size === 'number') base.fontSize = Math.round(size);
        const weight = node.getRangeFontWeight(0, node.characters.length);
        if (typeof weight === 'number') base.fontWeight = weight;
        const font = node.getRangeFontName(0, node.characters.length);
        if (font !== figma.mixed) {
            base.fontFamily = font.family;
            base.isItalic = font.style.toLowerCase().includes('italic');
        }
        base.textAlignHorizontal =
            node.textAlignHorizontal as SerializedNode['textAlignHorizontal'];
        if (Array.isArray(node.fills)) {
            base.textColor = getSolidFill(node.fills as Paint[]);
        }
        const lh = node.getRangeLineHeight(0, node.characters.length);
        if (lh !== figma.mixed && lh.unit === 'PIXELS') base.lineHeight = Math.round(lh.value);
        const ls = node.getRangeLetterSpacing(0, node.characters.length);
        if (ls !== figma.mixed && ls.unit === 'PIXELS') base.letterSpacing = ls.value;
    }

    // Children (visible only)
    if ('children' in node) {
        base.children = (node as ChildrenMixin).children
            .filter((c) => c.visible !== false)
            .map(serialize);
    }

    return base;
}

function sendSelection(): void {
    const nodes = figma.currentPage.selection.map(serialize);
    const msg: PluginToUIMessage = { type: 'SELECTION', nodes };
    figma.ui.postMessage(msg);
}

figma.on('selectionchange', sendSelection);

figma.ui.on('message', (raw: unknown) => {
    const msg = raw as UIToPluginMessage;
    if (msg.type === 'READY') sendSelection();
    if (msg.type === 'CLOSE') figma.closePlugin();
});
