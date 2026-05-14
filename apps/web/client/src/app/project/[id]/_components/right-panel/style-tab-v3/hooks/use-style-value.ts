'use client';

import type { WriteTarget } from '@/components/store/editor/style/preferences';
import { useEditorEngine } from '@/components/store/editor';

export type StyleSource = 'inline' | 'class' | 'inherited' | 'computed' | 'unset';

export interface StyleValue {
    /** Resolved value. Empty string when nothing is defined or computed. */
    value: string;
    /** Where the value comes from. */
    source: StyleSource;
    /** True when the value is explicitly authored (inline or class). */
    isSet: boolean;
    /** Active write target for this property (project default + per-property override). */
    writeTarget: WriteTarget;
    /** True when "Override (this element only)" is enabled for this property+element. */
    override: boolean;
}

const EMPTY_VALUE: StyleValue = {
    value: '',
    source: 'unset',
    isSet: false,
    writeTarget: 'tailwind',
    override: false,
};

/**
 * Convert a CSS property name to kebab-case (`paddingTop` → `padding-top`,
 * `WebkitBoxOrient` → `-webkit-box-orient`). Leaves already-kebab names and
 * custom properties (`--foo`) untouched.
 */
function toKebab(property: string): string {
    if (property.startsWith('--')) return property;
    return property
        .replace(/^([A-Z])/, (m) => `-${m.toLowerCase()}`)
        .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * Convert a CSS property name to camelCase (`padding-top` → `paddingTop`,
 * `-webkit-box-orient` → `WebkitBoxOrient`). Leaves already-camel names and
 * custom properties untouched.
 */
function toCamel(property: string): string {
    if (property.startsWith('--')) return property;
    return property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Longhands that make a shorthand "set" when any of them is authored. The
 * panel often queries a shorthand (`padding`, `margin`) while the underlying
 * map only carries the longhands the parser actually extracted (or vice
 * versa). We treat the shorthand as set if any constituent longhand is set.
 */
const SHORTHAND_LONGHANDS: Record<string, string[]> = {
    padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    inset: ['top', 'right', 'bottom', 'left'],
    'border-width': [
        'border-top-width',
        'border-right-width',
        'border-bottom-width',
        'border-left-width',
    ],
    'border-radius': [
        'border-top-left-radius',
        'border-top-right-radius',
        'border-bottom-right-radius',
        'border-bottom-left-radius',
    ],
    'border-color': [
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
    ],
    gap: ['row-gap', 'column-gap'],
    overflow: ['overflow-x', 'overflow-y'],
    'place-items': ['align-items', 'justify-items'],
    'place-content': ['align-content', 'justify-content'],
    flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
};

/** Non-empty truthiness for a raw map value. */
function present(raw: unknown): raw is string {
    return raw !== undefined && raw !== null && raw !== '' && typeof raw === 'string';
}

/**
 * Look up a property in a style map regardless of whether the map keys it in
 * kebab-case or camelCase. `getStyles()` (preload) builds `computed` by
 * JSON-cloning `getComputedStyle`, which yields *camelCase* keys, while
 * `defined` is parsed from raw CSS text and keeps *kebab-case* keys. The panel
 * queries kebab — without normalization, half the lookups silently miss.
 */
function lookup(map: Record<string, string>, property: string): string | undefined {
    const direct = map[property];
    if (direct !== undefined) return direct;
    const kebab = map[toKebab(property)];
    if (kebab !== undefined) return kebab;
    const camel = map[toCamel(property)];
    if (camel !== undefined) return camel;
    return undefined;
}

/** True when the property — or, for a shorthand, any of its longhands — is present in the map. */
function isPresentInMap(map: Record<string, string>, property: string): boolean {
    if (present(lookup(map, property))) return true;
    const kebab = toKebab(property);
    const longhands = SHORTHAND_LONGHANDS[kebab];
    if (longhands) {
        return longhands.some((lh) => present(lookup(map, lh)));
    }
    return false;
}

/**
 * `width` / `height` are seeded into `defined` as a literal `'auto'` by the
 * preload `getStyles()` regardless of whether the author set them — see
 * `apps/web/preload/script/api/elements/style.ts`. Treating that seed as
 * "authored" would light the override dot for every element, so an `auto`
 * value on these two props is only considered set if it differs from the
 * computed value (i.e. the author genuinely wrote `auto`).
 */
const AUTO_SEEDED_PROPS = new Set(['width', 'height']);

/**
 * Read the current resolved value for a CSS property on the selected element,
 * along with metadata about where the value came from and how it would be
 * written back if the user edits it.
 *
 * `isSet` is true whenever the property is genuinely authored on the element
 * (inline or via a class), and false only when the value is purely
 * inherited / computed / unset. Shorthand queries (`padding`, `margin`,
 * `overflow`, …) resolve as set when any constituent longhand is authored,
 * and `-webkit-`/camelCase key-format mismatches between the `defined` and
 * `computed` maps are normalized away.
 *
 * Note: this hook is meant to be used inside an `observer()` component so that
 * MobX picks up reads from `editorEngine.style.selectedStyle` and re-renders
 * when the selected element changes.
 */
export function useStyleValue(property: string): StyleValue {
    const editorEngine = useEditorEngine();
    const selectedStyle = editorEngine.style.selectedStyle;
    const selected = editorEngine.elements.selected;
    const oid = selected[0]?.oid ?? null;

    const writeTarget = editorEngine.stylePreferences.getWriteTarget(property);
    const override = editorEngine.stylePreferences.isOverridden(oid, property);

    if (!selectedStyle) {
        return { ...EMPTY_VALUE, writeTarget, override };
    }

    const defined = selectedStyle.styles.defined ?? {};
    const computed = selectedStyle.styles.computed ?? {};

    const definedValue = lookup(defined, property);
    const computedValue = lookup(computed, property);

    // A property is "authored" when it shows up in `defined` (inline or
    // stylesheet rule) — OR, for a shorthand, when any of its longhands do.
    let authored = isPresentInMap(defined, property);

    // Guard against the `width`/`height` `'auto'` seed: only count it as
    // authored if it diverges from the browser-computed value.
    const kebab = toKebab(property);
    if (
        authored &&
        AUTO_SEEDED_PROPS.has(kebab) &&
        present(definedValue) &&
        definedValue === 'auto' &&
        present(computedValue) &&
        computedValue !== 'auto'
    ) {
        authored = false;
    }

    if (authored) {
        // The current StyleManager merges stylesheet + inline into `defined`,
        // so we can't yet split `inline` vs `class` precisely — surface as
        // `class` (the common case for Tailwind-driven projects). What matters
        // for consumers is the authored/default distinction: `isSet` true and
        // a non-`computed`/`inherited` source both mean "overridden".
        const value = present(definedValue)
            ? String(definedValue)
            : present(computedValue)
              ? String(computedValue)
              : '';
        return {
            value,
            source: 'class',
            isSet: true,
            writeTarget,
            override,
        };
    }

    if (present(computedValue)) {
        return {
            value: String(computedValue),
            source: 'computed',
            isSet: false,
            writeTarget,
            override,
        };
    }

    return { ...EMPTY_VALUE, writeTarget, override };
}
