# Element section — locked spec (Variant B v3)

Approval source: `~/.gstack/projects/Ludvig-Hedin-Weblab/designs/element-panel-20260523-001741/approved.json`
Mockup: `variant-B-v3.html`.

## Groups

### 1. Tag + ID — paired columns

Two equal-width columns, each labeled.

| Column | Field |
|---|---|
| Tag | `LabeledSelectInput` with `</>` glyph + monospace value (`div`) + chevron-down. Opens common-tags list. |
| ID | `LabeledTextInput` with `#` text prefix + monospace input. |

Both fields share v4 base geometry (30px, radius 8, dark fill).

### 2. Classes — chip input with keyboard nav

Group head:
- Label: "Classes"
- Right slot: pencil `icon-btn-sm` that opens a `RawClassNameEditor`
  popover (textarea-style for verbose edits).

Body: `ChipInput` — same shape as v3 but with these behaviors:
- Each chip is `tabindex=0`, brand-blue tint
  (`bg-foreground-brand/15 text-foreground-brand`).
- **Arrow Left / Right** walks chips bidirectionally (already in v3).
- **Backspace / Delete** on focused chip removes it (already in v3).
- **Click chip** → enters rename mode. Chip's content becomes
  contenteditable, focus + caret in chip; Enter commits, Escape
  reverts.
- **Trailing input** keeps the existing keyboard model (Enter
  adds, ArrowLeft at position 0 jumps to last chip).
- No placeholder text inside the trailing input — the edit icon
  in the group head signals "add" affordance.

Implementation: extend the v3 `ChipInput` with a `renameAt(index)`
method. The chip switches to an `<input>` rendered in-place, same
brand-blue background, same height. Commit on blur or Enter.
Persist focus back on the chip after commit.

### 3. Link — smart autocomplete

Group head:
- Label: "Link"
- Right slot: `Open in new tab` checkbox-inline (visible only when
  href is set). Toggles writing `target="_blank" rel="noreferrer"`.

Body: `SmartLinkInput` — single 30px field with link-glyph prefix.
Autocomplete dropdown opens on focus + as user types.

Dropdown:
- Radius **12px** (matches other panel dropdowns).
- Padding 4px, items radius **8px**, height 32px.
- Sections labeled in sentence-case (no uppercase).

#### Detection + suggestions

| User input matches | Action |
|---|---|
| `^/` | Treat as relative path; offer matching pages by prefix; no external fallback |
| email regex (`^\w[\w.-]*@[\w.-]+\.\w+$`) | Section "Email" with single item: "Send email to **{value}**" → writes `mailto:{value}` |
| phone regex (`^\+?[\d\s()-]{7,}$`) | Section "Phone" with single item: "Call **{value}**" → writes `tel:{value}` |
| `^https?://` | External URL — single item: "Go to **{value}**" → writes verbatim |
| anything else | Fuzzy match: |
| | • "Pages" — project routes from `editorEngine.pages` |
| | • "Files" — uploaded assets from asset panel store |
| | • "Or use" — fallback row `Go to https://{value}` |

#### Data sources

- **Pages**: read from existing routes — `editorEngine.pages` /
  router. Each result: page title + path `/about`.
- **Files / Assets**: read from the asset panel store
  (`editorEngine.assets` or equivalent). Each result: filename +
  folder breadcrumb (`/assets/decks`).
- Both reads are cheap (in-memory). Debounce input by 80ms.

#### Keyboard

- ArrowDown / ArrowUp walks dropdown items.
- Enter commits the highlighted item OR the fallback row.
- Escape closes the dropdown without committing (keeps draft).

#### URL normalization on commit

| Committed value | Normalized write |
|---|---|
| `/about` | `/about` |
| `apple.com` | `https://apple.com` |
| `https://apple.com` | unchanged |
| `mailto:foo@bar.com` | unchanged |
| `tel:+1...` | unchanged |
| email-only `foo@bar.com` | `mailto:foo@bar.com` |
| phone-only `+1 555…` | `tel:+15551234567` |

## New primitives

| Primitive | Notes |
|---|---|
| `LabeledSelectInput` | Already specced for Text — reused here for Tag |
| `LabeledTextInput` | Same shape, text input variant |
| `ChipInput` | Extend v3 with `renameAt(index)` |
| `RawClassNameEditor` | Radix Popover with `<textarea>` for verbose edits |
| `SmartLinkInput` | NEW — input + autocomplete dropdown + categorized sources |
| `SmartLinkDropdown` | NEW — Radix-style popover; sections (pages/files/email/phone/or use) |
| `OpenInNewTabCheckbox` | Small inline checkbox primitive — also reusable for Anchor target |

## Removed vs v3

- Plain "Link" `TextField` row → replaced by smart autocomplete.
- "Add a class…" trailing-input placeholder — silent now; pencil
  edit icon advertises bulk-edit affordance.
