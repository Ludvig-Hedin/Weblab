/**
 * v4 design grammar — single source of truth for visual constants
 * across every primitive in this folder.
 *
 * Locked decisions (see ../DESIGN-BRIEF.md):
 *
 *   - Density Figma-tight; rows 28px tall (uniform across every field type)
 *   - Radius 10px outer, 9px inner (segmented)
 *   - Field fill uses `--background-secondary` (Codex `#222222` in dark,
 *     `#f2f2f2` in light); hover lifts to `--background-tertiary` (`#2a2a2a`
 *     dark, `#e6e6e6` light); active state uses `--background-active`
 *     (`#2a2a2a` dark). All driven by semantic tokens — NO hardcoded dark
 *     hex overrides anymore (2026-05-23 palette unification pass).
 *   - Transparent border at rest; brand-blue border on focus
 *   - Brand-blue reserved for: focus borders, class chips, pinned
 *     side accents in PinPad, focus rings inside ChipInput.
 *   - Group labels = sentence-case 11px `--foreground-secondary`,
 *     6px gap below to the input(s) they describe.
 *   - All icons stroke 1.5, `stroke-linecap="round"`,
 *     `stroke-linejoin="round"`, sized 12–14px inside controls.
 */

/**
 * Canonical Tailwind class string shared by every "field-like" element:
 * inputs, select triggers, segmented buttons, chip containers. Owns the
 * geometry + colors + hover + focus border swap.
 */
export const FIELD_BASE_CLASSES =
    'h-[26px] w-full rounded-[10px] border border-transparent bg-background-secondary text-mini text-foreground-primary placeholder:text-muted-foreground hover:bg-background-tertiary has-[:focus-visible]:border-foreground-brand focus-visible:border-foreground-brand transition-colors outline-none px-[8px]';

/**
 * Short-height variant for fields inside segmented or paired containers
 * (e.g. PinPad's T/L/R/B inputs).
 */
export const FIELD_BASE_CLASSES_SM =
    'h-[20px] w-full rounded-sm border border-transparent bg-background-secondary text-[11.5px] text-foreground-primary placeholder:text-muted-foreground hover:bg-background-tertiary has-[:focus-visible]:border-foreground-brand focus-visible:border-foreground-brand transition-colors outline-none px-[6px]';

/**
 * Class for the muted-grey active state used by every segmented control
 * in v4 (Flow, Alignment, Background type, etc.). Matches Figma vocabulary —
 * opaque pill, subtle shadow, primary text. NOT brand color.
 */
export const SEGMENT_ACTIVE_CLASSES =
    'data-[state=on]:bg-background-active data-[state=on]:text-foreground-primary data-[state=on]:shadow-sm aria-pressed:bg-background-active aria-pressed:text-foreground-primary aria-pressed:shadow-sm';

/**
 * Inactive segmented item. Secondary (not tertiary) at rest — icon-only
 * glyphs at `#717171` read as disabled on the dark field fill; `#b2b2b2`
 * keeps them clearly available while the active pill still dominates.
 */
export const SEGMENT_INACTIVE_CLASSES =
    'text-foreground-secondary hover:text-foreground-primary hover:bg-foreground/5';

/**
 * Geometry + interaction shared by every item inside a segmented container
 * (FlowSegment, IconSegment). 9px inner radius = 10px container − ~1px inset.
 * Compose with SEGMENT_INACTIVE_CLASSES + SEGMENT_ACTIVE_CLASSES.
 */
export const SEGMENT_ITEM_CLASSES =
    'focus-visible:ring-foreground-brand/30 flex h-full cursor-pointer items-center justify-center rounded-[9px] px-0 shadow-none transition-[background-color,color,box-shadow] outline-none focus-visible:ring-[3px] active:scale-[0.97] motion-reduce:transition-none';

/** Small group-head action button (20×20). Secondary at rest for legibility. */
export const ICON_BTN_SM_CLASSES =
    'inline-flex h-[20px] w-[20px] items-center justify-center rounded-xs text-foreground-secondary hover:bg-background-tertiary hover:text-foreground-primary transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground-brand/40';

/** Inline unit/keyword pill on numeric fields. */
export const UNIT_PILL_CLASSES =
    'inline-flex h-[20px] items-center gap-1 rounded-[6px] bg-foreground/5 px-1.5 text-[11px] text-foreground-secondary hover:bg-foreground/10 hover:text-foreground-primary transition-colors cursor-pointer outline-none';

/** Group label — sentence-case 11px tone. */
export const GROUP_LABEL_CLASSES = 'text-[11px] text-foreground-secondary leading-none';

/** Inline label inside a field (e.g. `Min W`, `Grow`). */
export const INLINE_LABEL_CLASSES = 'text-[11px] text-foreground-secondary';

/* Legacy (still used by inherited sections during the v4 migration). */
export const PROPERTY_LABEL_WIDTH = 72;
export const PROPERTY_LABEL_OFFSET_CLASS = 'pl-[84px]';
