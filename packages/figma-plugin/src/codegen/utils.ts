export function toComponentName(name: string): string {
    const words = name
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .split(/[\s_-]+/)
        .filter(Boolean);
    if (words.length === 0) return 'Frame';
    const result = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    return /^[0-9]/.test(result) ? `Frame${result}` : result;
}
