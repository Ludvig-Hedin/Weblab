import type { AtRule, Declaration, Root, Rule } from 'postcss';
import postcss from 'postcss';

import type {
    ColorStyle,
    ColorStyleRef,
    TextStyle,
    TokensSnapshot,
    VariableGroup,
    VariableToken,
} from '@weblab/models/style';

const VAR_PREFIX = /^--/;
const TEXT_STYLE_PREFIX = 'text-style-';

const GROUP_PREFIXES: Array<{ prefix: string; group: VariableGroup }> = [
    { prefix: 'color-', group: 'color' },
    { prefix: 'space-', group: 'space' },
    { prefix: 'spacing-', group: 'space' },
    { prefix: 'font-', group: 'font' },
    { prefix: 'text-', group: 'font' },
    { prefix: 'leading-', group: 'font' },
    { prefix: 'tracking-', group: 'font' },
    { prefix: 'radius-', group: 'radius' },
    { prefix: 'rounded-', group: 'radius' },
    { prefix: 'shadow-', group: 'shadow' },
];

function inferGroup(name: string): VariableGroup {
    for (const { prefix, group } of GROUP_PREFIXES) {
        if (name.startsWith(prefix)) return group;
    }
    return 'other';
}

function inferDisplayName(name: string): string {
    // "color-brand-primary" → "Color/Brand Primary"
    const parts = name.split('-');
    if (parts.length === 0) return name;
    const head = parts[0]!;
    const tail = parts.slice(1).join(' ');
    const cap = (s: string) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : s);
    if (!tail) return cap(head);
    return `${cap(head)}/${tail.split(' ').map(cap).join(' ')}`;
}

interface ThemeBlockEntry {
    value: string;
    line?: number;
}

interface CssScanResult {
    themeBlock: Record<string, ThemeBlockEntry>;
    rootBlock: Record<string, ThemeBlockEntry>;
    darkBlock: Record<string, ThemeBlockEntry>;
    textStyles: Array<{ name: string; applyClasses: string[]; line?: number }>;
    hasThemeBlock: boolean;
    hasRootBlock: boolean;
    hasDarkBlock: boolean;
    compatibilityAliases: Record<string, string>;
}

const COMPATIBILITY_ALIAS_MARKER = 'weblab-compat-alias';

/**
 * Walk a `globals.css` file and extract:
 *  - declarations inside `@theme { ... }`
 *  - declarations inside `:root { ... }`
 *  - declarations inside `.dark { ... }`
 *  - `@utility text-style-*` blocks (with their `@apply` class list)
 */
export function parseTokensFromGlobalsCss(cssContent: string): CssScanResult {
    const result: CssScanResult = {
        themeBlock: {},
        rootBlock: {},
        darkBlock: {},
        textStyles: [],
        hasThemeBlock: false,
        hasRootBlock: false,
        hasDarkBlock: false,
        compatibilityAliases: {},
    };

    let root: Root;
    try {
        root = postcss.parse(cssContent);
    } catch (error) {
        console.error('parseTokensFromGlobalsCss: failed to parse css', error);
        return result;
    }

    root.walkDecls(VAR_PREFIX, (decl) => {
        const marker = decl.prev();
        if (marker?.type !== 'comment') return;
        const match = /^weblab-compat-alias --([\w-]+) -> --([\w-]+)( inline)?$/.exec(marker.text.trim());
        let targetValue: string | undefined;
        decl.parent?.walkDecls(`--${match?.[2] ?? ''}`, (target) => { targetValue = target.value; });
        if (match?.[1] && match[2] && decl.prop === `--${match[1]}` &&
            (match[3] ? targetValue === decl.value : decl.value.trim() === `var(--${match[2]})`)) {
            result.compatibilityAliases[match[1]] = match[2];
        }
    });

    root.walkAtRules('theme', (atRule: AtRule) => {
        result.hasThemeBlock = true;
        atRule.walkDecls(VAR_PREFIX, (decl: Declaration) => {
            result.themeBlock[decl.prop.slice(2)] = {
                value: decl.value,
                line: decl.source?.start?.line,
            };
        });
    });

    root.walkRules((rule: Rule) => {
        if (ruleHasSelector(rule, ':root')) {
            result.hasRootBlock = true;
            rule.walkDecls(VAR_PREFIX, (decl: Declaration) => {
                result.rootBlock[decl.prop.slice(2)] = {
                    value: decl.value,
                    line: decl.source?.start?.line,
                };
            });
        }
        if (ruleHasSelector(rule, '.dark')) {
            result.hasDarkBlock = true;
            rule.walkDecls(VAR_PREFIX, (decl: Declaration) => {
                result.darkBlock[decl.prop.slice(2)] = {
                    value: decl.value,
                    line: decl.source?.start?.line,
                };
            });
        }
    });

    root.walkAtRules('utility', (atRule: AtRule) => {
        const name = atRule.params?.trim();
        if (!name?.startsWith(TEXT_STYLE_PREFIX)) return;
        const styleName = name.slice(TEXT_STYLE_PREFIX.length);
        const applyClasses: string[] = [];
        atRule.walkAtRules('apply', (inner) => {
            for (const cls of inner.params.split(/\s+/)) {
                if (cls) applyClasses.push(cls);
            }
        });
        result.textStyles.push({
            name: styleName,
            applyClasses,
            line: atRule.source?.start?.line,
        });
    });

    return result;
}

const REF_VAR = /^var\(--([a-zA-Z0-9_-]+)\)$/;

function parseRef(value: string): ColorStyleRef {
    const m = REF_VAR.exec(value.trim());
    if (m?.[1]) return { type: 'var', var: m[1] };
    return { type: 'literal', value };
}

const TYPOGRAPHY_FAMILIES: Record<string, keyof TextStyle['resolved']> = {
    'font-sans': 'fontFamily',
    'font-serif': 'fontFamily',
    'font-mono': 'fontFamily',
    'font-display': 'fontFamily',
};

const FONT_WEIGHTS: Record<string, string> = {
    'font-thin': '100',
    'font-extralight': '200',
    'font-light': '300',
    'font-normal': '400',
    'font-medium': '500',
    'font-semibold': '600',
    'font-bold': '700',
    'font-extrabold': '800',
    'font-black': '900',
};

const TEXT_SIZES: Record<string, string> = {
    'text-xs': '0.75rem',
    'text-sm': '0.875rem',
    'text-base': '1rem',
    'text-lg': '1.125rem',
    'text-xl': '1.25rem',
    'text-2xl': '1.5rem',
    'text-3xl': '1.875rem',
    'text-4xl': '2.25rem',
    'text-5xl': '3rem',
    'text-6xl': '3.75rem',
    'text-7xl': '4.5rem',
    'text-8xl': '6rem',
    'text-9xl': '8rem',
};

const LEADING: Record<string, string> = {
    'leading-none': '1',
    'leading-tight': '1.25',
    'leading-snug': '1.375',
    'leading-normal': '1.5',
    'leading-relaxed': '1.625',
    'leading-loose': '2',
};

const TRACKING: Record<string, string> = {
    'tracking-tighter': '-0.05em',
    'tracking-tight': '-0.025em',
    'tracking-normal': '0',
    'tracking-wide': '0.025em',
    'tracking-wider': '0.05em',
    'tracking-widest': '0.1em',
};

const TEXT_TRANSFORMS = new Set(['uppercase', 'lowercase', 'capitalize', 'normal-case']);

/** Best-effort reverse-mapping of a known Tailwind utility set to a CSS preview. */
export function resolveTypographyClasses(applyClasses: string[]): TextStyle['resolved'] {
    const out: TextStyle['resolved'] = {};
    for (const cls of applyClasses) {
        if (cls in TYPOGRAPHY_FAMILIES) {
            const map: Record<string, string> = {
                'font-sans': 'ui-sans-serif, system-ui, sans-serif',
                'font-serif': 'ui-serif, Georgia, serif',
                'font-mono': 'ui-monospace, SFMono-Regular, monospace',
                'font-display': 'var(--font-display, ui-sans-serif)',
            };
            out.fontFamily = map[cls];
            continue;
        }
        if (cls in FONT_WEIGHTS) {
            out.fontWeight = FONT_WEIGHTS[cls];
            continue;
        }
        if (cls in TEXT_SIZES) {
            out.fontSize = TEXT_SIZES[cls];
            continue;
        }
        if (cls in LEADING) {
            out.lineHeight = LEADING[cls];
            continue;
        }
        if (cls in TRACKING) {
            out.letterSpacing = TRACKING[cls];
            continue;
        }
        if (TEXT_TRANSFORMS.has(cls)) {
            out.textTransform = cls;
            continue;
        }
    }
    return out;
}

/** Map a CSS scan into a structured snapshot consumable by `TokensManager`. */
export function snapshotFromScan(scan: CssScanResult): TokensSnapshot {
    const variables: VariableToken[] = [];
    const colorStyles: ColorStyle[] = [];

    const merged = new Map<string, { source: 'theme-block' | 'root'; light: string }>();
    for (const [name, entry] of Object.entries(scan.themeBlock)) {
        merged.set(name, { source: 'theme-block', light: entry.value });
    }
    // Authored :root values override Tailwind's generated theme-layer defaults.
    for (const [name, entry] of Object.entries(scan.rootBlock)) {
        merged.set(name, { source: 'root', light: entry.value });
    }

    for (const [name, info] of merged) {
        if (scan.compatibilityAliases[name]) continue;
        const dark = scan.darkBlock[name]?.value ?? null;
        // A theme entry whose light value is `var(--foo)` is treated as a
        // Color Style (semantic alias) rather than a raw Variable.
        const refMatch = REF_VAR.exec(info.light.trim());
        if (info.source === 'theme-block' && name.startsWith('color-') && refMatch) {
            colorStyles.push({
                name,
                displayName: inferDisplayName(name),
                refLight: parseRef(info.light),
                refDark: dark != null ? parseRef(dark) : null,
            });
            continue;
        }
        variables.push({
            name,
            group: inferGroup(name),
            displayName: inferDisplayName(name),
            light: info.light,
            dark,
            source: info.source,
        });
    }

    const textStyles: TextStyle[] = scan.textStyles.map((ts) => ({
        name: ts.name,
        displayName: prettifyTextStyleName(ts.name),
        className: `${TEXT_STYLE_PREFIX}${ts.name}`,
        applyClasses: ts.applyClasses,
        resolved: resolveTypographyClasses(ts.applyClasses),
    }));

    return {
        variables,
        colorStyles,
        textStyles,
        hasThemeBlock: scan.hasThemeBlock,
        hasRootBlock: scan.hasRootBlock,
        hasDarkBlock: scan.hasDarkBlock,
    };
}

function prettifyTextStyleName(name: string): string {
    return name
        .split('-')
        .map((s) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : s))
        .join(' ');
}

async function processCss(css: string, plugins: postcss.AcceptedPlugin[]): Promise<string> {
    const result = await postcss(plugins).process(css, { from: undefined });
    return result.css;
}

function ruleHasSelector(rule: Rule, target: string): boolean {
    return rule.selectors.some((s) => s.trim() === target);
}

function findRuleBySelector(root: Root, target: string): Rule | undefined {
    let rule: Rule | undefined;
    root.walkRules((r) => {
        if (!rule && ruleHasSelector(r, target)) rule = r;
    });
    return rule;
}

function ensureBlock(root: Root, kind: 'theme-block' | 'root' | 'dark'): AtRule | Rule {
    if (kind === 'theme-block') {
        let found: AtRule | undefined;
        root.walkAtRules('theme', (at) => {
            if (!found) found = at;
        });
        if (found) return found;
        const at = postcss.atRule({
            name: 'theme',
            params: '',
            raws: { before: '\n\n' },
        });
        at.raws.semicolon = true;
        root.append(at);
        return at;
    }
    const selector = kind === 'root' ? ':root' : '.dark';
    const existing = findRuleBySelector(root, selector);
    if (existing) return existing;
    const created = postcss.rule({ selector, raws: { before: '\n\n' } });
    root.append(created);
    return created;
}

function setVarOnNode(node: AtRule | Rule, name: string, value: string) {
    // Keep author ordering, comments and !important while ensuring no later
    // declaration in this same scope shadows the newly chosen value.
    let found = false;
    node.walkDecls(`--${name}`, (decl) => {
        decl.value = value;
        found = true;
    });
    if (!found) {
        node.append({ prop: `--${name}`, value });
    }
    // @theme inline emits the declaration's value directly into utilities.
    // Its compatibility aliases retain that value instead of introducing a
    // root-resolved var() indirection that would break dark descendant scopes.
    const updatedNames = new Set([name]);
    let added = true;
    while (added) {
        added = false;
        node.walkDecls(VAR_PREFIX, (decl) => {
            const marker = decl.prev();
            if (marker?.type !== 'comment') return;
            const match = /^weblab-compat-alias --([\w-]+) -> --([\w-]+) inline$/.exec(marker.text.trim());
            if (match?.[1] && match[2] && updatedNames.has(match[2]) && !updatedNames.has(match[1])) {
                decl.value = value;
                updatedNames.add(match[1]);
                added = true;
            }
        });
    }
}

function removeVarFromNode(node: AtRule | Rule, name: string) {
    node.walkDecls(`--${name}`, (decl) => {
        decl.remove();
    });
}

/** Update existing light declarations in their authored scopes; new tokens go in @theme. */
export async function setThemeVariable(
    cssContent: string,
    name: string,
    light: string,
): Promise<string> {
    return processCss(cssContent, [
        {
            postcssPlugin: 'set-theme-var',
            Once(root: Root) {
                const blocks = new Set<AtRule | Rule>();
                root.walkDecls(`--${name}`, (decl) => {
                    const parent = decl.parent;
                    if (parent?.type === 'atrule' && parent.name === 'theme') blocks.add(parent);
                    if (parent?.type === 'rule' && ruleHasSelector(parent, ':root')) {
                        if (ruleHasSelector(parent, '.dark')) {
                            throw new Error('This variable shares a light and dark declaration. Edit it in code.');
                        }
                        blocks.add(parent);
                    }
                });
                if (blocks.size === 0) blocks.add(ensureBlock(root, 'theme-block'));
                for (const block of blocks) setVarOnNode(block, name, light);
            },
        },
    ]);
}

/** Adds, updates, or removes a `--name` declaration inside `.dark`. */
export async function setDarkVariable(
    cssContent: string,
    name: string,
    dark: string | null,
): Promise<string> {
    return processCss(cssContent, [
        {
            postcssPlugin: 'set-dark-var',
            Once(root: Root) {
                const blocks = new Set<Rule>();
                root.walkRules((rule) => {
                    if (!ruleHasSelector(rule, '.dark')) return;
                    let contains = false;
                    rule.walkDecls(`--${name}`, () => { contains = true; });
                    if (!contains) return;
                    if (ruleHasSelector(rule, ':root')) {
                        throw new Error('This variable shares a light and dark declaration. Edit it in code.');
                    }
                    blocks.add(rule);
                });
                if (dark == null) {
                    for (const block of blocks) removeVarFromNode(block, name);
                    return;
                }
                if (blocks.size === 0) blocks.add(ensureBlock(root, 'dark') as Rule);
                for (const block of blocks) setVarOnNode(block, name, dark);
            },
        },
    ]);
}

/** Removes a token from `@theme`, `:root`, and `.dark`. */
export async function removeThemeVariable(cssContent: string, name: string): Promise<string> {
    return processCss(cssContent, [
        {
            postcssPlugin: 'remove-theme-var',
            Once(root: Root) {
                root.walkAtRules('theme', (at) => removeVarFromNode(at, name));
                root.walkRules((r) => {
                    if (ruleHasSelector(r, ':root') || ruleHasSelector(r, '.dark')) {
                        removeVarFromNode(r, name);
                    }
                });
            },
        },
    ]);
}

/** Keep existing source and computed Tailwind references working after rename. */
export async function renameThemeVariable(
    cssContent: string,
    oldName: string,
    newName: string,
): Promise<string> {
    if (oldName === newName) return cssContent;
    const validName = /^[A-Za-z_][A-Za-z0-9_-]*$/;
    if (!validName.test(oldName) || !validName.test(newName)) {
        throw new Error('Use a variable name made of letters, numbers, underscores and hyphens.');
    }
    return processCss(cssContent, [
        {
            postcssPlugin: 'rename-theme-var',
            Once(root: Root) {
                let collision = false;
                root.walkDecls(`--${newName}`, () => { collision = true; });
                if (collision) throw new Error('A variable with that name already exists.');

                const blocks: Array<AtRule | Rule> = [];
                root.walkAtRules('theme', (at) => { blocks.push(at); });
                root.walkRules((r) => {
                    if (ruleHasSelector(r, ':root') || ruleHasSelector(r, '.dark')) {
                        blocks.push(r);
                    }
                });
                const declarations: Declaration[] = [];
                for (const block of blocks) {
                    block.walkDecls(`--${oldName}`, (decl) => { declarations.push(decl); });
                }
                if (declarations.length === 0) throw new Error('The variable no longer exists.');
                for (const decl of new Set(declarations)) {
                    const inline = decl.parent?.type === 'atrule' && decl.parent.name === 'theme' &&
                        /(?:^|\s)inline(?:\s|$)/.test(decl.parent.params);
                    decl.cloneBefore({ prop: `--${newName}` });
                    decl.before(postcss.comment({
                        text: `${COMPATIBILITY_ALIAS_MARKER} --${oldName} -> --${newName}${inline ? ' inline' : ''}`,
                    }));
                    if (!inline) decl.value = `var(--${newName})`;
                }

                // Validate each light/dark graph. An alias through another
                // variable may otherwise introduce a cycle even without a
                // direct var(--oldName) in the renamed declaration.
                const light = new Map<string, string>();
                const dark: Array<AtRule | Rule> = [];
                for (const block of blocks) {
                    if (block.type === 'rule' && ruleHasSelector(block, '.dark')) {
                        dark.push(block);
                    } else {
                        block.walkDecls(VAR_PREFIX, (decl) => { light.set(decl.prop.slice(2), decl.value); });
                    }
                }
                const assertNoCycle = (values: Map<string, string>) => {
                    const visiting = new Set<string>();
                    const visited = new Set<string>();
                    const visit = (name: string) => {
                        if (visiting.has(name)) throw new Error('This rename would create a variable cycle.');
                        if (visited.has(name)) return;
                        visiting.add(name);
                        for (const match of (values.get(name) ?? '').matchAll(/var\(\s*--([\w-]+)/g)) {
                            if (match[1]) visit(match[1]);
                        }
                        visiting.delete(name);
                        visited.add(name);
                    };
                    visit(newName);
                };
                assertNoCycle(light);
                for (const block of dark) {
                    const values = new Map(light);
                    block.walkDecls(VAR_PREFIX, (decl) => { values.set(decl.prop.slice(2), decl.value); });
                    assertNoCycle(values);
                }
            },
        },
    ]);
}

/**
 * Sets the contents of a `@utility text-style-<name>` block, creating it
 * when missing. `applyClasses` becomes the single inner `@apply` line.
 */
export async function setTextStyleUtility(
    cssContent: string,
    name: string,
    applyClasses: string[],
): Promise<string> {
    return processCss(cssContent, [
        {
            postcssPlugin: 'set-text-style',
            Once(root: Root) {
                const target = `${TEXT_STYLE_PREFIX}${name}`;
                let found: AtRule | undefined;
                root.walkAtRules('utility', (at) => {
                    if (at.params.trim() === target) found = at;
                });
                if (found) {
                    found.removeAll();
                    found.append(postcss.atRule({ name: 'apply', params: applyClasses.join(' ') }));
                    return;
                }
                const at = postcss.atRule({
                    name: 'utility',
                    params: target,
                    raws: { before: '\n\n' },
                });
                at.append(postcss.atRule({ name: 'apply', params: applyClasses.join(' ') }));
                root.append(at);
            },
        },
    ]);
}

export async function removeTextStyleUtility(cssContent: string, name: string): Promise<string> {
    return processCss(cssContent, [
        {
            postcssPlugin: 'remove-text-style',
            Once(root: Root) {
                const target = `${TEXT_STYLE_PREFIX}${name}`;
                root.walkAtRules('utility', (at) => {
                    if (at.params.trim() === target) at.remove();
                });
            },
        },
    ]);
}

export const TOKENS_TEXT_STYLE_PREFIX = TEXT_STYLE_PREFIX;
