import type { ColorStyleRef } from '@weblab/models/style';

import type { TokenSectionId } from './group-tokens';

/**
 * `window.confirm` replacement signature — see `useConfirm` in
 * `components/ui/confirm-dialog.tsx`. Threaded into the token editors so
 * destructive deletes always confirm.
 */
export type ConfirmFn = (opts: {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}) => Promise<boolean>;

/** CSS-identifier slug — lowercase, dashes, no illegal characters. */
export function slugify(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

/** Parse a color-style value string into a structured ref. */
export function parseColorRef(value: string): ColorStyleRef {
    const v = value.trim();
    return v.startsWith('var(--') && v.endsWith(')')
        ? { type: 'var', var: v.slice(6, -1) }
        : { type: 'literal', value: v };
}

/** Render a structured color-style ref back to an editable string. */
export function colorRefToString(ref: ColorStyleRef): string {
    return ref.type === 'var' ? `var(--${ref.var})` : ref.value;
}

/**
 * Replace the last `-` segment of a token name with a new slugified leaf —
 * a rename that preserves the type prefix + group path. Full group ops
 * (move-to-group, rename group) land in M3.
 */
export function renameLeaf(fullName: string, newLeaf: string): string {
    const slug = slugify(newLeaf);
    if (!slug) return fullName;
    const idx = fullName.lastIndexOf('-');
    return idx === -1 ? slug : `${fullName.slice(0, idx + 1)}${slug}`;
}

/** CSS-var name a freshly-added token gets, prefixed by its section's type. */
export function newTokenName(sectionId: TokenSectionId, leaf: string): string {
    const slug = slugify(leaf);
    if (!slug) return slug;
    switch (sectionId) {
        case 'colors':
            return slug.startsWith('color-') ? slug : `color-${slug}`;
        case 'sizes':
            return slug.startsWith('space-') ? slug : `space-${slug}`;
        case 'radius':
            return slug.startsWith('radius-') ? slug : `radius-${slug}`;
        default:
            return slug;
    }
}
