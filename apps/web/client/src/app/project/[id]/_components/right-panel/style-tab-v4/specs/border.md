# Border section — locked spec (Variant A · Stroke + Radius half)

Source: `~/.gstack/projects/Ludvig-Hedin-Weblab/designs/overlays-panel-20260523-000316/approved.json`
Mockup: `variant-A.html` (Stroke + Radius groups only — drop the
Fill group which moves to the new `Background` section).

The v3 "Overlays" section is renamed and split:
- **`Border`** (this spec) = Stroke + Radius.
- **`Background`** (separate spec — to be drafted) = background-
  color + background-image + bg-size + bg-position + bg-repeat.

## Groups

### 1. Stroke

Label: "Stroke"

Group head right actions:
- Per-side button (square outline icon) → opens TRBL popover for
  per-side stroke widths.
- Add button (+) → adds a second stroke layer (Figma multi-stroke
  parity).

Body:

- `ColorRow` — same shape as Text/Color: 24px swatch + hex + alpha
  + visibility + eyedropper + connect-to-token.
- `pair-row` below:
  - **Style** select — solid-line glyph + value + chevron. Picks:
    `solid`, `dashed`, `dotted`, `double`, `groove`, `ridge`,
    `inset`, `outset`, `none`.
  - **Width** numeric — filled-rect glyph + value + `px` unit pill.

CSS writes: `border-style`, `border-width`, `border-color`. When
per-side popover is open, writes individual `border-{side}-*`
properties.

### 2. Radius

Label: "Radius"

Group head right actions:
- Per-corner button (square-with-4-dots icon) → opens 4-corner
  popover for individual `border-{tl|tr|bl|br}-radius`.

Body:

- `radius-row` grid `1fr 28px`:
  - `IconNumberInput` — rounded-corners glyph (4-corner outlines)
    + value + `px` unit pill.
  - Per-corner expand button.

CSS writes: `border-radius` when linked; individual corner
properties when expanded.

## New primitives

| Primitive | Purpose |
|---|---|
| `ColorRow` | Already specced in `text.md` — reused. |
| `StrokeStyleSelect` | Wraps `LabeledSelectInput` with the solid-line glyph + the 9-option list. |
| `PerSideTrblPopover` | Already specced in `layout.md` — reused for stroke per-side. |
| `PerCornerPopover` | NEW — Radix Popover with 4 `IconNumberInput` cells (TL / TR / BL / BR) + a "link all" button. |

## Removed vs v3

- Per-side border-width inputs from the v3 Advanced expander move
  into the `PerSideTrblPopover`.
- All background controls move to the new `Background` section
  spec (not in this file).
