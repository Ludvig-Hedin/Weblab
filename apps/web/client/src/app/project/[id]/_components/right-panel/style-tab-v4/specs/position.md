# Position section — locked spec (variant C, super-tight)

Approval source: `~/.gstack/projects/Ludvig-Hedin-Weblab/designs/position-panel-20260522-221618/approved.json`

## Layout

Single column. Pad is the small visual anchor (64×64). Section height
~150px when expanded. When `position === 'static'`, only Type select
shows.

```
┌─ Position ────────────────────────── ⋯ ┐
│                                         │
│              ┌─────────────────┐        │
│              │ T   -3          │        │  (top input pinned, blue border)
│              └─────────────────┘        │
│                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐    │
│  │ L Auto │  │  ▭     │  │ R Auto │    │  (L / pad / R)
│  └────────┘  │        │  └────────┘    │
│              └────────┘                 │
│              ┌─────────────────┐        │
│              │ B   Auto        │        │
│              └─────────────────┘        │
│                                         │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ Absolute  ▾ │  │ 0      auto  │    │  (Type · Z-index)
│  └──────────────┘  └──────────────┘    │
│  ┌──────────────────┐  ┌────┐  ┌────┐  │
│  │ ⟲  0          °│  │ ⇆  │  │ ⇅  │  │  (Rotate · flip-h · flip-v)
│  └──────────────────┘  └────┘  └────┘  │
└─────────────────────────────────────────┘
```

## Dimensions

| Element | Size |
|---|---|
| Pad | 64×64 px, radius 8 |
| Inputs (T/L/R/B) | 24px tall, radius 8, font 11.5px |
| Inline glyphs (T/L/R/B inside input) | 9px, weight 500, color `--foreground-tertiary` |
| Type select, Z-index, Rotate, Flip buttons | 24px tall, radius 8 |
| Section vertical padding | `pt-1 pb-3 px-3` |
| Grid column gap | 6px |
| Grid row gap | 4px |

## Behavior

- Empty input → `Auto` placeholder in `--muted-foreground`.
- Typed value → input shows the value; corresponding side of the
  center pad highlights with a 1.5px brand-blue mark
  (`--foreground-brand` at full opacity).
- Click any side of the pad → toggles that side between `0` and
  `auto`. Reuses v3 `useStyleBatchSetter`. Focus jumps to the
  side's input after the toggle.
- Pad center → click the element-icon to clear ALL sides at once
  (`top:auto; right:auto; bottom:auto; left:auto` batched).
- Z-index pill toggles between numeric mode and `auto` — uses the
  NumberField `keywords` prop already added to v3.
- Rotate is a NumberField with `defaultUnit='deg'` and a single
  built-in degree suffix.
- Flip-h / flip-v are IconToggleField buttons (toggle).
  Implementation: write `transform: scaleX(-1)` (flip-h) /
  `scaleY(-1)` (flip-v); compose via the existing transform
  composition helper in `@weblab/parser` if available, else fall
  back to inline transform.
- Whole section collapses to ONLY the Type select when
  `position === 'static'`.

## Active state

Muted grey, NOT brand:
- segmented item / Z-index pill active: `bg-background-active`
  (light) / `dark:bg-[#262626]` + `shadow-sm` +
  `text-foreground-primary`
- inactive icon button text: `text-foreground-tertiary`
- inactive icon button hover: `text-foreground-secondary` +
  `bg-foreground/5`

Brand-blue reserved for: the pinned-side mark on the pad +
focus border on inputs.

## Inputs primitive — `IconNumberInput` (new)

Used by every numeric here (T/L/R/B/Rotate/Z-index). Shape:

```tsx
<IconNumberInput
  glyph="T"                    // string or ReactNode rendered left
  value={top.value}
  onCommit={setter.set}
  placeholder="Auto"
  units={['px','%']}
  keywords={['auto']}
  allowKeywords
  ariaLabel="Top offset"
/>
```

- Glyph slot accepts a single-letter string OR a lucide icon node
  (e.g. for non-position rows like Rotate that use `⟲`).
- Inline suffix shows the current unit when a numeric value is
  present; hidden for keywords.
- 24px tall, radius 8, dark fill `#101010`, transparent border at
  rest, brand-blue focus border, no ring.

## Reused

- `useStyleValue` + `useStyleSetter` + `useStyleBatchSetter` —
  copy unchanged from v3/hooks → v4/hooks.
- v3 `applyAlignment` pairing logic — adapt for pin-pad toggle.
- v3 `Section` accordion shell — keep, drop set-count badge.
- v3 `PropertyControl` — keep, but feed unset `data-style-set`
  so the muted-value CSS in `globals.css` still applies.
