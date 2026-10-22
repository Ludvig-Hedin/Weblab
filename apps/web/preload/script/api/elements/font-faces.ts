import type { EditTextFontFace } from '@weblab/models';

/**
 * The inline text editor is drawn in the editor window, not in this frame, so
 * it cannot see the site's own @font-face fonts (custom/self-hosted fonts,
 * next/font). These helpers ship the element's exact computed typography and
 * the font files it uses, so the editor renders the text identically.
 */

const TYPOGRAPHY_PROPERTIES = [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-stretch',
    'font-variant',
    'font-feature-settings',
    'font-variation-settings',
    'font-kerning',
    'font-optical-sizing',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'text-transform',
    'text-align',
    'text-indent',
    'text-decoration',
    'text-shadow',
    'color',
    'white-space',
];

const MAX_FACES = 12;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

const sourceCache = new Map<string, Promise<string | null>>();

function toCamelCase(property: string): string {
    return property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function getEditingTypography(el: HTMLElement): Record<string, string> {
    const computed = window.getComputedStyle(el);
    const typography: Record<string, string> = {};
    for (const property of TYPOGRAPHY_PROPERTIES) {
        typography[toCamelCase(property)] = computed.getPropertyValue(property);
    }
    return typography;
}

function normalizeFamily(family: string): string {
    return family
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .trim()
        .toLowerCase();
}

function collectFontFaceRules(): CSSFontFaceRule[] {
    const rules: CSSFontFaceRule[] = [];
    const visit = (list: CSSRuleList | undefined) => {
        if (!list) {
            return;
        }
        for (const rule of Array.from(list)) {
            if (rule instanceof CSSFontFaceRule) {
                rules.push(rule);
            } else if (rule instanceof CSSImportRule) {
                visitSheet(rule.styleSheet);
            } else if ('cssRules' in rule) {
                visit((rule as CSSGroupingRule).cssRules);
            }
        }
    };
    const visitSheet = (sheet: CSSStyleSheet | null) => {
        if (!sheet) {
            return;
        }
        try {
            visit(sheet.cssRules);
        } catch {
            // Cross-origin stylesheet: its rules are unreadable.
        }
    };
    for (const sheet of Array.from(document.styleSheets)) {
        visitSheet(sheet);
    }
    return rules;
}

/** Pick the best url() from an @font-face `src` list (woff2 > woff > other). */
export function pickFontUrl(src: string): string | null {
    const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/g;
    const candidates: { url: string; format: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(src))) {
        if (match[2]) {
            candidates.push({ url: match[2], format: (match[3] ?? '').toLowerCase() });
        }
    }
    const rank = (format: string) =>
        format === 'woff2' ? 0 : format === 'woff' ? 1 : format === '' ? 2 : format === 'svg' ? 9 : 3;
    candidates.sort((a, b) => rank(a.format) - rank(b.format));
    return candidates[0]?.url ?? null;
}

function readAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function loadSource(url: string): Promise<string | null> {
    if (url.startsWith('data:')) {
        return Promise.resolve(url);
    }
    let pending = sourceCache.get(url);
    if (!pending) {
        pending = fetch(url)
            .then(async (res) => (res.ok ? readAsDataUrl(await res.blob()) : null))
            .catch(() => null);
        sourceCache.set(url, pending);
    }
    return pending;
}

export async function collectEditingFontFaces(el: HTMLElement): Promise<EditTextFontFace[]> {
    try {
        const families = new Set(
            window.getComputedStyle(el).fontFamily.split(',').map(normalizeFamily).filter(Boolean),
        );
        const faces: EditTextFontFace[] = [];
        let totalBytes = 0;
        for (const rule of collectFontFaceRules()) {
            if (faces.length >= MAX_FACES) {
                break;
            }
            const family = rule.style.getPropertyValue('font-family');
            if (!families.has(normalizeFamily(family))) {
                continue;
            }
            const url = pickFontUrl(rule.style.getPropertyValue('src'));
            if (!url) {
                continue;
            }
            const base = rule.parentStyleSheet?.href ?? document.baseURI;
            const absolute = url.startsWith('data:') ? url : new URL(url, base).href;
            const source = await loadSource(absolute);
            if (!source || totalBytes + source.length > MAX_TOTAL_BYTES) {
                continue;
            }
            totalBytes += source.length;
            const descriptors = {
                weight: rule.style.getPropertyValue('font-weight') || undefined,
                style: rule.style.getPropertyValue('font-style') || undefined,
                stretch: rule.style.getPropertyValue('font-stretch') || undefined,
                unicodeRange: rule.style.getPropertyValue('unicode-range') || undefined,
            };
            faces.push({
                key: [normalizeFamily(family), absolute.slice(0, 200), descriptors.weight, descriptors.style]
                    .join('|'),
                family: family.trim().replace(/^['"]|['"]$/g, ''),
                source,
                descriptors,
            });
        }
        return faces;
    } catch (error) {
        console.warn('Collecting fonts for text editing failed', error);
        return [];
    }
}
