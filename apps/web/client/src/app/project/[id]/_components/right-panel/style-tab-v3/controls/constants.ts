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
 *   - rounded-[8px]
 *   - text-mini, px-[10px]
 *   - 1px border that lifts on hover, focus ring on focus
 *
 * v3 tuning vs v2 — same height/radius/padding, but raised contrast so the
 * field reads clearly against the panel background in BOTH themes:
 *
 *   - Dark fill lifted rgb(43,43,43) -> rgb(50,50,50) resting,
 *     rgb(50,50,50) -> rgb(58,58,58) on hover. The old fill sat too close
 *     to the panel ground and the field edges dissolved.
 *   - Dark border switched from the near-invisible `--input` token to an
 *     explicit `white/[0.08]` hairline (lifts to `white/[0.14]` on hover)
 *     so the field has a defined edge without a harsh line.
 *   - Light mode keeps v2's `border-input` + `bg-foreground/5` — the user
 *     reported light mode reads well already.
 *
 * Focus ring still uses `foreground-brand/30` so editing surfaces inherit
 * the single Weblab accent. Keep the literal class string copy/pastable so
 * it shows up in the DOM inspector exactly as written.
 *
 * Focus ring is KEYBOARD-ONLY. `has-[:focus-visible]:*` rings the wrapper box
 * only when a descendant receives keyboard focus (Tab), and the `focus-visible:*`
 * variants cover the case where the base-class element is itself focusable.
 * `focus-within:*` was removed deliberately — it fired on mouse-click too,
 * which the user reported as an unwanted ring.
 */
export const FIELD_BASE_CLASSES =
    'h-[30px] w-full rounded-[8px] border border-input dark:border-white/[0.08] bg-foreground/5 dark:bg-[rgb(50,50,50)] text-mini text-foreground-primary placeholder:text-muted-foreground hover:bg-foreground/[0.08] dark:hover:bg-[rgb(58,58,58)] dark:hover:border-white/[0.14] has-[:focus-visible]:border-ring has-[:focus-visible]:ring-foreground-brand/30 has-[:focus-visible]:ring-[3px] focus-visible:border-ring focus-visible:ring-foreground-brand/30 focus-visible:ring-[3px] transition-colors outline-none px-[10px]';
