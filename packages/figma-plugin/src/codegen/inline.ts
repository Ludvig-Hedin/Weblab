import type { SerializedNode } from './types';

function primaryAxisToJustify(align?: string): string {
    switch (align) {
        case 'CENTER':
            return 'center';
        case 'MAX':
            return 'flex-end';
        case 'SPACE_BETWEEN':
            return 'space-between';
        default:
            return 'flex-start';
    }
}

function counterAxisToAlign(align?: string): string {
    switch (align) {
        case 'CENTER':
            return 'center';
        case 'MAX':
            return 'flex-end';
        case 'BASELINE':
            return 'baseline';
        default:
            return 'flex-start';
    }
}

function textAlignToCSS(align?: string): string {
    switch (align) {
        case 'CENTER':
            return 'center';
        case 'RIGHT':
            return 'right';
        case 'JUSTIFIED':
            return 'justify';
        default:
            return 'left';
    }
}

export function buildInlineStyles(node: SerializedNode): Record<string, string | number> {
    const styles: Record<string, string | number> = {
        width: node.width,
        height: node.height,
    };

    if (node.layoutMode && node.layoutMode !== 'NONE') {
        styles['display'] = 'flex';
        styles['flexDirection'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
        styles['justifyContent'] = primaryAxisToJustify(node.primaryAxisAlignItems);
        styles['alignItems'] = counterAxisToAlign(node.counterAxisAlignItems);
        if (node.itemSpacing) styles['gap'] = node.itemSpacing;
        if (node.paddingTop) styles['paddingTop'] = node.paddingTop;
        if (node.paddingRight) styles['paddingRight'] = node.paddingRight;
        if (node.paddingBottom) styles['paddingBottom'] = node.paddingBottom;
        if (node.paddingLeft) styles['paddingLeft'] = node.paddingLeft;
    }

    if (node.backgroundColor) styles['backgroundColor'] = node.backgroundColor;
    if (node.borderRadius) styles['borderRadius'] = node.borderRadius;
    if (node.opacity !== undefined) styles['opacity'] = node.opacity;
    if (node.strokeColor && node.strokeWeight) {
        styles['border'] = `${node.strokeWeight}px solid ${node.strokeColor}`;
    }

    if (node.type === 'TEXT') {
        if (node.textColor) styles['color'] = node.textColor;
        if (node.fontSize) styles['fontSize'] = node.fontSize;
        if (node.fontWeight) styles['fontWeight'] = node.fontWeight;
        if (node.fontFamily) styles['fontFamily'] = node.fontFamily;
        if (node.textAlignHorizontal)
            styles['textAlign'] = textAlignToCSS(node.textAlignHorizontal);
        if (node.lineHeight) styles['lineHeight'] = `${node.lineHeight}px`;
        if (node.letterSpacing) styles['letterSpacing'] = `${node.letterSpacing}px`;
        if (node.isItalic) styles['fontStyle'] = 'italic';
    }

    return styles;
}

/** Formats a style object as a React inline style JSX expression: {{ key: value }} */
export function styleToReactInline(styles: Record<string, string | number>): string {
    const entries = Object.entries(styles)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : v}`)
        .join(', ');
    return `{{ ${entries} }}`;
}
