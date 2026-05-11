export function hslToHex(hsl: string): string {
    try {
        const parts = hsl
            .trim()
            .split(/[\s,]+/)
            .map(Number);
        if (parts.length < 3 || parts.some(isNaN)) return '#888888';
        const [h, s, l] = parts;
        const sl = (s ?? 50) / 100;
        const ll = (l ?? 50) / 100;
        const a = sl * Math.min(ll, 1 - ll);
        const f = (n: number) => {
            const k = (n + (h ?? 0) / 30) % 12;
            const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color)
                .toString(16)
                .padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    } catch {
        return '#888888';
    }
}

export function hexToHsl(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0 0% 50%';
    const r = parseInt(result[1]!, 16) / 255;
    const g = parseInt(result[2]!, 16) / 255;
    const b = parseInt(result[3]!, 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
