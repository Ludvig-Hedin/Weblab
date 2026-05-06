import type { SerializedNode, CodegenOptions } from './types';
import { buildTailwindClasses } from './tailwind';
import { buildInlineStyles, styleToReactInline } from './inline';
import { toComponentName } from './utils';

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

function renderNode(node: SerializedNode, options: CodegenOptions, depth: number): string {
    const tag = getElement(node);
    const i = ind(depth);
    const i1 = ind(depth + 1);

    let attrs = '';
    if (options.styleMode === 'tailwind') {
        const classes = buildTailwindClasses(node);
        if (classes) attrs = ` className="${classes}"`;
    } else if (options.styleMode === 'inline') {
        const styles = buildInlineStyles(node);
        if (Object.keys(styles).length > 0) attrs = ` style=${styleToReactInline(styles)}`;
    } else {
        // css-modules
        const safeName = node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        attrs = ` className={styles['${safeName}']}`;
    }

    if (node.type === 'TEXT') {
        const text = (node.characters ?? '')
            .replace(/\n/g, `\n${i1}`)
            .replace(/[{}<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;', '&': '&amp;' }[c] ?? c));
        return `${i}<${tag}${attrs}>${text}</${tag}>`;
    }

    if (!node.children || node.children.length === 0) {
        return `${i}<${tag}${attrs} />`;
    }

    const children = node.children
        .map((child) => renderNode(child, options, depth + 1))
        .join('\n');

    return `${i}<${tag}${attrs}>\n${children}\n${i}</${tag}>`;
}

export function generateReact(nodes: SerializedNode[], options: CodegenOptions): string {
    if (nodes.length === 0) {
        return '// No selection — select a frame in Figma';
    }

    const lines: string[] = [];

    if (options.styleMode === 'css-modules') {
        lines.push("import styles from './styles.module.css';", '');
    }

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        const name = toComponentName(node.name) || `Component${i + 1}`;
        const body = renderNode(node, options, 2);
        lines.push(`export function ${name}() {`);
        lines.push('  return (');
        lines.push(body);
        lines.push('  );');
        lines.push('}');
        if (i < nodes.length - 1) lines.push('');
    }

    return lines.join('\n');
}
