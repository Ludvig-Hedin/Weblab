export interface FigmaColor {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export interface FigmaAbsoluteBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FigmaNode {
    id: string;
    name: string;
    type: string;
    absoluteBoundingBox?: FigmaAbsoluteBoundingBox;
    backgroundColor?: FigmaColor;
    fills?: Array<{ type: string; color?: FigmaColor; opacity?: number }>;
    children?: FigmaNode[];
}

export interface FigmaPage {
    id: string;
    name: string;
    type: 'CANVAS';
    children: FigmaNode[];
}

export interface FigmaDocument {
    id: string;
    name: string;
    type: 'DOCUMENT';
    children: FigmaPage[];
}

export interface FigmaFileResponse {
    name: string;
    document: FigmaDocument;
}

export interface FigmaTopLevelFrame {
    id: string;
    name: string;
    width: number;
    height: number;
    backgroundColor: string; // CSS hex e.g. "#f0f0f0"
}
