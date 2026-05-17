import type { ColorStyle, TextStyle, VariableToken } from '@weblab/models/style';

/**
 * Pure projection layer for the unified Brand panel.
 *
 * `TokensManager` already stores every token in one `@theme` block — the
 * `variables` / `colorStyles` split is just a scan-time convenience. This
 * module re-merges them into **typed sections** (the organising axis the
 * owner confirmed) and derives **groups** from the token name, so the panel
 * can render one scrollable tree instead of five drill-in sub-panels.
 */

export type TokenSectionId = 'colors' | 'sizes' | 'radius' | 'text-styles' | 'other';

export type TokenRowKind = 'color' | 'color-alias' | 'dimension' | 'text-style' | 'other';

export interface TokenRowData {
    /** Raw token identifier — CSS var name, or text-style name. Stable key. */
    name: string;
    /** Leaf label shown in the row (group prefix stripped). */
    label: string;
    kind: TokenRowKind;
    /** Resolved light-mode value — hex for swatches, dimension string, etc. */
    value: string;
    /** Dark-mode value when the token defines one. */
    darkValue: string | null;
    /** For color aliases: the human label of the alias target. */
    aliasLabel: string | null;
    /** Underlying token — editors read full detail from this. */
    token: VariableToken | ColorStyle | TextStyle;
}

export interface TokenGroupData {
    /** Group label, e.g. "Brand". */
    label: string;
    /** Stable key for collapse state, e.g. "colors/Brand". */
    key: string;
    rows: TokenRowData[];
}

export interface TokenSectionData {
    id: TokenSectionId;
    title: string;
    count: number;
    /** Rows with no group — rendered directly under the section header. */
    rows: TokenRowData[];
    groups: TokenGroupData[];
}

const SECTION_TITLES: Record<TokenSectionId, string> = {
    colors: 'Colors',
    sizes: 'Sizes & Spacing',
    radius: 'Radius',
    'text-styles': 'Text Styles',
    other: 'Other',
};

const SECTION_ORDER: TokenSectionId[] = ['colors', 'sizes', 'radius', 'text-styles', 'other'];

/** Map a `VariableToken.group` onto a panel section. */
function sectionForVariableGroup(group: VariableToken['group']): TokenSectionId {
    switch (group) {
        case 'color':
            return 'colors';
        case 'space':
            return 'sizes';
        case 'radius':
            return 'radius';
        default:
            // font / shadow / other → the catch-all section
            return 'other';
    }
}

/**
 * Split a token `displayName` into an optional group + leaf label.
 *
 * `displayName` is `Type/Rest` for variables (e.g. `Color/Brand Primary`) and
 * a plain phrase for text styles (e.g. `Heading 1`). We take the part after
 * the first `/`, then treat its first word as the group when there are 2+
 * words — one level of nesting, which covers the Figma/Framer common case.
 */
export function splitGroupLeaf(displayName: string): { group: string | null; label: string } {
    const afterSlash = displayName.includes('/')
        ? displayName.slice(displayName.indexOf('/') + 1)
        : displayName;
    const words = afterSlash.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return { group: words[0]!, label: words.slice(1).join(' ') };
    }
    return { group: null, label: words[0] ?? displayName };
}

/** Best-effort one-line preview for a text style row. */
function textStylePreview(style: TextStyle): string {
    const size = style.resolved.fontSize;
    const line = style.resolved.lineHeight;
    if (size && line) return `${size} / ${line}`;
    return size ?? style.applyClasses.join(' · ');
}

interface BuildInput {
    variables: VariableToken[];
    colorStyles: ColorStyle[];
    textStyles: TextStyle[];
    /** Resolve a `var(--name)` chain to a literal value (TokensManager.resolveVariableValue). */
    resolveVar: (name: string) => string | null;
}

/**
 * Build the typed-section tree consumed by the Brand panel.
 *
 * Variables are bucketed by their inferred type; Color Styles all land in the
 * Colors section (they are color variables that alias another token); Text
 * Styles get their own section. Within each section, rows are grouped by the
 * first word of their display name.
 */
export function buildTokenSections(input: BuildInput): TokenSectionData[] {
    const { variables, colorStyles, textStyles, resolveVar } = input;

    const rowsBySection: Record<TokenSectionId, TokenRowData[]> = {
        colors: [],
        sizes: [],
        radius: [],
        'text-styles': [],
        other: [],
    };

    for (const variable of variables) {
        const section = sectionForVariableGroup(variable.group);
        const { label } = splitGroupLeaf(variable.displayName);
        const kind: TokenRowKind =
            section === 'colors' ? 'color' : section === 'other' ? 'other' : 'dimension';
        rowsBySection[section].push({
            name: variable.name,
            label,
            kind,
            value: variable.light,
            darkValue: variable.dark,
            aliasLabel: null,
            token: variable,
        });
    }

    for (const style of colorStyles) {
        const { label } = splitGroupLeaf(style.displayName);
        const refLight = style.refLight;
        const refDark = style.refDark;
        const lightValue =
            refLight.type === 'var' ? (resolveVar(refLight.var) ?? '#000000') : refLight.value;
        let aliasLabel: string | null = null;
        if (refLight.type === 'var') {
            const varName = refLight.var;
            aliasLabel =
                variables.find((v) => v.name === varName)?.displayName ?? `var(--${varName})`;
        }
        const darkValue =
            refDark == null
                ? null
                : refDark.type === 'var'
                  ? (resolveVar(refDark.var) ?? null)
                  : refDark.value;
        rowsBySection.colors.push({
            name: style.name,
            label,
            kind: 'color-alias',
            value: lightValue,
            darkValue,
            aliasLabel,
            token: style,
        });
    }

    for (const style of textStyles) {
        const { label } = splitGroupLeaf(style.displayName);
        rowsBySection['text-styles'].push({
            name: style.name,
            label,
            kind: 'text-style',
            value: textStylePreview(style),
            darkValue: null,
            aliasLabel: null,
            token: style,
        });
    }

    return SECTION_ORDER.map((id) => {
        const rows = rowsBySection[id];
        const ungrouped: TokenRowData[] = [];
        const groupMap = new Map<string, TokenGroupData>();

        for (const row of rows) {
            // Every token kind (VariableToken | ColorStyle | TextStyle) carries
            // a displayName — that's what the group split reads.
            const { group } = splitGroupLeaf(row.token.displayName);
            if (!group) {
                ungrouped.push(row);
                continue;
            }
            const key = `${id}/${group}`;
            let bucket = groupMap.get(key);
            if (!bucket) {
                bucket = { label: group, key, rows: [] };
                groupMap.set(key, bucket);
            }
            bucket.rows.push(row);
        }

        // Preserve scan order — alphabetical sort would put `sm/md/lg/xl` out
        // of size order, which is rarely what the author intended. Insertion
        // order tracks the CSS source, which IS the author's intent.
        const groups = [...groupMap.values()];

        return {
            id,
            title: SECTION_TITLES[id],
            count: rows.length,
            rows: ungrouped,
            groups,
        };
    });
}
