# Layout section — locked spec (merged-v3)

Approval source: `~/.gstack/projects/Ludvig-Hedin-Weblab/designs/layout-panel-20260522-222315/approved.json`
Mockup: `variant-merged-v3.html` in the same directory.

## Visual grammar (applies to ALL v4 sections)

- **Group label**: sentence-case, **11px / weight 400**,
  `color: var(--foreground-secondary)`. Sits above the input(s) it
  describes. 6px gap to inputs below.
- **Group header right slot**: icon-only `icon-btn-sm` (22×22,
  radius 6, transparent at rest, hover lifts to `bg-input`).
- **Icons**: lucide-style, stroke 1.5, `stroke-linecap="round"`,
  `stroke-linejoin="round"`. 13–14px inside controls.
- **Section title**: 14px / 500, top-aligned with right action
  cluster.
- **Section vertical gap between groups**: 12px.
- **Within-group label → input gap**: 6px.

## Rows (top to bottom)

### 1. Flow (segmented, 32px tall)

Four icon buttons in one segmented container, no labels on
buttons:

| Idx | Tooltip | Icon SVG (paraphrased) |
|---|---|---|
| 0 | Block | rect + horizontal divider |
| 1 | Flex column | two stacked rounded bars |
| 2 | Flex row | two side-by-side rounded bars |
| 3 | Grid | 2×2 rounded squares |

Active = muted grey `bg-selected` (#262626 dark) + shadow-sm.
Hover (inactive) = `bg-foreground/4`. Tooltip top.

### 2. Alignment + Gap row (130px pad + flex 1)

Two columns. Each has its own label above:

| Label | Control |
|---|---|
| Alignment | 78×130 align pad (3×3 dot grid; active dot = 14px horizontal bar) |
| Gap | 30px IconNumberInput with stacked-rect-with-divider glyph |

Align pad behavior: clicking a dot writes the equivalent
`justify-content`+`align-items` pair via `useStyleBatchSetter`.
9 positions map to a 3×3 grid (start/center/end × start/center/end).
A 10th implicit "between" state lives in a small popover behind the
group header — out of scope for the locked spec.

### 3. Padding group

Group head: label "Padding" left, per-side icon button (22×22)
right. Per-side button glyph = outer square + inner nested
square.

Two inputs side-by-side (1fr / 1fr) below the label:

- **H padding**: icon = square + 2 inner vertical bars. Writes
  `padding-left` + `padding-right` (batched).
- **V padding**: icon = square + 2 inner horizontal bars. Writes
  `padding-top` + `padding-bottom` (batched).

Per-side button → opens a TRBL detail popover (Top / Right /
Bottom / Left individual inputs). Default state when all four
sides are equal: collapses back to H/V pair.

### 4. Margin group

Identical shape + behavior to Padding, but every icon uses a
`stroke-dasharray="2 1.5"` dashed outer square to signal the
"outside the box" mental model.

## Removed from this section vs v3 brief

- **Justify + Align as separate icon rows** — replaced by the
  single 3×3 align pad (one click sets both axes).
- **Wrap toggle from main view** — moves to advanced popover
  (group header right slot — chevron-down menu). Wrap is rare in
  flex layouts; the popover keeps the main panel quiet.
- **Direction (flex-direction reverse)** — moves to advanced
  popover. Standard direction is implied by the Flow choice (col
  vs row).

## Primitive needs (new in v4)

- `GroupShell` — label + optional right-side action(s), wraps
  any control.
- `FlowSegment` — segmented 4-button icon-only control. Variant
  of `IconToggleField` with bigger touch targets.
- `AlignPad` — 3×3 dot grid that emits a `(justify, align)` tuple.
- `IconNumberInput` — already specced in `position.md`. Reused
  here for Gap, H/V padding, H/V margin.
- `IconButtonSm` — 22×22 transparent icon button for group-head
  actions.
- `PerSideTrblPopover` — Radix Popover with 4 IconNumberInputs.
