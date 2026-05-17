import type { NumericValue } from './types';

interface Composite {
    tx?: NumericValue;
    ty?: NumericValue;
    tz?: NumericValue;
    sx?: number;
    sy?: number;
    rz?: NumericValue;
    opacity?: number;
    width?: NumericValue;
    height?: NumericValue;
    bgColor?: string;
}

const COMPOSITES = new WeakMap<HTMLElement, Composite>();

function unitStr(v: NumericValue, fallback = 'px'): string {
    const unit = v.unit === 'none' ? '' : v.unit || fallback;
    return `${v.value}${unit}`;
}

export function getComposite(el: HTMLElement): Composite {
    let c = COMPOSITES.get(el);
    if (!c) {
        c = {};
        COMPOSITES.set(el, c);
    }
    return c;
}

export function clearComposite(el: HTMLElement): void {
    COMPOSITES.delete(el);
}

export function snapshotComposite(el: HTMLElement): Composite {
    return { ...getComposite(el) };
}

export function applyComposite(el: HTMLElement, c: Composite): void {
    COMPOSITES.set(el, c);

    const transforms: string[] = [];
    if (c.tx || c.ty || c.tz) {
        const tx = c.tx ? unitStr(c.tx, 'px') : '0px';
        const ty = c.ty ? unitStr(c.ty, 'px') : '0px';
        const tz = c.tz ? unitStr(c.tz, 'px') : '0px';
        transforms.push(`translate3d(${tx}, ${ty}, ${tz})`);
    }
    if (c.sx != null || c.sy != null) {
        const sx = c.sx ?? 1;
        const sy = c.sy ?? sx;
        transforms.push(`scale(${sx}, ${sy})`);
    }
    if (c.rz) {
        const unit = c.rz.unit === 'none' ? 'deg' : c.rz.unit;
        transforms.push(`rotate(${c.rz.value}${unit})`);
    }
    if (transforms.length > 0) {
        el.style.transform = transforms.join(' ');
    } else {
        el.style.removeProperty('transform');
    }

    if (c.opacity != null) {
        el.style.opacity = String(c.opacity);
    }
    if (c.width) {
        el.style.width = unitStr(c.width, 'px');
    }
    if (c.height) {
        el.style.height = unitStr(c.height, 'px');
    }
    if (c.bgColor != null) {
        el.style.backgroundColor = c.bgColor;
    }
}

export function resetElementStyles(el: HTMLElement): void {
    const c = COMPOSITES.get(el);
    if (!c) return;
    el.style.removeProperty('transform');
    el.style.removeProperty('opacity');
    el.style.removeProperty('width');
    el.style.removeProperty('height');
    el.style.removeProperty('background-color');
    COMPOSITES.delete(el);
}

export type { Composite };
