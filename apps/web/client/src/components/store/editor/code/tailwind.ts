import { twMerge } from 'tailwind-merge';

import type { CodeDiffRequest } from '@weblab/models/code';
import type { StyleChange } from '@weblab/models/style';
import type { BreakpointEntry } from '@weblab/parser';
import { StyleChangeType } from '@weblab/models/style';
import { rebaseToMobileFirst, removeUtilityClasses, tailwindPrefixForWidth } from '@weblab/parser';
import { CssToTailwindTranslator, propertyMap } from '@weblab/utility';

export function addTailwindToRequest(
    request: CodeDiffRequest,
    styles: Record<string, StyleChange>,
): void {
    const newClasses = getTailwindClasses(request.oid, styles);
    request.attributes.className = twMerge(request.attributes.className || '', newClasses);
}

export function getTailwindClasses(oid: string, styles: Record<string, StyleChange>): string[] {
    const customColors = Object.entries(styles).reduce(
        (acc, [key, style]) => {
            if (style.type === StyleChangeType.Custom) {
                acc[key] = style;
            }
            return acc;
        },
        {} as Record<string, StyleChange>,
    );
    const normalColors = Object.entries(styles).reduce(
        (acc, [key, style]) => {
            if (style.type !== StyleChangeType.Custom) {
                acc[key] = style;
            }
            return acc;
        },
        {} as Record<string, StyleChange>,
    );

    const css = createCSSRuleString(oid, normalColors);
    const tw = CssToTailwindTranslator(css);
    const twClasses = tw.data.map((res) => res.resultVal);

    const customClasses = Object.entries(customColors)
        .map(([key, style]) => {
            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            const css = propertyMap.get(cssKey.trim());
            if (typeof css === 'function') {
                return css(style.value, true);
            }
        })
        .filter((v) => v !== undefined);

    return [...twClasses, ...customClasses];
}

export function createCSSRuleString(oid: string, styles: Record<string, StyleChange>) {
    const cssString = Object.entries(styles)
        .map(
            ([property, value]) =>
                `${property.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value.value.trim()};`,
        )
        .join(' ');
    return `${oid} { ${cssString} }`;
}

/**
 * Append a fully-rebased responsive className for a single property to a
 * code-diff request. The caller already computed the rebased mobile-first
 * emit set via `rebaseToMobileFirst`; this helper just translates each entry
 * to a Tailwind class fragment, prepends its breakpoint prefix, and merges
 * into the request's existing className. Stale variants for the same
 * utility family are removed first so cleared overrides don't leave behind
 * orphan `md:p-2`-style classes.
 */
export function addResponsiveTailwindToRequest(
    request: CodeDiffRequest,
    property: string,
    breakpointEntries: BreakpointEntry[],
): void {
    const rebased = rebaseToMobileFirst(breakpointEntries);
    if (rebased.length === 0) return;

    const additions: string[] = [];
    for (const entry of rebased) {
        const styleChange: Record<string, StyleChange> = {
            [property]: { type: StyleChangeType.Value, value: entry.value },
        };
        const classes = getTailwindClasses(request.oid, styleChange);
        for (const cls of classes) {
            additions.push(entry.tailwindPrefix ? `${entry.tailwindPrefix}${cls}` : cls);
        }
    }
    if (additions.length === 0) return;

    // Strip any stale responsive variants for this property family before merging.
    // We don't have a reliable Tailwind utility prefix for every CSS property
    // (translator output varies), so we use twMerge's existing conflict-resolution
    // semantics — the additions go last so they win.
    request.attributes.className = twMerge(request.attributes.className || '', additions.join(' '));
}

export { tailwindPrefixForWidth };
