/**
 * v4 design grammar — single source of truth for visual constants
 * across every primitive in this folder.
 *
 * Locked decisions (see ../DESIGN-BRIEF.md):
 *
 *   - Density Figma-tight; rows 28px tall (uniform across every field type)
 *   - Radius 10px outer, 9px inner (segmented)
 *   - Dark fill #262626 (lifts to #2F2F2F on hover) — subtle inset over
 *     the panel chrome (#1a1a1a)
 *   - Transparent border at rest; brand-blue border on focus
 *   - Active state = muted grey (`bg-background-active` light /
 *     `#3A3A3A` dark) + `shadow-sm`. NOT brand color.
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
    'h-[26px] w-full rounded-[10px] border border-transparent bg-background-secondary dark:bg-[#262626] text-mini text-foreground-primary placeholder:text-muted-foreground hover:bg-background-tertiary dark:hover:bg-[#2F2F2F] has-[:focus-visible]:border-foreground-brand focus-visible:border-foreground-brand transition-colors outline-none px-[8px]';

/**
 * Short-height variant for fields inside segmented or paired containers
 * (e.g. PinPad's T/L/R/B inputs).
 */
export const FIELD_BASE_CLASSES_SM =
    'h-[20px] w-full rounded-[8px] border border-transparent bg-background-secondary dark:bg-[#262626] text-[11.5px] text-foreground-primary placeholder:text-muted-foreground hover:bg-background-tertiary dark:hover:bg-[#2F2F2F] has-[:focus-visible]:border-foreground-brand focus-visible:border-foreground-brand transition-colors outline-none px-[6px]';

/**
 * Class for the muted-grey active state used by every segmented control
 * in v4 (Flow, Alignment, Background type, etc.). Matches Figma vocabulary —
 * opaque pill, subtle shadow, primary text. NOT brand color.
 */
export const SEGMENT_ACTIVE_CLASSES =
    'data-[state=on]:bg-background-active dark:data-[state=on]:bg-[#3A3A3A] data-[state=on]:text-foreground-primary data-[state=on]:shadow-sm aria-pressed:bg-background-active dark:aria-pressed:bg-[#3A3A3A] aria-pressed:text-foreground-primary aria-pressed:shadow-sm';

/** Inactive segmented item: tertiary text, subtle hover. */
export const SEGMENT_INACTIVE_CLASSES =
    'text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/5';

/** Small group-head action button (22×22). */
export const ICON_BTN_SM_CLASSES =
    'inline-flex h-[20px] w-[20px] items-center justify-center rounded-[5px] text-foreground-tertiary hover:bg-background-secondary dark:hover:bg-[#2F2F2F] hover:text-foreground-primary transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground-brand/40';

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
