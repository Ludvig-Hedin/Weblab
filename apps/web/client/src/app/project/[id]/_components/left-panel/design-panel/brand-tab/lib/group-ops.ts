import type { ColorStyle, TextStyle, VariableToken } from '@weblab/models/style';

import type { TokenRowData } from './group-tokens';
import type { useEditorEngine } from '@/components/store/editor';
import { slugify } from './token-mutations';

type TokensManager = ReturnType<typeof useEditorEngine>['tokens'];

/**
 * Group operations for the Brand panel. Groups are a naming convention, not a
 * data structure — a token's group is the first `-` segment after its type
 * prefix. So move / rename / new-group are all `renameVariable` (or the
 * color-style / text-style equivalent) prefix rewrites. No backend change.
 */

/** Type prefixes the parser recognises — order matters (longest unambiguous). */
const KNOWN_PREFIXES = [
    'color-',
    'spacing-',
    'space-',
    'radius-',
    'rounded-',
    'shadow-',
    'leading-',
    'tracking-',
    'font-',
    'text-',
];

interface ParsedName {
    /** Type prefix incl. trailing `-` (e.g. `color-`), or `''` for free-form names. */
    prefix: string;
    /** Current group segment, or `null` when the token sits ungrouped. */
    group: string | null;
    /** Leaf segment(s) — the token's own name within its group. */
    leaf: string;
}

/** Split a raw token name into prefix + group + leaf. */
export function parseTokenName(name: string, isTextStyle: boolean): ParsedName {
    if (isTextStyle) {
        const parts = name.split('-');
        if (parts.length >= 2) {
            return { prefix: '', group: parts[0]!, leaf: parts.slice(1).join('-') };
        }
        return { prefix: '', group: null, leaf: name };
    }
    const prefix = KNOWN_PREFIXES.find((p) => name.startsWith(p)) ?? '';
    const rest = name.slice(prefix.length);
    const parts = rest.split('-');
    if (parts.length >= 2) {
        return { prefix, group: parts[0]!, leaf: parts.slice(1).join('-') };
    }
    return { prefix, group: null, leaf: rest };
}

/** Reassemble a token name from prefix + group + leaf. */
export function composeTokenName(prefix: string, group: string | null, leaf: string): string {
    const groupSegment = group ? `${slugify(group)}-` : '';
    return `${prefix}${groupSegment}${leaf}`;
}

function renameToken(tokens: TokensManager, row: TokenRowData, newName: string): Promise<void> {
    if (newName === row.name) return Promise.resolve();
    if (row.kind === 'color-alias') return tokens.renameColorStyle(row.name, newName);
    if (row.kind === 'text-style') return tokens.renameTextStyle(row.name, newName);
    return tokens.renameVariable(row.name, newName);
}

function deleteToken(tokens: TokensManager, row: TokenRowData): Promise<void> {
    if (row.kind === 'color-alias') return tokens.deleteColorStyle(row.name);
    if (row.kind === 'text-style') return tokens.deleteTextStyle(row.name);
    return tokens.deleteVariable(row.name);
}

/** Duplicate a token, appending `-copy` to its leaf. */
export async function duplicateToken(tokens: TokensManager, row: TokenRowData): Promise<void> {
    const isTextStyle = row.kind === 'text-style';
    const { prefix, group, leaf } = parseTokenName(row.name, isTextStyle);
    const newName = composeTokenName(prefix, group, `${leaf}-copy`);
    if (isTextStyle) {
        const style = row.token as TextStyle;
        await tokens.addTextStyle({
            name: newName,
            applyClasses: style.applyClasses,
        });
        return;
    }
    if (row.kind === 'color-alias') {
        const style = row.token as ColorStyle;
        await tokens.addColorStyle({
            name: newName,
            refLight: style.refLight,
            refDark: style.refDark,
        });
        return;
    }
    const variable = row.token as VariableToken;
    await tokens.addVariable({
        name: newName,
        light: variable.light,
        dark: variable.dark,
    });
}

/** Move a token into `targetGroup` (or out of any group when `null`). */
export async function moveTokenToGroup(
    tokens: TokensManager,
    row: TokenRowData,
    targetGroup: string | null,
): Promise<void> {
    const isTextStyle = row.kind === 'text-style';
    const { prefix, leaf } = parseTokenName(row.name, isTextStyle);
    await renameToken(tokens, row, composeTokenName(prefix, targetGroup, leaf));
}

/** Rename a whole group — sequentially rewrites every member's prefix. */
export async function renameGroup(
    tokens: TokensManager,
    rows: TokenRowData[],
    newGroup: string,
): Promise<void> {
    for (const row of rows) {
        const { prefix, leaf } = parseTokenName(row.name, row.kind === 'text-style');
        await renameToken(tokens, row, composeTokenName(prefix, newGroup, leaf));
    }
}

/** Delete every token in a group (sequential — each is a CSS read/write/scan). */
export async function deleteGroup(tokens: TokensManager, rows: TokenRowData[]): Promise<void> {
    for (const row of rows) {
        await deleteToken(tokens, row);
    }
}
