/**
 * Types for the Weblab → Figma clipboard bridge.
 *
 * `FigmaScene*` is the *input* shape — a serialized DOM subtree produced inside
 * the preview iframe by the preload bridge (`getFigmaSceneData`). The mapper in
 * `map.ts` turns it into the *output* Figma node types below, which are encoded
 * into Figma's native clipboard (Kiwi) buffer by `figma-schema.ts`.
 */

// ---------------------------------------------------------------------------
// Input: serialized DOM scene (from the preview iframe)
// ---------------------------------------------------------------------------

export interface SceneRect {
    /** x/y are relative to the captured subtree root's top-left, in CSS px. */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FigmaSceneNode {
    /** Lowercased tag name, e.g. "div", "span", "img". */
    tag: string;
    rect: SceneRect;
    /** Non-null only for text-bearing leaf nodes. */
    text: string | null;
    /** True for <img> or elements whose only paint is a background-image. */
    isImage: boolean;
    /** Subset of computed styles, camelCased keys (e.g. backgroundColor). */
    styles: Record<string, string>;
    children: FigmaSceneNode[];
}

export interface FigmaScene {
    root: FigmaSceneNode;
    /** Optional human label for the pasted top-level frame. */
    name?: string;
}

// ---------------------------------------------------------------------------
// Output: minimal Figma Kiwi node/message types we populate
// (field names MUST match the vendored Figma schema; enums are passed by name)
// ---------------------------------------------------------------------------

export interface GUID {
    sessionID: number;
    localID: number;
}

export interface Vector {
    x: number;
    y: number;
}

export interface Matrix {
    m00: number;
    m01: number;
    m02: number;
    m10: number;
    m11: number;
    m12: number;
}

export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface Paint {
    type: 'SOLID';
    color: Color;
    opacity: number;
    visible: boolean;
    blendMode: 'NORMAL';
}

export interface ParentIndex {
    guid: GUID;
    position: string;
}

export interface FontName {
    family: string;
    style: string;
    postscript: string;
}

export interface TextData {
    characters: string;
}

export interface NodeChange {
    guid: GUID;
    phase: 'CREATED';
    parentIndex: ParentIndex;
    type: 'FRAME' | 'TEXT';
    name: string;
    visible: boolean;
    opacity?: number;
    size: Vector;
    transform: Matrix;
    fillPaints?: Paint[];
    strokePaints?: Paint[];
    strokeWeight?: number;
    strokeAlign?: 'INSIDE' | 'CENTER' | 'OUTSIDE';
    cornerRadius?: number;
    rectangleTopLeftCornerRadius?: number;
    rectangleTopRightCornerRadius?: number;
    rectangleBottomRightCornerRadius?: number;
    rectangleBottomLeftCornerRadius?: number;
    rectangleCornerRadiiIndependent?: boolean;
    // Text-only
    fontSize?: number;
    fontName?: FontName;
    textData?: TextData;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
}

export interface FigmaMeta {
    fileKey: string;
    pasteID: number;
    dataType: 'scene';
}

export interface FigmaMessage {
    type: 'NODE_CHANGES';
    sessionID: number;
    ackID: number;
    pasteID: number;
    pasteFileKey: string;
    pasteIsPartiallyOutsideEnclosingFrame: boolean;
    pastePageId: GUID;
    nodeChanges: NodeChange[];
}
