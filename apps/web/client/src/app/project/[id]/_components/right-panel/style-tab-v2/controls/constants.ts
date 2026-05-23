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
 *   - rounded-sm
 *   - text-mini, px-[10px]
 *   - fill rgb(43,43,43) in dark mode; subtle light-mode fallback
 *   - 1px input border that lifts on hover, focus ring on focus
 *
 * If you change anything here, every field wrapper picks it up automatically.
 * Keep the literal class string copy/pastable so it shows up in DOM inspector
 * exactly as written.
 */
// Focus ring uses `foreground-brand/30` so editing surfaces inherit the
// single Weblab accent. Border still goes to `--ring` so contrast is fine
// even when brand opacity overlays look faint.
export const FIELD_BASE_CLASSES =
    'h-[30px] w-full rounded-sm border border-input bg-foreground/5 dark:bg-[rgb(43,43,43)] text-mini text-foreground-primary placeholder:text-muted-foreground hover:bg-foreground/[0.08] dark:hover:bg-[rgb(50,50,50)] focus-within:border-ring focus-within:ring-foreground-brand/30 focus-within:ring-[3px] focus-visible:border-ring focus-visible:ring-foreground-brand/30 focus-visible:ring-[3px] transition-colors outline-none px-[10px]';
