import type { Color } from './types';

/**
 * Parse a CSS computed color (rgb/rgba/hex/transparent) into a Figma Color with
 * channels normalized to 0..1. Returns null for transparent / unparseable input.
 */
export function parseCssColor(input: string | undefined): Color | null {
    if (!input) return null;
    const value = input.trim().toLowerCase();
    if (value === 'transparent' || value === 'none') return null;

    // rgb(a) — the form getComputedStyle almost always returns.
    const rgb =
        /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(
            value,
        );
    if (rgb) {
        const r = clamp01(Number(rgb[1]) / 255);
        const g = clamp01(Number(rgb[2]) / 255);
        const b = clamp01(Number(rgb[3]) / 255);
        const a = rgb[4] == null ? 1 : parseAlpha(rgb[4]);
        if (a === 0) return null;
        return { r, g, b, a };
    }

    // #rgb / #rgba / #rrggbb / #rrggbbaa
    if (value.startsWith('#')) return parseHex(value);

    return null;
}

function parseHex(hex: string): Color | null {
    let h = hex.slice(1);
    if (h.length === 3 || h.length === 4) {
        h = h
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (h.length !== 6 && h.length !== 8) return null;
    const r = clamp01(parseInt(h.slice(0, 2), 16) / 255);
    const g = clamp01(parseInt(h.slice(2, 4), 16) / 255);
    const b = clamp01(parseInt(h.slice(4, 6), 16) / 255);
    const a = h.length === 8 ? clamp01(parseInt(h.slice(6, 8), 16) / 255) : 1;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || a === 0) return null;
    return { r, g, b, a };
}

function parseAlpha(token: string): number {
    if (token.endsWith('%')) return clamp01(Number(token.slice(0, -1)) / 100);
    return clamp01(Number(token));
}

function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
}
