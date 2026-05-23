# Style Panel v4 — Design Brief

> Locked from brainstorming session 2026-05-22. Source of truth for
> Phase 4 build. Updated as `/design-shotgun` runs lock per-section
> patterns.

## Persona

**Designer-first.** Visual user tweaking spacing, color, type. Lives in
the panel. Tailwind class chips are present but secondary — designer
edits visual properties, system writes class names underneath.

Implication: icon-led, low text density, big swatches, link toggles
that match Figma/Framer/Webflow muscle memory.

## Locked Decisions

| Topic | Decision |
|---|---|
| Approach | `style-tab-v4/` + `NEXT_PUBLIC_STYLE_PANEL_V4` flag |
| Density | Figma-tight, ~24–28px rows |
| Active state | Muted grey, NOT brand color |
| Dark/light | Both, dark primary |
| Row vocabulary | **A3** — icon prefix inside input, no left label gutter |
| Position offsets | **Webflow/Framer pin-corners pad** (see "Position section" below) |
| Layout Flow | **C1** — wide 4-icon segmented, no labels |
| Size | **D1** — paired W/H + link + auto/hug/fit/fill keyword shortcuts; add aspect-ratio + lock |
| Color row | Unified swatch + hex + alpha % + eyedropper + visibility + **connect-to-style** icon |
| Default expanders | Effects, Transforms, Transitions, Cursor, Advanced, Overlays>Stroke+below, Layout>Float/Clear |
| Kept visible | **Text** advanced rows stay open by default; **Size** advanced (Min/Ratio/Fit) stays open by default |
| Long content | Horizontal scroll inside input |
| Section set-count badge | Hide entirely |
| Per-row "is set" dot | Hide entirely (declutter; rely on bolder label color for set rows) |

## Section Specs (locked)

### Position section — Webflow/Framer pin-corners pattern

When `position === 'static'`: render only the Type select. Nothing
else.

When `position` is anything else: render the **pin pad**:

```
                ┌────────┐
                │  T   - │   T input
                └────────┘
   ┌──────┐    ┌─────────┐    ┌──────┐
   │ L  -│    │   ┌─┐   │    │ R  -│   pin-pad center
   └──────┘    │   └─┘   │    └──────┘
                │ ─┼─ ─┼─ │   center box has 4 hit-zones (T/R/B/L)
                └─────────┘   that toggle each side between auto/0
                ┌────────┐
                │  B   - │   B input
                └────────┘

   Type   [ Absolute ▾ ]
   Rotate [ ⟲ ]    Z-index [ 0 / auto ▾ ]
```

Behavior:

- Center pad is a 4-zone clickable diamond. Clicking the T zone
  toggles the `top` value between `0` and `auto` (and focuses the
  T input). Same for R/B/L.
- Empty / unset = "Auto" placeholder text. Typing a value pins.
- A pinned side highlights its half of the center pad with the
  brand-blue line (matches Framer / first reference screenshot).
- Pin-pad lives in a column with T above, L/R flanking, B below.
- Right of the pad is the Rotate icon button (opens a popover with
  rotate input) + flip-horizontal / flip-vertical icon buttons.
- Z-index sits below the pad as one row: numeric input + auto
  keyword toggle on the right (already shipped in v3 NumberField
  via `keywords={['auto']}`).
- Reuse `setMultiple` for paired writes (e.g. pin-left sets
  `left:0; right:auto`). Mirror v3's `applyAlignment` pairing.

### Layout section

```
Flow:    ┌──────┬──────┬──────┬──────┐
         │ ▣◐  │ ▣↕  │ ▣↔  │ ⋮⋮  │   Block | Col | Row | Grid
         └──────┴──────┴──────┴──────┘

(visible only when Flex)
Direction  [ → ↓ ← ↑ ]   icon-segmented
Justify    [ Start ▾ ]
Align      [ Stretch ▾ ]
Wrap       [ wrap | no ]
Gap        [ ↔   8       px ▾ ]   icon-prefix A3

Padding    [ ⊞   8       px ▾ ]   linked TRBL; ▾ expands to per-side
Margin     [ ⊟   0       px ▾ ]   linked TRBL; ▾ expands to per-side

(Float / Clear in Advanced sub-expander)
```

### Size section

```
[ ⤢ W  132   px ▾ ]  🔗  [ ↕ H  46    px ▾ ]    paired + link

[ Max W  ∞  px ▾ ]      [ Max H  ∞   px ▾ ]
[ Min W  0  px ▾ ]      [ Min H  0   px ▾ ]    (visible by default)

Aspect [ 16/9     ▾ ]   🔒 lock-to-WH toggle
Fit    [ Cover ▾ ]
Grow / Overflow   [ ⇲ │ 👁 ⊘ ✂ ↕ ↔ ]

W/H keyword shortcuts in the unit pill (alongside px/%):
   auto · fit-content · max-content · min-content · fill (100%)
   hug → maps to `fit-content` semantically
```

The link button between W and H, when active, mirrors edits across
both (using `useStyleBatchSetter`).

### Text section

```
Style    [ ✨ Add Text Style ▾ ]   token chip picker
Content  [ multi-line textarea, h-auto ]
Color    [ ■ #F9F9F9   100% ◇ 👁 🔗 ]   unified color row + connect

Font     [ Aa  Inter           ▾ ]   font preview swatch inside
Weight   [ 400 ▾ ]    Size   [ T 16  px ▾ ]
Line     [ A↕ 1.5 ▾ ]    Letter [ A↔ 0 ▾ ]
Align    [ ⊢ ┼ ⊣ ⫻ ]                  segmented icons
Case     [ Tt ▾ ]    Decor [ T̲ ▾ ]
Shadow   [ TextField w/ icon prefix ]
```

Text advanced stays expanded by default. Designers edit type often.

### Overlays section

```
Fill    [ ■ #FF0000  100% ◇ 👁 🔗 + ]    color row + add
Stroke  collapses-by-default expander:
   ┌──────────────────────────────────┐
   │ Style    [ Solid ▾ ]             │
   │ Width    [ ⤢ 1   px ▾ ]          │
   │ Color    [ ■ #1F1F1F  100% ◇ ]   │
   │ Sides    [ T R B L per-side ]    │
   └──────────────────────────────────┘
Radius  [ ⤢ 0     px ▾ ]   ▾ expands to 4-corner   ↖↗↙↘
```

### Element section

Class chips stay blue (user-authored tokens). Tag/ID/Link use A3
icon-prefix input.

```
[ # class-1  class-2  +add ]   blue chips, brand color
[ < div                 ▾ ]   Tag select with `<>` icon prefix
[ # hero-section          ]   ID input with # icon prefix
[ → /pricing             ]   (only when tag = a) Link with → icon prefix
```

### Color row (unified everywhere)

```
┌──┬─────────────┬────────┬───┬───┬───┐
│■ │ #F9F9F9     │ 100 %  │ ◇ │ 👁│ 🔗│
└──┴─────────────┴────────┴───┴───┴───┘
swatch  hex          alpha   eyedropper visibility connect-to-style
```

- **Connect-to-style** icon opens a popover with the project's color
  tokens (reuse `tokens.applicableTokensFor('color')` from v3's
  StyleChipPicker pattern). Selecting a token writes the Tailwind
  class instead of inline color.
- Visibility toggles the property off without losing its value
  (sets `display: none` for backgrounds? or just unsets the property
  — TBD per row; default: toggle the property between "set" and
  "unset" preserving the draft hex in component state).

### TRBL inputs — comma syntax

User can type `8, 16, 12, 4` (CSS shorthand) and the input parses
it into top/right/bottom/left. Reuse v3's `TrblGrid` shorthand
support (already there).

## Edge Cases Handled

- **Long class chips**: max-width 120px, truncate with ellipsis,
  full value in tooltip (already in v3 ChipInput).
- **Hex + alpha overflow**: hex uses `text-mini`, alpha cell shrinks
  first; eyedropper and visibility stay at fixed 16px buttons.
- **Wide values like `calc(100vh - 40px)`**: horizontal scroll
  inside the input only — input width stays fixed.
- **Conditional flex sub-controls**: collapse with smooth height
  animation when `display` changes from flex.
- **No element selected**: existing empty state stays.

## New Primitives Inventory

- `IconNumberInput` — icon prefix + numeric + unit/keyword pill
- `IconTextInput` — icon prefix + text input
- `PairRow` — 2-col grid with optional center link button
- `ColorRow` — swatch + hex + alpha + eyedropper + visibility + connect
- `PinPad` — Webflow/Framer absolute-position pad with center 4-zone
- `LinkedTrblBox` — linked single + chevron-expand to 4 sides/corners
- `WideIconSegment` — Flow-style wide icon-only segmented
- `SectionShell` — header + right-action slot, no set-count badge

## Reused Behaviors (unchanged from v3)

- `useStyleValue` / `useStyleSetter` / `useStyleBatchSetter` hooks
- `PropertyControl` reset / context menu / write-target pipeline
- ChipInput keyboard model
- ContentField ⌘-Enter
- CustomExpander
- All MobX engine writes via `editorEngine.style.*`

## Open spec questions

- **Connect-to-style on color rows**: where exactly does the popover
  source tokens from? — Confirm `editorEngine.tokens.applicableTokensFor('color')`
  returns color tokens (the v3 picker already does this for text styles).
  Need to verify the color-token equivalent exists or extend it.
- **Hug/Fill keywords**: confirm Tailwind/CSS mapping
  (hug→`fit-content`, fill→`100%`). Document in spec.

## Design grammar reference card (Phase 2)

### Icon library + sizes

- **Library**: `lucide-react` (already shipped in `@weblab/ui/icons`).
  Keep one set, never mix.
- **Sizes**:
  - Input prefix icon: **12px** (`size-3`) — sits inside a 24–28px input,
    needs to feel like a hint not a heavy glyph.
  - Section header icon: **14px** (`size-3.5`) at section title row.
  - Action / right-edge icons (eyedropper, eye, +, ⋯): **14px**
    (`size-3.5`).
  - Segmented control icons (Flow, text-align, flex direction): **14px**
    (`size-3.5`).
- **Stroke width**: lucide default (1.5). Don't customize — it ships
  visually balanced.
- **Custom icons** for Weblab-specific actions (W/H prefix letter,
  X/Y/Z axis letter, padding box glyph): inline SVG or text-letter
  glyphs styled with `text-foreground-tertiary text-[10px] font-medium`
  inside the input prefix slot. Reserve lucide for true icons.

### Spacing scale

- **Section vertical padding**: `py-3` (12px top + bottom inside the
  accordion content).
- **Section header strip**: `h-9` (36px), `px-3`.
- **Row vertical padding**: `py-0.5` (2px). Row height effectively
  28–30px including input.
- **Row horizontal padding**: `px-3` (matches section header).
- **Gap between rows in a section**: 4px (`gap-1`).
- **Gap between paired inputs (W/H, X/Y/Z)**: 6px (`gap-1.5`).
- **Icon-to-text gap inside input**: 6px (`gap-1.5`) — prefix icon,
  6px, then the value.
- **Section divider**: a single `border-t border-border/40`
  between accordion sections; no extra margin.

### Type ramp

| Role | Class | Size / Weight |
|---|---|---|
| Section title | `text-sm font-medium` | 14px / 500 |
| Input value | `text-mini` (existing token) | 12.5px / 400 |
| Unit suffix / keyword pill | `text-[11px] text-muted-foreground` | 11px / 400 |
| Caps label (rare — only above input when no icon prefix fits) | `text-[10px] uppercase tracking-wide text-foreground-tertiary font-medium` | 10px / 500 |
| Prefix glyph (X/Y/W/H letter) | `text-[10px] font-medium text-foreground-tertiary` | 10px / 500 |

Numeric inputs use **tabular figures** (`font-variant-numeric:
tabular-nums`) so values don't shift when digits change.

### Border + radius

- **Input / chip container radius**: **10px** (already on v3 after
  the last round).
- **Inner segmented item radius**: 9px (1px inset from container).
- **Color swatch radius**: 6px (smaller, reads as a sample chip).
- **Border at rest**: `border border-transparent` — no visible
  border on inputs. Surface contrast comes from the dark fill
  (`#101010`) against the panel background (`#1a1a1a`).
- **Focus border**: `border-foreground-brand` 1px. No ring. Border
  swap is keyboard-only via `focus-visible:`; mouse click is silent.
- **Section divider**: `border-t border-border/40` (subtle, ~40%
  opacity).

### Muted-grey active state (exact values)

The Figma "selected segment" look. Replaces brand-blue.

| Mode | Background | Text | Shadow |
|---|---|---|---|
| Light | `bg-background-active` (#e6e6e6) | `text-foreground-primary` | `shadow-sm` |
| Dark | `dark:bg-[#262626]` | `dark:text-foreground-primary` | `dark:shadow-sm` |

Inactive segment in dark: `text-foreground-tertiary` (rgba(232,232,232,0.4)).
Inactive segment hover: `hover:text-foreground-secondary` +
`hover:bg-foreground/5`.

### Hover states

- **Input**: dark fill lifts from `#101010` → `#181818`. Border stays
  transparent.
- **Color swatch**: subtle 1px brightness lift on the swatch (Tailwind
  `brightness-110`). Don't grow.
- **Segmented item (inactive)**: text → `foreground-secondary`,
  background → `foreground/5`.
- **Icon-only button (eyedropper, eye, ⋯)**: background → `foreground/5`,
  text → `foreground-primary`. Square hit area, 24×24px (`h-6 w-6`).
- **No row hover fill** — hovering a row doesn't tint the whole row.
  Only individual controls react.

### Disabled / loading states

- **Disabled control**: `opacity-50 pointer-events-none select-none`
  applied to the wrapper. Cursor reverts to default. Don't change
  bg or text color separately — opacity alone reads correctly.
- **Loading section** (e.g., during `getActionElement` await):
  same opacity treatment + `aria-busy="true"` on the wrapper.
- **Loading skeleton**: not used here. The async fetch is fast (<200ms)
  so dimming is preferred over skeletons.

### Tooltip patterns

- **Placement**: `side="top"` for icon-only segmented items (so
  fingers/cursors below don't occlude). `side="left"` for right-edge
  reset / context icons (panel scrolls vertically — left-side tooltip
  reads against open space). Inputs themselves do not get tooltips.
- **Delay**: `delayDuration={400}` (matches v3's `TooltipProvider`
  default in panel — keep consistent so muscle memory holds).
- **Content size**: `text-mini`, single line where possible.
- **Showed on icon-only controls always** — eyedropper, eye,
  connect-to-style, flip-h/v, every Flow segment, every text-align
  segment.

### Transitions

- **Duration**: 150ms for state changes (background, color, opacity).
  Tailwind `duration-150`.
- **Easing**: `ease-out` for color/background swaps. `transition-colors`
  default is fine.
- **Active-press feedback**: `active:scale-[0.97]` on segmented items
  (already in v3). Keep.
- **Section expand / collapse**: Accordion's built-in animation
  (Radix). 200ms `ease-out`. No override.
- **Pin-pad side highlight transitions**: 120ms — feels snappy when
  toggling sides.
- **Reduced motion**: every animation respects
  `@media (prefers-reduced-motion: reduce)` — Tailwind utility
  `motion-reduce:transition-none` on top-level wrappers where it
  matters (segmented controls, pin-pad).

## Next steps

Phase 3 — `/design-shotgun` per section starting with Position
(pin-pad needs visual exploration even though pattern is locked).
