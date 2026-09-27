/**
 * Color-variable bindings expressed as Tailwind v4 classes.
 *
 * A color property is "bound" to a variable when the element's className has
 * a base (no variant) utility that reads that variable:
 *   - `bg-brand`            → `--color-brand` (auto-utility from `@theme`)
 *   - `bg-(--surface)`      → `--surface`
 *   - `bg-[var(--surface)]` → `--surface`
 *   - `bg-red-500`          → `--color-red-500` (Tailwind's default palette)
 *
 * Pure string helpers so the right panel and the tokens manager share one
 * definition of "which class sets this color".
 */

/** Tailwind class prefix for each color property the style panel edits. */
export const COLOR_CLASS_PREFIX: Record<string, string> = {
    'background-color': 'bg',
    color: 'text',
    'border-color': 'border',
    'outline-color': 'outline',
    'text-decoration-color': 'decoration',
};

const TAILWIND_PALETTE = new Set([
    'slate',
    'gray',
    'zinc',
    'neutral',
    'stone',
    'red',
    'orange',
    'amber',
    'yellow',
    'lime',
    'green',
    'emerald',
    'teal',
    'cyan',
    'sky',
    'blue',
    'indigo',
    'violet',
    'purple',
    'fuchsia',
    'pink',
    'rose',
]);
const KEYWORD_COLORS = new Set(['white', 'black', 'transparent', 'current', 'inherit']);
const PALETTE_SHADE = /^([a-z]+)-(50|[1-9]00|950)$/;
const ARBITRARY_VAR = /^\[var\(--([a-zA-Z0-9_-]+)\)\]$/;
const SHORTHAND_VAR = /^\(--([a-zA-Z0-9_-]+)\)$/;
const ARBITRARY_COLOR = /^\[(#|rgb|hsl|hwb|oklch|oklab|lab\(|lch\(|color[(:]|color-mix\()/i;

export interface ColorClassBinding {
    /** The class that carries the binding (e.g. `bg-brand`). */
    className: string;
    /** Variable name without the leading `--` (e.g. `color-brand`). */
    varName: string;
    /** True for Tailwind's built-in palette (not editable in globals.css). */
    builtIn: boolean;
}

/** Base class without a variant (`hover:`, `md:` …), or null when it has one. */
function baseClass(cls: string): string | null {
    let depth = 0;
    for (const ch of cls) {
        if (ch === '[' || ch === '(') depth++;
        else if (ch === ']' || ch === ')') depth--;
        else if (ch === ':' && depth === 0) return null;
    }
    // Tailwind v4 accepts `!` at either end for important.
    return cls.replace(/^!/, '').replace(/!$/, '');
}

/** Utility body after `prefix-`, with any `/opacity` modifier removed. */
function colorBody(prefix: string, cls: string): string | null {
    const base = baseClass(cls);
    if (!base?.startsWith(`${prefix}-`)) return null;
    const body = base.slice(prefix.length + 1);
    // Drop an opacity modifier (`/50`, `/[.5]`, `/(--a)`): the last `/` outside brackets.
    let depth = 0;
    for (let i = body.length - 1; i > 0; i--) {
        const ch = body[i];
        if (ch === ']' || ch === ')') depth++;
        else if (ch === '[' || ch === '(') depth--;
        else if (ch === '/' && depth === 0) return body.slice(0, i);
    }
    return body;
}

function bindingFromBody(
    body: string,
    colorVarNames: ReadonlySet<string>,
): Omit<ColorClassBinding, 'className'> | null {
    const arbitrary = ARBITRARY_VAR.exec(body) ?? SHORTHAND_VAR.exec(body);
    if (arbitrary?.[1]) return { varName: arbitrary[1], builtIn: false };
    if (colorVarNames.has(`color-${body}`)) return { varName: `color-${body}`, builtIn: false };
    const shade = PALETTE_SHADE.exec(body);
    if (shade?.[1] && TAILWIND_PALETTE.has(shade[1])) {
        return { varName: `color-${body}`, builtIn: true };
    }
    if (body === 'white' || body === 'black') return { varName: `color-${body}`, builtIn: true };
    return null;
}

/** Find the base class that binds `property` to a color variable. */
export function findColorClassBinding(
    property: string,
    className: string,
    colorVarNames: ReadonlySet<string>,
): ColorClassBinding | null {
    const prefix = COLOR_CLASS_PREFIX[property];
    if (!prefix || !className) return null;
    // Last match wins, the same as a later utility in the cascade.
    let found: ColorClassBinding | null = null;
    for (const cls of className.split(/\s+/)) {
        const body = colorBody(prefix, cls);
        if (!body) continue;
        const hit = bindingFromBody(body, colorVarNames);
        if (hit) found = { className: cls, ...hit };
    }
    return found;
}

/** True when `cls` is a base utility that sets the color for `prefix`. */
function isColorClass(prefix: string, cls: string, colorVarNames: ReadonlySet<string>): boolean {
    const body = colorBody(prefix, cls);
    if (!body) return false;
    if (KEYWORD_COLORS.has(body)) return true;
    if (ARBITRARY_COLOR.test(body)) return true;
    return bindingFromBody(body, colorVarNames) != null;
}

/** Class that reads `varName` for `property` (e.g. `bg-brand`, `bg-(--surface)`). */
export function classForColorVariable(property: string, varName: string): string | null {
    const prefix = COLOR_CLASS_PREFIX[property];
    if (!prefix) return null;
    if (varName.startsWith('color-')) return `${prefix}-${varName.slice('color-'.length)}`;
    return `${prefix}-(--${varName})`;
}

/** Class that sets a literal color (e.g. `bg-[#FF0000]`). */
export function classForColorLiteral(property: string, value: string): string | null {
    const prefix = COLOR_CLASS_PREFIX[property];
    const literal = value.trim().replace(/\s+/g, '_');
    if (!prefix || !literal) return null;
    return `${prefix}-[${literal}]`;
}

/**
 * Replace every base color class for `property` with `nextClass`. Classes
 * behind a variant (`hover:bg-…`, `dark:bg-…`) are left alone.
 */
export function replaceColorClass(
    property: string,
    className: string,
    nextClass: string | null,
    colorVarNames: ReadonlySet<string>,
): string {
    const prefix = COLOR_CLASS_PREFIX[property];
    if (!prefix) return className;
    const kept = className
        .split(/\s+/)
        .filter((cls) => cls && !isColorClass(prefix, cls, colorVarNames));
    if (nextClass) kept.push(nextClass);
    return kept.join(' ');
}
