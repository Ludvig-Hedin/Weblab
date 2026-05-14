# Style Panel v2 — Property + Control Inventory

Source of truth for the editor's right-panel **Style** tab as it shipped before the v3 redesign. Used as the parity bar for `style-tab-v3` (gated behind `NEXT_PUBLIC_STYLE_PANEL_V3`).

- Live source: `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v2/`
- Frozen snapshot: `docs/archive/style-tab-v2-snapshot/`
- Mounted at: `right-panel/index.tsx:30-33` (lazy dynamic import inside a `TabsContent`).

## Mount + lifecycle

| Concern | Where |
|---|---|
| Root component | `style-tab-v2/index.tsx` — `StyleTabV2` (`observer`) |
| Tab gating | `right-panel/index.tsx:65-71, 86-92` — auto-switches to "style" on element selection, bounces off in CODE mode |
| Empty state | `style-tab-v2/index.tsx:28-37` — "No element selected" |
| Reset hotkey | `hooks/use-reset-hotkey.ts` — focused-row `Hotkey.RESET_STYLE` clears the `[data-style-property]` ancestor's prop |
| Section state | `hooks/use-section-state.ts` — persisted to `localStorage['weblab:style-panel-v2:open-sections']`; defaults open: `layout`, `spacing`, `typography` |

## Store integration

| Concern | Where |
|---|---|
| Store | `apps/web/client/src/components/store/editor/style/index.ts` — `StyleManager` |
| Read | `useStyleValue(prop)` in `hooks/use-style-value.ts` returns `{ value, source, isSet, writeTarget, override }` from `editorEngine.style.selectedStyle.styles.{defined,computed}` |
| Write | `useStyleSetter(prop)` in `hooks/use-style-setter.ts` calls `editorEngine.style.update(prop, value)`; respects per-property write target (`tailwind` / `custom-class` / `inline`) and per-element override |
| Write target prefs | `apps/web/client/src/components/store/editor/style/preferences.ts` — `WriteTarget`, `ALL_WRITE_TARGETS`, `setWriteTarget`, `setOverride` |

## Shared row primitives (controls/)

| File | Purpose |
|---|---|
| `constants.ts` | `FIELD_BASE_CLASSES` — single source of truth for row geometry (h-30px, rounded-8px, dark fill `rgb(43,43,43)`, border, hover, focus ring); `PROPERTY_LABEL_WIDTH=72`, `PROPERTY_LABEL_OFFSET_CLASS='pl-[84px]'` |
| `property-label.tsx` | Fixed-width gutter label + status dot; alt-click resets |
| `property-control.tsx` | Standard row wrapper: PropertyLabel + slot for editor + hover-revealed reset `X` + right-click context menu (Reset / Copy / Paste / Write target / Override) |
| `text-field.tsx` | Plain text input; commits on blur/Enter, resets on Escape |
| `select-field.tsx` | Radix `Select` styled with `FIELD_BASE_CLASSES` |
| `icon-toggle-field.tsx` | Segmented icon group from `@weblab/ui/toggle-group` (text-align, flex direction, etc.) |
| `slider-field.tsx` | Slider + numeric readout; supports 0..1 ratio rendering as 0..100% |
| `color-field.tsx` | Swatch + hex chip; opens `ColorPickerContent` popover from editor-bar |
| `font-field.tsx` | Font family picker — searches Google + project fonts via `editorEngine.font` |
| `connect-button.tsx` + `connect-token-picker.tsx` | "+" affordance to bind a property to a Color Style / Text Style / Variable token |
| `inline-button.tsx` | Tertiary in-section action ("+ More options", "Hide") |
| `text-style-header.tsx` | Top-of-typography "Apply Text Style" chip |

## Sections + properties

13 sections render in this order. Every property is bound through `PropertyControl` (or a hand-rolled box-model wrapper) so the row context-menu / reset / write-target plumbing applies uniformly.

### `element-header.tsx` — Element Header (always visible, outside accordion)
| Field | Source | Control |
|---|---|---|
| Tag | `actionElement.tagName` | `SelectField` (22 common HTML tags) |
| ID | `actionElement.attributes.id` | `TextField` |
| Class | `actionElement.attributes.className` | Inline chip editor + free input (Backspace/Enter/arrow keys) |
| Default write target | `editorEngine.stylePreferences.defaultWriteTarget` | Element `⋯` dropdown radio group |

### `content.tsx` — CMS Content (conditional: only when element has `data-weblab-list`)
| Field | CSS / source | Control |
|---|---|---|
| Collection | CMS REPEAT binding | `Select` |
| Sort field | CMS REPEAT binding | `Select` |
| Sort direction | CMS REPEAT binding | `Select` (asc/desc) |
| Limit | CMS REPEAT binding | `Input` (number) |
| Filters | CMS REPEAT binding | Multi-clause builder (field/op/value/and-or/add/remove) |

### `layout.tsx` — Layout (icon: `LayoutGrid`)
| Field | CSS prop | Control |
|---|---|---|
| Display | `display` | `SelectField` (8 values: block/flex/inline-flex/grid/inline-grid/inline-block/inline/none) |
| Direction (flex only) | `flex-direction` | `IconToggleField` (row/row-reverse/column/column-reverse) |
| Justify | `justify-content` | `IconToggleField` (start/center/end/space-between/space-around/space-evenly; row vs col icon variants) |
| Align | `align-items` | `IconToggleField` (start/center/end/stretch/baseline; row vs col icon variants) |
| Gap | `gap` | `NumberInput` |

### `spacing.tsx` — Spacing (icon: `SquareDashed`)
| Field | CSS props | Control |
|---|---|---|
| Padding | `padding-{top,right,bottom,left}` | Linked `NumberInput` (auto-expands to per-side when values diverge) |
| Margin | `margin-{top,right,bottom,left}` | Linked `NumberInput` (auto-expands; allows keywords e.g. `auto`) |

### `size.tsx` — Size (icon: `Maximize2`)
| Field | CSS prop | Control |
|---|---|---|
| Width | `width` | `NumberInput` |
| Height | `height` | `NumberInput` |
| Min | `min-width` + `min-height` | Paired `NumberInput`s (W / H) |
| Max | `max-width` + `max-height` | Paired `NumberInput`s (W / H) |
| Ratio | `aspect-ratio` | `NumberInput` (no unit) |
| Fit | `object-fit` | `SelectField` (fill/contain/cover/none/scale-down) |
| Box sizing | `box-sizing` | `SelectField` (border-box/content-box) |
| Overflow X | `overflow-x` | `SelectField` (visible/hidden/scroll/auto) |
| Overflow Y | `overflow-y` | `SelectField` (visible/hidden/scroll/auto) |

### `position.tsx` — Position (icon: `Move`)
| Field | CSS prop | Control |
|---|---|---|
| Type | `position` | `SelectField` (static/relative/absolute/fixed/sticky) |
| Top | `top` | `NumberInput` (only when not static) |
| Right | `right` | `NumberInput` (only when not static) |
| Bottom | `bottom` | `NumberInput` (only when not static) |
| Left | `left` | `NumberInput` (only when not static) |
| Z-index | `z-index` | `NumberInput` (no unit, allows keywords) |
| Float | `float` | `SelectField` (none/left/right/inline-start/inline-end) |
| Clear | `clear` | `SelectField` (none/left/right/both) |

### `typography.tsx` — Typography (icon: `Type`)
| Field | CSS prop | Control |
|---|---|---|
| Font | `font-family` | `FontField` |
| Weight | `font-weight` | `SelectField` (100…900) |
| Size | `font-size` | `NumberInput` |
| Line height | `line-height` | `NumberInput` (units: '', px, rem, em, %) |
| Letter | `letter-spacing` | `NumberInput` |
| Color | `color` | `ColorField` |
| Align | `text-align` | `IconToggleField` (left/center/right/justify) |
| Decoration | `text-decoration-line` | `IconToggleField` (none/underline/line-through) |
| Case | `text-transform` | `IconToggleField` (none/uppercase/lowercase/capitalize) |
| Style | `font-style` | `IconToggleField` (normal/italic) |
| **Advanced (collapsible)** | | |
| Direction | `direction` | `IconToggleField` (ltr/rtl) |
| Wrap | `white-space` | `SelectField` (normal/nowrap/pre/pre-wrap/pre-line/break-spaces) |
| Word break | `word-break` | `SelectField` (normal/break-all/keep-all) |
| Line break | `line-break` | `SelectField` (auto/loose/normal/strict/anywhere) |
| Overflow | `overflow-wrap` | `SelectField` (normal/break-word/anywhere) |
| Indent | `text-indent` | `NumberInput` |
| Columns | `column-count` | `NumberInput` (no unit, keywords) |
| Stroke | `-webkit-text-stroke-width` | `NumberInput` |
| Stroke color | `-webkit-text-stroke-color` | `ColorField` |
| Shadow | `text-shadow` | `TextField` |

### `backgrounds.tsx` — Backgrounds (icon: `Image`)
| Field | CSS prop | Control |
|---|---|---|
| Color | `background-color` | `ColorField` |
| Image | `background-image` | `TextField` (`url(...)` or `linear-gradient(...)`) |
| Size | `background-size` | `SelectField` (auto/cover/contain/100% 100%) |
| Position | `background-position` | `SelectField` (center/top/right/bottom/left + 4 corners) |
| Repeat | `background-repeat` | `SelectField` (repeat/no-repeat/repeat-x/repeat-y/space/round) |
| Clip | `background-clip` | `SelectField` (border-box/padding-box/content-box/text) |

### `borders.tsx` — Borders (icon: `Square`)
| Field | CSS props | Control |
|---|---|---|
| Radius | `border-{top-left,top-right,bottom-right,bottom-left}-radius` | Linked `NumberInput` (auto-expands per-corner) |
| Style | `border-style` | `SelectField` (none/solid/dashed/dotted/double/groove/ridge) |
| Width | `border-width` | `NumberInput` |
| Color | `border-color` | `ColorField` |
| **Per-side widths (collapsible)** | | |
| Top | `border-top-width` | `NumberInput` |
| Right | `border-right-width` | `NumberInput` |
| Bottom | `border-bottom-width` | `NumberInput` |
| Left | `border-left-width` | `NumberInput` |

### `effects.tsx` — Effects (icon: `Sparkles`)
| Field | CSS prop | Control |
|---|---|---|
| Opacity | `opacity` | `SliderField` (0..100%, asPercent) |
| Blend | `mix-blend-mode` | `SelectField` (16 blend modes) |
| Visible | `visibility` | `SelectField` (visible/hidden/collapse) |
| Outline | `outline-style` | `SelectField` (none/solid/dashed/dotted/double) |
| Out. width | `outline-width` | `NumberInput` |
| Out. color | `outline-color` | `ColorField` |
| Out. offset | `outline-offset` | `NumberInput` |
| Shadow | `box-shadow` | `TextField` |
| Filter | `filter` | `TextField` |
| Backdrop | `backdrop-filter` | `TextField` |

### `transforms.tsx` — Transforms (icon: `RotateCw`)
| Field | CSS prop | Control |
|---|---|---|
| Transform | `transform` | `TextField` |
| Origin | `transform-origin` | `TextField` |
| Perspective | `perspective` | `NumberInput` (px) |
| P origin | `perspective-origin` | `TextField` |
| Style | `transform-style` | `TextField` |
| Backface | `backface-visibility` | `TextField` |

### `transitions.tsx` — Transitions (icon: `Zap`)
| Field | CSS prop | Control |
|---|---|---|
| Shorthand | `transition` | `TextField` (+ "Apply 'all 200ms ease'" preset button) |
| Property | `transition-property` | `TextField` |
| Duration | `transition-duration` | `NumberInput` (units: ms, s) |
| Easing | `transition-timing-function` | `SelectField` (linear/ease/ease-in/ease-out/ease-in-out/step-start/step-end) |
| Delay | `transition-delay` | `NumberInput` (units: ms, s) |

### `interactions.tsx` — Interactions (icon: `MousePointerClick`)
| Field | CSS prop | Control |
|---|---|---|
| Cursor | `cursor` | `SelectField` (13 cursor values) |
| Pointer | `pointer-events` | `SelectField` (auto/none) |
| Select | `user-select` | `SelectField` (auto/none/text/all/contain) |
| Touch | `touch-action` | `SelectField` (auto/none/pan-x/pan-y/pinch-zoom/manipulation) |
| Scroll | `scroll-behavior` | `SelectField` (auto/smooth) |

### `custom-properties.tsx` — Custom Properties (icon: `Variable`)
| Field | CSS prop | Control |
|---|---|---|
| `--<name>` | any `--*` | Per-row name input + `TextField` value + remove button + "+ Add" header action |

## i18n

Keys consumed live under `transKeys.editor.panels.edit.tabs.styles.*` (see `apps/web/client/messages/en.json`). Most v2 section + control labels are inlined English strings (intentional — they were authored alongside the UI and not yet translated). v3 must keep all existing keys and add new ones for any new section / control labels.
