export type NodeType =
    | 'FRAME'
    | 'GROUP'
    | 'COMPONENT'
    | 'INSTANCE'
    | 'TEXT'
    | 'RECTANGLE'
    | 'ELLIPSE'
    | 'VECTOR'
    | 'BOOLEAN_OPERATION'
    | 'UNKNOWN';

export interface SerializedNode {
    type: NodeType;
    name: string;
    width: number;
    height: number;
    // Auto-layout
    layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
    primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    itemSpacing?: number;
    // Appearance
    backgroundColor?: string; // CSS hex e.g. "#f0f0f0"
    borderRadius?: number;
    opacity?: number;
    // Stroke → border
    strokeColor?: string;
    strokeWeight?: number;
    // Text-specific (present when type === 'TEXT')
    characters?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textColor?: string;
    lineHeight?: number;
    letterSpacing?: number;
    isItalic?: boolean;
    // Tree
    children?: SerializedNode[];
}

export type Framework = 'react' | 'html';
export type StyleMode = 'tailwind' | 'inline' | 'css-modules';

export interface CodegenOptions {
    framework: Framework;
    styleMode: StyleMode;
}
