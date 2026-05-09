/**
 * Translate desktop-first user intent → mobile-first emission.
 *
 * The visual editor is desktop-first: users see Desktop as the leftmost
 * canvas and Tablet/Phone as smaller siblings. Internally each
 * `(oid, property)` is tracked as a `BreakpointMap` whose keys are the
 * stable breakpoint ids ('desktop' | 'tablet' | 'phone' | custom).
 *
 * Tailwind (and `@media (min-width: …)` CSS) is mobile-first: the base value
 * applies to every viewport; larger thresholds override it. So we re-base:
 *
 *  1. Cascade undefined values **down** from the next-larger defined one
 *     (matches the desktop-first user mental model — "I drew this at Desktop;
 *     it should look right everywhere by default").
 *  2. Walk smallest → largest. Emit base for the smallest breakpoint. For
 *     each next breakpoint, only emit a prefix when its value differs from
 *     the previously emitted value.
 *  3. Map breakpoint widths to Tailwind prefixes using the project's config
 *     (or Tailwind 3 defaults if config is unavailable).
 *
 * Two emission shapes:
 *   - `tailwind`: utility classes — `p-4`, `md:p-2`, `lg:p-6`.
 *   - `media`: ordered min-width declarations (for static-HTML projects).
 */

export type BreakpointId = 'desktop' | 'tablet' | 'phone' | (string & {});

export interface BreakpointEntry {
    id: BreakpointId;
    /** Stable display name. */
    name?: string;
    /** Min-width threshold this breakpoint represents. */
    minWidth: number;
    /** Value the user set at this breakpoint, or undefined if unset. */
    value: string | undefined;
}

export interface RebasedEntry {
    id: BreakpointId;
    minWidth: number;
    /** The value to emit at this breakpoint. */
    value: string;
    /** Tailwind prefix (e.g. `md:`); empty when this is the base. */
    tailwindPrefix: string;
}

export interface RebaseOptions {
    /** Tailwind breakpoint name → min-width (px). Defaults to v3 defaults. */
    tailwindPrefixes?: Record<string, number>;
}

const DEFAULT_TAILWIND_PREFIXES: Record<string, number> = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
};

/**
 * Pick the closest Tailwind prefix at or below the given minWidth. Returns an
 * arbitrary `[@media(min-width:Npx)]:` prefix (Tailwind 3.2+) when no preset
 * matches — guarantees emit produces valid utility syntax.
 */
export function tailwindPrefixForWidth(
    width: number,
    prefixes: Record<string, number> = DEFAULT_TAILWIND_PREFIXES,
): string {
    if (width <= 0) return '';
    // Pick the closest preset at-or-below the requested width. Tailwind
    // breakpoints are min-widths, so a frame at 1200px uses `lg:` (1024px+).
    // Falls back to arbitrary `[@media(min-width:Npx)]:` only when no preset
    // is ≤ width (e.g. width=400 with default presets starting at 640).
    let best: { name: string; w: number } | null = null;
    for (const [name, w] of Object.entries(prefixes)) {
        if (w <= width && (!best || w > best.w)) {
            best = { name, w };
        }
    }
    if (best) {
        return `${best.name}:`;
    }
    return `[@media(min-width:${Math.round(width)}px)]:`;
}

/**
 * Cascade-down + dedupe pass producing an array of breakpoint entries with
 * the minimum number of explicit values needed to reproduce the user intent.
 *
 * Input entries may be in any order; output is sorted ascending by minWidth.
 */
export function rebaseToMobileFirst(
    entries: BreakpointEntry[],
    options: RebaseOptions = {},
): RebasedEntry[] {
    if (entries.length === 0) return [];

    // Sort largest → smallest so we can fill smaller-undefined slots from the
    // closest larger defined slot.
    const sortedDesc = [...entries].sort((a, b) => b.minWidth - a.minWidth);
    let lastDefined: string | undefined;
    const filledDesc: BreakpointEntry[] = [];
    for (const entry of sortedDesc) {
        if (entry.value !== undefined) {
            lastDefined = entry.value;
            filledDesc.push(entry);
        } else if (lastDefined !== undefined) {
            filledDesc.push({ ...entry, value: lastDefined });
        } else {
            // No larger defined value yet — leave unset; the next pass might
            // fill it from a smaller defined value.
            filledDesc.push(entry);
        }
    }

    // Second pass: walk smallest → largest, propagate any still-undefined
    // values upward from the closest smaller defined entry.
    const ascending = [...filledDesc].sort((a, b) => a.minWidth - b.minWidth);
    let prev: string | undefined;
    for (const e of ascending) {
        if (e.value === undefined && prev !== undefined) {
            e.value = prev;
        }
        if (e.value !== undefined) prev = e.value;
    }

    // Third pass: emit only entries that differ from the previous emit.
    const out: RebasedEntry[] = [];
    let lastEmitted: string | undefined;
    const prefixes = options.tailwindPrefixes ?? DEFAULT_TAILWIND_PREFIXES;
    let isFirst = true;
    for (const e of ascending) {
        if (e.value === undefined) continue;
        if (e.value === lastEmitted && !isFirst) continue;
        out.push({
            id: e.id,
            minWidth: e.minWidth,
            value: e.value,
            tailwindPrefix: isFirst ? '' : tailwindPrefixForWidth(e.minWidth, prefixes),
        });
        lastEmitted = e.value;
        isFirst = false;
    }
    return out;
}
