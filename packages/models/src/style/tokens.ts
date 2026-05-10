/**
 * Design-token model surfaced to the editor and parser.
 *
 * The runtime source-of-truth for every token is the user's `globals.css`
 * (a `@theme { ... }` block + `:root` / `.dark` declarations + `@utility
 * text-style-*` blocks). These types are the in-memory projection used by
 * the editor's `TokensManager`, the right-panel binding picker, and the
 * left-panel tabs.
 *
 * Bindings on a JSX element are NOT stored separately — they live in the
 * actual className / inline style and are detected by string match against
 * this registry.
 */

export type VariableGroup = 'color' | 'space' | 'font' | 'radius' | 'shadow' | 'other';

/** A raw design token authored by the user. */
export interface VariableToken {
    /** CSS-friendly name without the leading `--` (e.g. `color-bg`). */
    name: string;
    /** Inferred from the prefix (`color-*`, `space-*`, ...) — used for filtering. */
    group: VariableGroup;
    /** Pretty name for the UI (e.g. "Color/Background"). */
    displayName: string;
    /** Resolved light-mode value (hex / rem / px / etc). */
    light: string;
    /** Dark-mode override; null means "same in dark". */
    dark: string | null;
    /**
     * Where the token was authored:
     *  - `theme-block`: inside `@theme { ... }` (Tailwind 4 — auto-utilities).
     *  - `root`: inside `:root { ... }` (legacy / non-utility variable).
     */
    source: 'theme-block' | 'root';
}

/** Reference target for a Color Style. */
export type ColorStyleRef = { type: 'var'; var: string } | { type: 'literal'; value: string };

/** A semantic, named color preset. Resolves to a CSS color value at runtime. */
export interface ColorStyle {
    /** CSS-friendly name (e.g. `brand-primary`). */
    name: string;
    /** Pretty name with optional slash group (e.g. "Primary/Blue 500"). */
    displayName: string;
    /** What the style resolves to in light mode. */
    refLight: ColorStyleRef;
    /** What the style resolves to in dark mode; null inherits from light's reference chain. */
    refDark: ColorStyleRef | null;
}

/** A reusable typography preset. Compiles to a `text-style-<name>` utility. */
export interface TextStyle {
    /** CSS-friendly name (e.g. `heading-1`). */
    name: string;
    /** Pretty name (e.g. "Heading 1"). */
    displayName: string;
    /** The single class applied to elements bound to this style. */
    className: string;
    /** Tailwind utilities used inside `@apply`, preserved for round-trip editing. */
    applyClasses: string[];
    /** Best-effort resolved CSS shape — used for previews. */
    resolved: {
        fontFamily?: string;
        fontWeight?: string;
        fontSize?: string;
        lineHeight?: string;
        letterSpacing?: string;
        textTransform?: string;
    };
}

/** Snapshot returned by parser scan. */
export interface TokensSnapshot {
    variables: VariableToken[];
    colorStyles: ColorStyle[];
    textStyles: TextStyle[];
    /** True when the user's globals.css has a `@theme` block. */
    hasThemeBlock: boolean;
    /** True when the user's globals.css has a `:root` block. */
    hasRootBlock: boolean;
    /** True when the user's globals.css has a `.dark` block. */
    hasDarkBlock: boolean;
}

/** Live preview of the binding kind exposed on a property. */
export type StyleBindingKind = 'color-style' | 'text-style' | 'variable';

/** Metadata returned alongside a property value when it is bound to a token. */
export interface StyleBinding {
    kind: StyleBindingKind;
    /** Canonical token name. */
    name: string;
    /** UI label. */
    displayName: string;
    /** Resolved CSS value (hex, rem, ...) — what the chip shows on hover. */
    resolved: string;
}
