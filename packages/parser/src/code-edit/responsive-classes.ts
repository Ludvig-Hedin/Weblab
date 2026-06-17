/**
 * Read/write Tailwind utility classes that include responsive variants
 * (`md:p-4`, `lg:bg-red-500`, etc.) — the parser-side counterpart of the
 * runtime CSS overrides written by the preload script.
 *
 * The visual editor edits CSS *properties* (e.g. `padding`, `padding-top`,
 * `background-color`), but Tailwind speaks in *utility families*. We bridge
 * the two by treating each CSS-property + value as a single "utility token"
 * (e.g. `padding=16px` → `p-4`). The editor's runtime injection writes raw
 * CSS values via `<style>`; this module is responsible for normalizing those
 * values into Tailwind classes when rebasing into source.
 *
 * For values we don't know how to map cleanly (custom colors, exotic
 * lengths) we fall back to Tailwind's arbitrary-value syntax (`p-[17px]`)
 * which always round-trips. This intentionally trades a "perfect" Tailwind
 * conversion for one that's predictable and always emits valid classes.
 */

const SPACING_SCALE: Record<number, string> = {
    0: '0',
    1: 'px',
    2: '0.5',
    4: '1',
    6: '1.5',
    8: '2',
    10: '2.5',
    12: '3',
    14: '3.5',
    16: '4',
    20: '5',
    24: '6',
    28: '7',
    32: '8',
    36: '9',
    40: '10',
    44: '11',
    48: '12',
    56: '14',
    64: '16',
    80: '20',
    96: '24',
    112: '28',
    128: '32',
};

interface UtilityShape {
    /** Tailwind utility prefix (e.g. `p`, `pt`, `bg`, `text`). */
    utility: string;
    /** True when arbitrary value syntax should always be used (e.g. colors). */
    arbitrary: boolean;
    /** Optional value transformer for utilities like spacing. */
    toClassValue?: (value: string) => string;
}

const PROPERTY_TO_UTILITY: Record<string, UtilityShape> = {
    padding: { utility: 'p', arbitrary: false, toClassValue: spacingClassValue },
    paddingTop: { utility: 'pt', arbitrary: false, toClassValue: spacingClassValue },
    paddingRight: { utility: 'pr', arbitrary: false, toClassValue: spacingClassValue },
    paddingBottom: { utility: 'pb', arbitrary: false, toClassValue: spacingClassValue },
    paddingLeft: { utility: 'pl', arbitrary: false, toClassValue: spacingClassValue },
    margin: { utility: 'm', arbitrary: false, toClassValue: spacingClassValue },
    marginTop: { utility: 'mt', arbitrary: false, toClassValue: spacingClassValue },
    marginRight: { utility: 'mr', arbitrary: false, toClassValue: spacingClassValue },
    marginBottom: { utility: 'mb', arbitrary: false, toClassValue: spacingClassValue },
    marginLeft: { utility: 'ml', arbitrary: false, toClassValue: spacingClassValue },
    width: { utility: 'w', arbitrary: true },
    height: { utility: 'h', arbitrary: true },
    minWidth: { utility: 'min-w', arbitrary: true },
    minHeight: { utility: 'min-h', arbitrary: true },
    maxWidth: { utility: 'max-w', arbitrary: true },
    maxHeight: { utility: 'max-h', arbitrary: true },
    backgroundColor: { utility: 'bg', arbitrary: true },
    color: { utility: 'text', arbitrary: true },
    borderRadius: { utility: 'rounded', arbitrary: true },
    fontSize: { utility: 'text', arbitrary: true },
    fontWeight: { utility: 'font', arbitrary: true },
    opacity: { utility: 'opacity', arbitrary: true },
    display: { utility: '', arbitrary: false, toClassValue: displayClassValue },
};

function spacingClassValue(value: string): string {
    const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
    if (!match) {
        return `[${value.trim()}]`;
    }
    const px = Math.round(Number(match[1]));
    if (SPACING_SCALE[px] !== undefined) {
        return SPACING_SCALE[px];
    }
    return `[${px}px]`;
}

function displayClassValue(value: string): string {
    // Keep this in sync with the `displayTokens` strip set in
    // `removeUtilityClasses`. If a value can be stripped as a bare token it
    // must also emit as that bare token here, otherwise a rebase converts a
    // clean `table` into the ugly arbitrary `[display:table]`.
    const map: Record<string, string> = {
        block: 'block',
        'inline-block': 'inline-block',
        inline: 'inline',
        flex: 'flex',
        'inline-flex': 'inline-flex',
        grid: 'grid',
        'inline-grid': 'inline-grid',
        none: 'hidden',
        contents: 'contents',
        table: 'table',
        'inline-table': 'inline-table',
        'table-row': 'table-row',
        'table-cell': 'table-cell',
        'flow-root': 'flow-root',
        'list-item': 'list-item',
    };
    return map[value.trim()] ?? `[display:${value.trim()}]`;
}

/**
 * Convert a CSS-property + value into a Tailwind utility class fragment
 * (without prefix). Returns `null` if the property is unknown — the caller
 * should fall back to writing an `@media` CSS rule instead.
 */
export function tailwindClassFor(property: string, value: string): string | null {
    const shape = PROPERTY_TO_UTILITY[property];
    if (!shape) return null;
    if (shape.utility === '' && shape.toClassValue) {
        // Display utilities map directly without a prefix-utility-value structure.
        return shape.toClassValue(value);
    }
    const v = shape.toClassValue ? shape.toClassValue(value) : `[${value.trim()}]`;
    // Both arms of the previous ternary produced the same value, so the
    // condition was dead — arbitrary values and scale tokens both join with `-`.
    return `${shape.utility}-${v}`;
}

/**
 * Strip any class fragment matching the given utility prefix (with or without
 * a responsive variant prefix). Used to remove stale responsive variants
 * before re-emitting the rebased set.
 *
 * Example: removeUtilityClasses("p-4 md:p-2 lg:p-8 bg-red-500", "p")
 *   → "bg-red-500"
 */
export function removeUtilityClasses(className: string, utility: string): string {
    const tokens = className.split(/\s+/).filter(Boolean);
    const isDisplay = utility === '';
    const displayTokens = new Set([
        'block',
        'inline-block',
        'inline',
        'flex',
        'inline-flex',
        'grid',
        'inline-grid',
        'hidden',
        'contents',
        'table',
        'inline-table',
        'table-row',
        'table-cell',
        'flow-root',
        'list-item',
    ]);
    const prefixed = `${utility}-`;
    const kept = tokens.filter((token) => {
        // Strip variant prefixes (e.g. `md:`, `lg:hover:`) but only outside
        // arbitrary-value brackets — `[display:grid]` contains a `:` that is
        // part of the value, not a variant separator.
        const bracketIdx = token.indexOf('[');
        const variantSegment = bracketIdx === -1 ? token : token.slice(0, bracketIdx);
        const variantColonIdx = variantSegment.lastIndexOf(':');
        const bare = variantColonIdx >= 0 ? token.slice(variantColonIdx + 1) : token;
        if (isDisplay) return !displayTokens.has(bare) && !bare.startsWith('[display:');
        if (bare === utility) return false;
        return !bare.startsWith(prefixed);
    });
    return kept.join(' ');
}

/**
 * Compose a final className string from a rebased emit set.
 *
 * Existing tokens for the same utility family are stripped first so we don't
 * leave stale `md:p-2` lingering when the user clears that override.
 */
export function applyResponsiveTailwind(
    existingClassName: string,
    property: string,
    rebased: Array<{ tailwindPrefix: string; value: string }>,
): string {
    const shape = PROPERTY_TO_UTILITY[property];
    const utility = shape?.utility ?? '';
    const cleaned = removeUtilityClasses(existingClassName, utility);
    const additions: string[] = [];
    for (const entry of rebased) {
        const cls = tailwindClassFor(property, entry.value);
        if (!cls) continue;
        additions.push(entry.tailwindPrefix + cls);
    }
    return [cleaned.trim(), additions.join(' ')].filter(Boolean).join(' ').trim();
}
