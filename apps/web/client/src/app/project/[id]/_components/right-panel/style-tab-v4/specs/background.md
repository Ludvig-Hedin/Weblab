# Background section — locked spec (Variant A v2)

Approval source: `~/.gstack/projects/Ludvig-Hedin-Weblab/designs/background-panel-20260523-001105/approved.json`
Mockup: `variant-A-v2.html`.

Section title: **Background** (renamed from v3 "Overlays").

## Groups

### 1. Type

Label: "Type"

`BackgroundTypeTabs` — 32px tall, 4-button segmented:

| Idx | Tooltip | Glyph |
|---|---|---|
| 0 | Solid | Filled rounded square (10×10 inside 16) |
| 1 | Gradient | Rounded square with SVG diagonal fade fill |
| 2 | Image | Rounded square + sun + mountain triangles |
| 3 | None | Empty rounded square + diagonal slash |

Active = muted grey, matches other segmented controls.

Selecting a type:
- **Solid** → keeps the Color group, clears `background-image`.
- **Gradient** → swaps the Color group for `GradientStopsEditor`
  (out of scope for this spec — opens a popover for now).
- **Image** → swaps for `ImagePicker` (URL field + size + position
  + repeat).
- **None** → clears `background-color` AND `background-image`.

### 2. Content area (varies by Type)

When Type=Solid: a single `ColorRow` (same primitive as Text and
Border):
- 20×20 swatch (radius 5)
- Hex (tabular)
- Alpha % (tabular, right-divider)
- Visibility eye
- Eyedropper (classic dropper SVG)
- Connect-to-token (two linked rounded-rect tokens)

When Type=Image: `ImagePicker` (TBD):
- URL `IconTextInput` with image-mini glyph prefix
- Size select (`cover` / `contain` / custom)
- Position 2-axis input or 3×3 mini-pad (reuses align-pad pattern
  from Layout)
- Repeat segmented (no-repeat / repeat / repeat-x / repeat-y)

When Type=Gradient: `GradientStopsEditor` (TBD) — opens in a
popover from a single representative row. Multi-stop editor is
v2-scope; first cut shows a 2-stop linear gradient with start
color + end color + direction.

When Type=None: section content is empty.

## Icon SVG library (additions)

| Glyph | SVG paraphrase |
|---|---|
| Solid type | `<rect 3 3 10 10 rx=2 fill=currentColor>` |
| Gradient type | rect + linearGradient stop 0=1.0 stop 1=0.2 |
| Image type | rect + circle (sun) + polyline mountain |
| None type | rect + diagonal line slash |
| Visibility (eye) | smooth eye outline + 2px pupil |
| Eyedropper | dropper tip path + drag-line down-left |
| Connect-token | two 6×4 rounded-rect tokens linked by 4-wide bar |

All stroke 1.5, `linecap="round"`, `linejoin="round"` except
filled glyphs (Solid, Connect tokens) which are `fill="currentColor"`.

## New primitives

| Primitive | Notes |
|---|---|
| `BackgroundTypeTabs` | New — reuses `IconToggleField` 4-option pattern with the 4 type glyphs |
| `ColorRow` | Already specced in `text.md`. Reused unchanged. |
| `ImagePicker` | NEW — opens in a popover from a representative row when Type=Image |
| `GradientStopsEditor` | NEW — popover with linear gradient builder; minimal first cut |

## Deferred to a future iteration (v4.1)

Multi-layer stacking (Variant C from the design-shotgun board) is
shipped later. Architecturally:
- `background` CSS is a shorthand that allows multiple comma-
  separated layers. The v4.1 list UI will mirror that.
- Each list row writes one slot in the comma list.

## Removed vs v3

- v3 `Overlays` section is gone. Its Fill group becomes this
  Background section; Stroke + Radius move to the new `Border`
  section (`border.md`).
- v3 advanced expander rows (`background-image`, `background-size`,
  `background-position`, `background-repeat`) move INTO this
  section when Type=Image (no longer hidden in a separate
  expander).
