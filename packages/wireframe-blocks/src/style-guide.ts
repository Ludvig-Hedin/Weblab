/**
 * Style-guide token model + helpers, shared by the live preview (client) and the
 * code emitter (Convex/local). React-free. The tokens override the shadcn CSS-var
 * contract baked into every Weblab project (see component-registry/theme).
 */

export interface StyleGuideTokens {
    background?: string;
    foreground?: string;
    primary?: string;
    primaryForeground?: string;
    secondary?: string;
    secondaryForeground?: string;
    muted?: string;
    mutedForeground?: string;
    accent?: string;
    border?: string;
    ring?: string;
    brandAccent?: string;
    radius?: string;
    fontHeading?: string;
    fontBody?: string;
}

const VAR_MAP: Array<[keyof StyleGuideTokens, string]> = [
    ['background', '--background'],
    ['foreground', '--foreground'],
    ['primary', '--primary'],
    ['primaryForeground', '--primary-foreground'],
    ['secondary', '--secondary'],
    ['secondaryForeground', '--secondary-foreground'],
    ['muted', '--muted'],
    ['mutedForeground', '--muted-foreground'],
    ['accent', '--accent'],
    ['border', '--border'],
    ['ring', '--ring'],
    ['brandAccent', '--brand-accent'],
    ['radius', '--radius'],
];

/** Narrow unknown JSON (stored as `v.any()`) into the token shape. */
export function asStyleGuideTokens(value: unknown): StyleGuideTokens {
    if (!value || typeof value !== 'object') return {};
    const v = value as Record<string, unknown>;
    const out: StyleGuideTokens = {};
    for (const [key] of VAR_MAP) {
        const raw = v[key];
        if (typeof raw === 'string') out[key] = raw;
    }
    if (typeof v.fontHeading === 'string') out.fontHeading = v.fontHeading;
    if (typeof v.fontBody === 'string') out.fontBody = v.fontBody;
    return out;
}

function cssFontStack(name: string): string {
    return `'${name.replace(/['\\]/g, '')}', system-ui, sans-serif`;
}

/**
 * CSS custom-property overrides for the live preview, applied as an inline style
 * on a wrapper. Token vars cascade to `bg-background` / `text-foreground` /
 * `rounded-*` utilities (which resolve `var(--…)` lazily at the point of use).
 */
export function styleGuideToCssVars(tokens: StyleGuideTokens): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, cssVar] of VAR_MAP) {
        const val = tokens[key];
        if (typeof val === 'string' && val.trim()) out[cssVar] = val;
    }
    if (tokens.fontBody) out.fontFamily = cssFontStack(tokens.fontBody);
    return out;
}

/**
 * A CSS fragment appended after the base globals.css in an emitted project. Later
 * rules win, so a trailing `:root { … }` overrides the scaffold's token values
 * without parsing the original file.
 */
export function styleGuideToGlobalsAppend(tokens: StyleGuideTokens): string {
    const decls = VAR_MAP.map(([key, cssVar]) => {
        const val = tokens[key];
        return typeof val === 'string' && val.trim() ? `    ${cssVar}: ${val};` : null;
    }).filter((l): l is string => l !== null);

    const parts: string[] = [];
    if (decls.length > 0) parts.push(`:root {\n${decls.join('\n')}\n}`);

    const fontRules: string[] = [];
    if (tokens.fontBody) fontRules.push(`body { font-family: ${cssFontStack(tokens.fontBody)}; }`);
    if (tokens.fontHeading) {
        fontRules.push(`h1, h2, h3, h4 { font-family: ${cssFontStack(tokens.fontHeading)}; }`);
    }
    if (fontRules.length > 0) parts.push(fontRules.join('\n'));

    return parts.length > 0 ? `\n/* Wireframe style guide overrides */\n${parts.join('\n')}\n` : '';
}
