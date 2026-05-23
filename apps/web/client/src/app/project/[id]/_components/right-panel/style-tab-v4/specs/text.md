# Text section — locked spec (variant A v2)

Approval source: `~/.gstack/projects/Ludvig-Hedin-Weblab/designs/text-panel-20260522-235349/approved.json`
Mockup: `variant-A-v2.html` in the same directory.

## Groups (top to bottom)

### 1. Style

Label: "Style"

`StyleChip` — a single-row picker. Left: 22×22 neutral badge with
"Aa" rendered in the active font. Center-left: name (current text-
style name, or `Add text style…` muted placeholder). Right:
chevron-down.

Click opens the existing `StyleChipPicker` Radix popover. Source:
`editorEngine.tokens.textStylesForSelected()` (already exists in v3).

### 2. Content

Label: "Content"

`ContentField` textarea — 56px min height, radius 8, dark fill
`#101010`, blue focus border. ⌘+Enter commits, Escape reverts.
Reuse v3 logic verbatim.

### 3. Color

Label: "Color"

`ColorRow` primitive — grid `24px 1fr 56px auto auto`:

| Slot | Width | Content |
|---|---|---|
| Swatch | 20×20 px chip | Current color, radius 5 |
| Hex | flex | Tabular-nums, 12.5px |
| Alpha | 56px right-aligned | `100%` tabular, secondary color, left-divider |
| Eyedropper | 22×22 | Lucide pen-with-drop icon |
| Connect | 22×22 | Linked diamonds icon (color-token picker) |

Connect button opens a popover sourced from
`editorEngine.tokens.colorsForSelected()` (extend the v3 textStyles
pattern for colors — needs a colors collector on the tokens store).

### 4. Font

Label: "Font"

`FontHeroRow` — 36px tall, grid `32px 1fr auto`:

| Slot | Content |
|---|---|
| Preview | 26×26 rounded chip with `Aa` in current font + weight |
| Name | "Inter" or current font-family |
| Chev | chevron-down opens font picker |

Below: two `pair-row` grids.

Row 1: Weight (label-inline + chev select), Size (T glyph + value
+ unit pill).

Row 2: Line-height (two-lines-double-arrow glyph + value + unit
pill), Letter-spacing (two-As-double-arrow glyph + value + unit pill).

Unit pills include chevron-down to signal selector.

### 5. Alignment

Label: "Alignment"

`AlignmentSegment` — 4-button segmented (Left / Center / Right /
Justify). Existing v3 IconToggleField with refined SVGs. Active
state uses muted grey.

### 6. Case & Decoration

Label: "Case & Decoration"

`pair-row`:
| Left | Right |
|---|---|
| Case select — `aA` mixed-glyph + value + chevron | Decoration select — `T̲` underline-T glyph + value + chevron |

Case picks: `none`, `uppercase`, `lowercase`, `capitalize`.
Decoration picks: `none`, `underline`, `line-through`,
`overline`.

## Icon SVG library — must match v2 mockup

All glyphs use stroke 1.5, `linecap="round"`, `linejoin="round"`.

| Glyph | SVG paraphrase |
|---|---|
| Size (T) | `M 4 4 H 12 / M 8 4 V 13 / M 6 13 H 10` (serif T) |
| Line-height | top + bottom horizontal lines, middle ↕ double arrow |
| Letter-spacing | two "A" triangles + horizontal ↔ arrow underneath |
| Case (aA) | small-a triangle + lowercase-a circle-stem |
| Decoration (T̲) | T glyph + horizontal underline below |
| Connect | two rotated rounded-rect "tokens" linked by short diagonal |
| Eyedropper | Lucide pen-with-drop path |
| Text-align L/C/R/J | 3 horizontal lines of varying widths anchored L/C/R or full |

## Primitive needs

| Primitive | Notes |
|---|---|
| `StyleChip` | New — reuses `StyleChipPicker` popover |
| `ContentField` | Copy from v3 unchanged |
| `ColorRow` | New — see Color group spec above |
| `FontHeroRow` | New — wraps `FontField` popover |
| `LabeledNumberInput` | Generic — used by Weight, Size, Line, Letter (variant of `IconNumberInput`) |
| `LabeledSelectInput` | Generic — used by Case, Decoration, Weight (variant of `SelectField`) |
| `AlignmentSegment` | Reuses `IconToggleField` with refined SVG set |

## Removed vs v3

- Text shadow row moved to per-section Advanced popover.
- Font-style (italic) moved to per-section Advanced popover.
- No more separate "Style" expander vs "Custom" — the Font group
  always shows; advanced popover (font-style / shadow /
  font-variant) is opened by the section header's right action.
