import type { SerializedNode } from './types';

function twPadding(t?: number, r?: number, b?: number, l?: number): string {
    if (t === undefined) return '';
    if (t === r && t === b && t === l) return t === 0 ? '' : `p-[${t}px]`;
    if (t === b && r === l) {
        const parts: string[] = [];
        if (t) parts.push(`py-[${t}px]`);
        if (r) parts.push(`px-[${r}px]`);
        return parts.join(' ');
    }
    const parts: string[] = [];
    if (t) parts.push(`pt-[${t}px]`);
    if (r) parts.push(`pr-[${r}px]`);
    if (b) parts.push(`pb-[${b}px]`);
    if (l) parts.push(`pl-[${l}px]`);
    return parts.join(' ');
}

function primaryAxisToJustify(align?: string): string {
    switch (align) {
        case 'CENTER':
            return 'justify-center';
        case 'MAX':
            return 'justify-end';
        case 'SPACE_BETWEEN':
            return 'justify-between';
        default:
            return 'justify-start';
    }
}

function counterAxisToItems(align?: string): string {
    switch (align) {
        case 'CENTER':
            return 'items-center';
        case 'MAX':
            return 'items-end';
        case 'BASELINE':
            return 'items-baseline';
        default:
            return 'items-start';
    }
}

function fontWeightToTw(weight?: number): string {
    if (!weight) return '';
    if (weight <= 100) return 'font-thin';
    if (weight <= 200) return 'font-extralight';
    if (weight <= 300) return 'font-light';
    if (weight <= 400) return 'font-normal';
    if (weight <= 500) return 'font-medium';
    if (weight <= 600) return 'font-semibold';
    if (weight <= 700) return 'font-bold';
    if (weight <= 800) return 'font-extrabold';
    return 'font-black';
}

function textAlignToTw(align?: string): string {
    switch (align) {
        case 'CENTER':
            return 'text-center';
        case 'RIGHT':
            return 'text-right';
        case 'JUSTIFIED':
            return 'text-justify';
        default:
            return '';
    }
}

export function buildTailwindClasses(node: SerializedNode): string {
    const classes: string[] = [];

    classes.push(`w-[${node.width}px]`);
    classes.push(`h-[${node.height}px]`);

    if (node.layoutMode && node.layoutMode !== 'NONE') {
        classes.push('flex');
        classes.push(node.layoutMode === 'HORIZONTAL' ? 'flex-row' : 'flex-col');
        classes.push(primaryAxisToJustify(node.primaryAxisAlignItems));
        classes.push(counterAxisToItems(node.counterAxisAlignItems));
        if (node.itemSpacing) classes.push(`gap-[${node.itemSpacing}px]`);
        const padding = twPadding(
            node.paddingTop,
            node.paddingRight,
            node.paddingBottom,
            node.paddingLeft,
        );
        if (padding) classes.push(padding);
    }

    if (node.backgroundColor) classes.push(`bg-[${node.backgroundColor}]`);
    if (node.borderRadius) classes.push(`rounded-[${node.borderRadius}px]`);
    if (node.opacity !== undefined) classes.push(`opacity-[${node.opacity}]`);
    if (node.strokeColor && node.strokeWeight) {
        classes.push(`border border-[${node.strokeColor}]`);
        if (node.strokeWeight !== 1) classes.push(`border-[${node.strokeWeight}px]`);
    }

    if (node.type === 'TEXT') {
        if (node.textColor) classes.push(`text-[${node.textColor}]`);
        if (node.fontSize) classes.push(`text-[${node.fontSize}px]`);
        const fw = fontWeightToTw(node.fontWeight);
        if (fw) classes.push(fw);
        if (node.fontFamily) {
            classes.push(`font-['${node.fontFamily.replace(/\s+/g, '_')}']`);
        }
        const ta = textAlignToTw(node.textAlignHorizontal);
        if (ta) classes.push(ta);
        if (node.lineHeight) classes.push(`leading-[${node.lineHeight}px]`);
        if (node.letterSpacing) classes.push(`tracking-[${node.letterSpacing}px]`);
        if (node.isItalic) classes.push('italic');
    }

    return classes.filter(Boolean).join(' ');
}
