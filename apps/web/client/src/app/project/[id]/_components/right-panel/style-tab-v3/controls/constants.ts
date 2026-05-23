/**
 * Width of the property label column (dot + label). Every row in the style
 * panel aligns its editor against this column so labels and values form a
 * single tidy gutter.
 */
export const PROPERTY_LABEL_WIDTH = 72; // px
/** `pl-[84px]` — label width + the row's horizontal gap (12px). */
export const PROPERTY_LABEL_OFFSET_CLASS = 'pl-[84px]';

/**
 * Canonical geometry shared by every row editor in this panel:
 *
 *   - h-[30px] (the exact "30px" tall the design spec calls for)
 *   - rounded-sm (0.5rem = 8px — design system radius scale)
 *   - text-mini, px-[10px]
 *   - 1px transparent border at rest; turns brand-blue on focus (no ring)
 *
 * Surface model:
 *
 *   - Light resting fill: `bg-background-secondary` (#f2f2f2). Subtle inset.
 *   - Dark resting fill: `#2b2b2b` — tuned darker than the token to soften
 *     contrast against the dark panel background.
 *   - Hover fill: `bg-background-tertiary` (#e6e6e6 / #333333) — one step
 *     brighter to telegraph affordance.
 *   - Border at rest is transparent so layout is stable; focus swaps to
 *     `border-foreground-brand` for a clean blue outline without a ring halo.
 *
 * Focus visual is border-only (no ring). `has-[:focus-visible]:*` covers
 * wrapper boxes whose descendant takes keyboard focus; `focus-visible:*`
 * covers cases where the base-class element is itself focusable. Mouse-click
 * focus is intentionally silent.
 */
export const FIELD_BASE_CLASSES =
    'h-[30px] w-full rounded-[10px] border border-transparent bg-background-secondary dark:bg-[#101010] text-mini text-foreground-primary placeholder:text-muted-foreground hover:bg-background-tertiary dark:hover:bg-[#181818] has-[:focus-visible]:border-foreground-brand focus-visible:border-foreground-brand transition-colors outline-none px-[10px]';
