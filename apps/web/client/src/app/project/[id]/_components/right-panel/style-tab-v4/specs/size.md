# Size section — locked spec (variant B, mode-driven)

Approval source: `~/.gstack/projects/Ludvig-Hedin-Weblab/designs/size-panel-20260522-234824/approved.json`
Mockup: `variant-B.html` in the same directory.

## Groups

### 1. Dimensions

Label: "Dimensions"

Row layout: `1fr 28px 1fr` grid.

| Cell | Component |
|---|---|
| Left | `ModeNumberCell` — axis-glyph (W) + value + mode pill (right) |
| Center | `LinkAspectButton` — chain icon, 28×30, toggles `aspect-ratio` lock |
| Right | `ModeNumberCell` — axis-glyph (H) + value + mode pill |

`ModeNumberCell` shape:
- Container 30px tall, radius 8, `bg-input`.
- `grid-template-columns: 30px 1fr auto`
- Axis-glyph slot: 30px, vertical divider `border-right rgba(232,232,232,0.04)`
- Value area: numeric input OR keyword display, font-variant-numeric tabular
- Mode pill: 22px tall, radius 5, `bg-foreground/5`, picks: `px`, `%`, `vh`, `vw`, `auto`, `hug`, `fit`, `fill`

Mode keyword writes:
| Keyword | CSS write |
|---|---|
| `px` / `%` / `vh` / `vw` | numeric + unit |
| `auto` | `auto` keyword (kills any numeric) |
| `hug` | `fit-content` |
| `fit` | `fit-content` |
| `fill` | `100%` |

When a keyword is selected, the value-area renders the keyword name
(e.g. "Hug") instead of the numeric input. Clicking the value-area
swaps back to numeric mode (resets to last numeric).

Link-aspect button: when active (lock engaged), editing W
auto-updates H proportionally via `useStyleBatchSetter`. Stores the
locked ratio in component state.

### 2. Constraints

Label: "Constraints"

Two `pair-row` grids (each `1fr 1fr` gap 6px):

| Row | Left field | Right field |
|---|---|---|
| 1 | `Min W` label-inline + value + unit | `Min H` label-inline + value + unit |
| 2 | `Max W` label-inline + value + unit | `Max H` label-inline + value + unit |

Fields use existing `IconNumberInput` minus the icon, with the
label rendered inline left at `text-[11px] text-foreground-secondary`.

Empty state shows `∞` placeholder in `text-muted-foreground`.

### 3. Aspect & Fit

Label: "Aspect & Fit"

`pair-row` grid:

| Left | Right |
|---|---|
| Aspect input — frame-rect glyph + `16 / 9` typed value | Fit select — image-square glyph + `Cover` value + chevron unit pill |

Aspect input accepts:
- Free text `16/9`, `4/3`, `1.5`, `1.6180`
- Parser: splits on `/` and computes numeric ratio for CSS
  `aspect-ratio`. Reuses parse logic from v3 `NumberField` minus
  the `keyword` path.

Fit picks: `cover`, `contain`, `fill`, `none`, `scale-down`.

### 4. Behavior

Label: "Behavior"

`pair-row`:

| Left | Right |
|---|---|
| `Grow` label-inline + numeric value | `Overflow` label-inline + select value + chevron unit pill |

Overflow picks: `visible`, `hidden`, `auto`, `scroll`, `clip`.

`Grow` writes `flex-grow` numeric. Common values: 0, 1, 2.

## Reused / new primitives

| Primitive | Origin |
|---|---|
| `GroupShell` | new in `layout.md` |
| `ModeNumberCell` | **NEW for v4** — extends `IconNumberInput` with axis-glyph + mode-pill keyword UX |
| `LinkAspectButton` | **NEW** — Radix toggle, chain icon |
| `IconNumberInput` | spec in `position.md` |
| Inline-label variant of `IconNumberInput` | small variant — see `LabeledNumberInput` |

## Removed vs v3

- Box-sizing → moves to per-section Advanced expander.
- The dedicated `GrowRow` and `OverflowRow` are merged into the
  `Behavior` group — both become standard `LabeledNumberInput` /
  `LabeledSelectInput` instances.
