import type { SerializedNode, CodegenOptions } from './types';
import { buildInlineStyles } from './inline';

// These CSS properties take unitless numbers — do NOT append "px"
const PX_EXEMPT = new Set([
    'opacity',
    'fontWeight',
    'flex',
    'flexGrow',
    'flexShrink',
    'zIndex',
]);

function styleToCSS(styles: Record<string, string | number>): string {
    return Object.entries(styles)
        .map(([k, v]) => {
            const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            const val =
                typeof v === 'number' && !PX_EXEMPT.has(k) ? `${v}px` : String(v);
            return `${prop}: ${val}`;
        })
        .join('; ');
}

function getElement(node: SerializedNode): string {
    if (node.type === 'TEXT') {
        const size = node.fontSize ?? 16;
        if (size >= 32) return 'h1';
        if (size >= 24) return 'h2';
        if (size >= 20) return 'h3';
        return 'p';
    }
    return 'div';
}

function ind(depth: number): string {
    return '  '.repeat(depth);
}

function renderNode(node: SerializedNode, depth: number): string {
    const tag = getElement(node);
    const i = ind(depth);

    const styles = buildInlineStyles(node);
    const styleAttr =
        Object.keys(styles).length > 0 ? ` style="${styleToCSS(styles)}"` : '';

    if (node.type === 'TEXT') {
        return `${i}<${tag}${styleAttr}>${node.characters ?? ''}</${tag}>`;
    }

    if (!node.children || node.children.length === 0) {
        return `${i}<${tag}${styleAttr}></${tag}>`;
    }

    const children = node.children.map((c) => renderNode(c, depth + 1)).join('\n');
    return `${i}<${tag}${styleAttr}>\n${children}\n${i}</${tag}>`;
}

export function generateHTML(nodes: SerializedNode[], _options: CodegenOptions): string {
    if (nodes.length === 0) {
        return '<!-- No selection — select a frame in Figma -->';
    }
    return nodes.map((node) => renderNode(node, 0)).join('\n\n');
}
