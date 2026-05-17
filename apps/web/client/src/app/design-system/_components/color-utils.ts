/**
 * Normalise a raw CSS token value to a 6-digit lowercase hex string.
 * Tokens are stored as hex (#rrggbb) since the HSL-triplet format was
 * deprecated. This function accepts hex as a passthrough and, for any
 * legacy HSL string still lurking in overrides, converts it on the fly
 * so callers never need to branch.
 */
export function tokenToHex(value: string): string {
    const v = value.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
    // Legacy HSL triplet: "H S% L%"
    try {
        const parts = v
            .replace(/%/g, '')
            .split(/[\s,]+/)
            .map(Number);
        if (parts.length < 3 || parts.some(isNaN)) return '#888888';
        const [h = 0, s = 50, l = 50] = parts;
        const sl = s / 100;
        const ll = l / 100;
        const a = sl * Math.min(ll, 1 - ll);
        const f = (n: number) => {
            const k = (n + h / 30) % 12;
            const c = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * c)
                .toString(16)
                .padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    } catch {
        return '#888888';
    }
}

/** @deprecated Tokens now store hex directly. Use `tokenToHex` instead. */
export function hslToHex(hsl: string): string {
    return tokenToHex(hsl);
}
