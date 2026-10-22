import postcss from 'postcss';
import { discoverProjectStylesheet } from './project-stylesheet-source';

// Tailwind's default screens use rem. Their pixel threshold depends on the
// browser's initial font, so exact canvas pixel scopes use arbitrary media.

/** Only plain min-width values can be shared with a min-width canvas rule. */
export function parseProjectBreakpoints(css: string): Record<string, number> {
    const root = postcss.parse(css);
    let prefixes: Record<string, number> = {};
    let configOrImportedTheme = false;
    root.walkAtRules('config', () => { configOrImportedTheme = true; });
    root.walkAtRules('import', (rule) => {
        if (!/^['"]tailwindcss(?:\/[^'"]*)?['"](?:\s|$)/.test(rule.params.trim())) configOrImportedTheme = true;
    });
    // A JS config can include raw/max/range screens. An imported stylesheet
    // can override defaults. Use exact arbitrary media instead of guessing.
    if (configOrImportedTheme) return {};
    root.walkAtRules('theme', (rule) => {
        rule.walkDecls(/^--breakpoint-/, (decl) => {
            const name = decl.prop.slice('--breakpoint-'.length);
            if (name === '*' && decl.value.trim() === 'initial') { prefixes = {}; return; }
            delete prefixes[name];
            const match = /^(\d+(?:\.\d+)?)(px)$/.exec(decl.value.trim());
            if (match?.[1] && match[2] && /^[A-Za-z0-9_-]+$/.test(name)) {
                const width = Number(match[1]);
                if (Number.isFinite(width) && width > 0) prefixes[name] = width;
            }
        });
    });
    return prefixes;
}

/**
 * Use the stylesheet imported by verified App Router documents. Token callers
 * stay closed when imported declarations have no modeled write ownership.
 */
export async function readProjectStylesheet(
    readFile: (path: string) => Promise<string | Uint8Array>,
    sourcePaths?: readonly string[],
    options: { allowImportedTheme?: boolean } = {},
): Promise<{ path: string; content: string } | null> {
    const stylesheet = await discoverProjectStylesheet(readFile, sourcePaths);
    if (!stylesheet?.hasTailwindImport || stylesheet.hasImportedStylesheets && !options.allowImportedTheme) return null;
    return { path: stylesheet.path, content: stylesheet.content };
}

export async function readProjectBreakpoints(
    readFile: (path: string) => Promise<string | Uint8Array>,
    sourcePaths?: readonly string[],
): Promise<Record<string, number>> {
    const stylesheet = await readProjectStylesheet(readFile, sourcePaths, { allowImportedTheme: true });
    return stylesheet ? parseProjectBreakpoints(stylesheet.content) : {};
}

/** The smallest frame is the base. Every other frame retains its exact scope. */
export function breakpointMinWidth(width: number, baseWidth: number | null): number {
    if (!Number.isFinite(width) || width < 0) throw new Error('This breakpoint width is invalid.');
    return baseWidth !== null && width <= baseWidth ? 0 : Math.round(width);
}
