import { describe, expect, test } from 'bun:test';

import type { FigmaScene } from '../src';
import { buildFigmaClipboardHtml, decodeFigmaClipboardHtml } from '../src';

function scene(): FigmaScene {
    return {
        name: 'Card',
        root: {
            tag: 'div',
            rect: { x: 0, y: 0, width: 200, height: 120 },
            text: null,
            isImage: false,
            styles: {
                backgroundColor: 'rgb(255, 0, 0)',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                borderBottomRightRadius: '12px',
                borderBottomLeftRadius: '12px',
            },
            children: [
                {
                    tag: 'span',
                    rect: { x: 16, y: 16, width: 120, height: 24 },
                    text: 'Hello',
                    isImage: false,
                    styles: {
                        color: 'rgb(0, 0, 0)',
                        fontSize: '16px',
                        fontWeight: '700',
                        fontFamily: '"Inter", sans-serif',
                        textAlign: 'center',
                    },
                    children: [],
                },
                {
                    tag: 'div',
                    rect: { x: 16, y: 56, width: 50, height: 50 },
                    text: null,
                    isImage: false,
                    styles: { backgroundColor: 'rgb(0, 0, 255)', borderTopLeftRadius: '8px' },
                    children: [],
                },
            ],
        },
    };
}

describe('buildFigmaClipboardHtml', () => {
    test('produces a Figma clipboard HTML envelope with both markers', () => {
        const html = buildFigmaClipboardHtml(scene(), { pasteID: 123456 });
        expect(html).toContain('<!--(figmeta)');
        expect(html).toContain('(/figmeta)-->');
        expect(html).toContain('<!--(figma)');
        expect(html).toContain('(/figma)-->');
        expect(html).toContain('data-buffer=');
    });

    test('round-trips through the Figma Kiwi schema with correct node tree', () => {
        const html = buildFigmaClipboardHtml(scene(), { pasteID: 123456 });
        const { meta, message } = decodeFigmaClipboardHtml(html);

        expect(meta.dataType).toBe('scene');
        expect(meta.pasteID).toBe(123456);
        expect(message.type).toBe('NODE_CHANGES');
        expect(message.pasteID).toBe(123456);
        expect(message.pastePageId).toEqual({ sessionID: 0, localID: 1 });
        expect(message.nodeChanges).toHaveLength(3);

        const [root, text, box] = message.nodeChanges;

        // Root frame: name override, size, uniform corner radius, red fill.
        expect(root!.type).toBe('FRAME');
        expect(root!.name).toBe('Card');
        expect(root!.size).toEqual({ x: 200, y: 120 });
        expect(root!.cornerRadius).toBe(12);
        const rootFill = root!.fillPaints![0]!;
        expect(rootFill.type).toBe('SOLID');
        expect(rootFill.color.r).toBeCloseTo(1, 5);
        expect(rootFill.color.g).toBeCloseTo(0, 5);
        expect(rootFill.color.b).toBeCloseTo(0, 5);

        // Text node: characters, font, position relative to the parent.
        expect(text!.type).toBe('TEXT');
        expect(text!.textData!.characters).toBe('Hello');
        expect(text!.fontSize).toBe(16);
        expect(text!.fontName!.style).toBe('Bold');
        expect(text!.textAlignHorizontal).toBe('CENTER');
        expect(text!.transform.m02).toBe(16);
        expect(text!.transform.m12).toBe(16);

        // Box: blue fill, single non-uniform corner radius flagged independent.
        expect(box!.type).toBe('FRAME');
        expect(box!.rectangleCornerRadiiIndependent).toBe(true);
        expect(box!.rectangleTopLeftCornerRadius).toBe(8);
        const boxFill = box!.fillPaints![0]!;
        expect(boxFill.color.b).toBeCloseTo(1, 5);

        // Sibling ordering: text precedes box lexicographically.
        expect(text!.parentIndex.position < box!.parentIndex.position).toBe(true);
        // Both children parent to the root.
        expect(text!.parentIndex.guid).toEqual(root!.guid);
        expect(box!.parentIndex.guid).toEqual(root!.guid);
    });

    test('skips zero-size and hidden nodes', () => {
        const s: FigmaScene = {
            root: {
                tag: 'div',
                rect: { x: 0, y: 0, width: 100, height: 100 },
                text: null,
                isImage: false,
                styles: {},
                children: [
                    {
                        tag: 'div',
                        rect: { x: 0, y: 0, width: 0, height: 0 },
                        text: null,
                        isImage: false,
                        styles: {},
                        children: [],
                    },
                    {
                        tag: 'div',
                        rect: { x: 0, y: 0, width: 10, height: 10 },
                        text: null,
                        isImage: false,
                        styles: { display: 'none' },
                        children: [],
                    },
                ],
            },
        };
        const { message } = decodeFigmaClipboardHtml(buildFigmaClipboardHtml(s, { pasteID: 1 }));
        expect(message.nodeChanges).toHaveLength(1);
    });
});
