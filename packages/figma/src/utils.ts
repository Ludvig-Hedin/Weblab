import type { FigmaColor } from './types';

export function extractFigmaFileKey(url: string): string | null {
    try {
        const parsed = new URL(url.trim());
        if (parsed.hostname !== 'www.figma.com' && parsed.hostname !== 'figma.com') {
            return null;
        }
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        if (parts[0] !== 'file' && parts[0] !== 'design') return null;
        const key = parts[1];
        if (!key || key.length < 4) return null;
        return key;
    } catch {
        return null;
    }
}

export function figmaColorToHex(color: Pick<FigmaColor, 'r' | 'g' | 'b'>): string {
    const toHex = (n: number) =>
        Math.round(Math.max(0, Math.min(1, n)) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function toComponentName(frameName: string): string {
    const words = frameName
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .split(/[\s_-]+/)
        .filter(Boolean);
    if (words.length === 0) return 'Frame';
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
