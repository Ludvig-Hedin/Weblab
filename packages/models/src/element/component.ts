/**
 * Shared model for the Webflab component system (master/instance components).
 *
 * Code is the source of truth: every shape here is derived by parsing project
 * source (React `.tsx` exports or `weblab/components/*.html` partials) and is
 * re-derived on every file write. Nothing in this module is persisted to the
 * backend — Convex stores only display metadata (names, groups, tooltips).
 */

/**
 * Stable identity of a component definition.
 * React: `${filePath}#${exportName}` (e.g. `src/components/Card.tsx#Card`).
 * HTML:  the partial path (e.g. `weblab/components/card.html`).
 */
export type ComponentKey = string;

export type ComponentPropType =
    | 'text'
    | 'richtext'
    | 'image'
    | 'link'
    | 'number'
    | 'switch'
    | 'slot'
    | 'variant'
    | 'unsupported';

/** How a prop is wired to an element inside the master. */
export type ComponentPropBinding =
    | { kind: 'text-child'; oid: string }
    | { kind: 'attr'; oid: string; attr: string }
    | { kind: 'visibility'; oid: string }
    | { kind: 'variant-class'; mapName: string }
    | { kind: 'slot-site'; containerOid: string | null };

export interface ComponentPropSpec {
    name: string;
    type: ComponentPropType;
    required: boolean;
    defaultValue: string | number | boolean | null;
    bindings: ComponentPropBinding[];
    /** False for complex types (objects, functions) — shown read-only. */
    editable: boolean;
    /** Source text of the type annotation, for read-only display of unsupported props. */
    rawTypeText?: string;
    /** Enum members when the prop is a union of string literals. */
    options?: string[];
}

export interface ComponentVariantSpec {
    /** Name of the prop that selects the variant (usually `variant`). */
    propName: string;
    /** `plain-map` = module-scope object map; `cva` = class-variance-authority. */
    style: 'plain-map' | 'cva';
    /** Identifier of the map / cva const in the master file. */
    mapName: string;
    /** Variant name → class string. Informational; code is truth. */
    variants: Record<string, string>;
    defaultVariant: string;
}

export interface ComponentSlotSpec {
    /** `children` or the name of a ReactNode-typed prop / HTML `<slot name>`. */
    name: string;
    /** Oid of the master element wrapping the slot render site, when resolvable. */
    containerOid: string | null;
}

export interface ComponentDef {
    key: ComponentKey;
    /** Export name (React) or manifest name (HTML). Display fallback. */
    name: string;
    filePath: string;
    exportType: 'default' | 'named';
    kind: 'react' | 'html';
    /** Oid of the master's root element, when statically resolvable. */
    rootOid: string | null;
    props: ComponentPropSpec[];
    slots: ComponentSlotSpec[];
    variants: ComponentVariantSpec | null;
    /** True when the signature contains a rest/spread param (`{...rest}`). */
    hasSpread: boolean;
    /** False when the master can't be safely edited (unparseable, external). */
    editable: boolean;
}
