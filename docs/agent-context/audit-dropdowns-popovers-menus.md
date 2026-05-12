# Audit guide — Dropdowns, popovers, menus

This guide tells an agent how to audit the repo for off-spec dropdown/popover/menu usage, the same way the button audit was run.

## Canonical primitives (source of truth)

| Use case | Primitive | Source |
|---|---|---|
| Action list triggered from a button | `DropdownMenu` | [packages/ui/src/components/dropdown-menu.tsx](../../packages/ui/src/components/dropdown-menu.tsx) |
| Free-form floating panel (custom content) | `Popover` | [packages/ui/src/components/popover.tsx](../../packages/ui/src/components/popover.tsx) |
| Choose one value from a list | `Select` | [packages/ui/src/components/select.tsx](../../packages/ui/src/components/select.tsx) |
| Right-click contextual menu | `ContextMenu` | [packages/ui/src/components/context-menu.tsx](../../packages/ui/src/components/context-menu.tsx) |
| Top-bar / app-bar menus (File / Edit / View) | `Menubar` | [packages/ui/src/components/menubar.tsx](../../packages/ui/src/components/menubar.tsx) |
| Hover preview / tooltip-rich card | `HoverCard` | [packages/ui/src/components/hover-card.tsx](../../packages/ui/src/components/hover-card.tsx) |
| Top-level site nav with mega-menus | `NavigationMenu` | [packages/ui/src/components/navigation-menu.tsx](../../packages/ui/src/components/navigation-menu.tsx) |
| Searchable list / palette | `Command` | [packages/ui/src/components/command.tsx](../../packages/ui/src/components/command.tsx) |

All of these are Radix-backed. Tokens come from [packages/ui/src/globals.css](../../packages/ui/src/globals.css) — same ones that govern Button.

## Common violations to look for

### A. Wrong primitive

| Symptom | Why wrong | Fix |
|---|---|---|
| Hand-rolled `<div>` floating panel on a button click | Loses portal, focus trap, escape-to-close, click-outside | Use `Popover` or `DropdownMenu` |
| `<select>` HTML element | No theming, no tokens, no keyboard variant control | Use `Select` |
| `<DropdownMenu>` with a single non-action child (custom `<button>`) | The child should be `DropdownMenuItem` | Replace child with `DropdownMenuItem onSelect={…}` |
| `<Popover>` used for a simple action list | Hand-rolled menu rows inside Popover instead of Menu | Use `DropdownMenu` for action lists |
| Right-click handler attached to `<div>` opening a custom panel | Misses accessibility | Use `ContextMenu` |

### B. Token violations on menu content

- ❌ `bg-zinc-*`, `bg-gray-*`, `bg-neutral-*` inside menu/popover content
- ❌ `text-gray-*`, raw palette text colors
- ❌ `rounded-[Npx]`, `rounded-md` overrides on `DropdownMenuContent` (already styled)
- ❌ Custom focus rings — global no-rings policy is enforced (see [packages/ui/src/globals.css:719](../../packages/ui/src/globals.css:719))
- ✅ All chrome should inherit from primitive defaults; only `align` / `side` / `sideOffset` / `className="w-72"` (width) are routinely allowed.

### C. Trigger shape mismatches

- Trigger should be `<Button>` wrapped via `<DropdownMenuTrigger asChild>`.
- ❌ Raw `<button className="...">` as a trigger that re-implements Button chrome.
- ❌ Multiple buttons stacked next to a `DropdownMenuTrigger` as if they were a split-button — use the canonical split-button pattern from `/design-system → Button groups`.

### D. Item-shape violations

- ❌ Raw `<button>` or `<a>` inside `DropdownMenuContent` instead of `DropdownMenuItem` / `DropdownMenuRadioItem` / `DropdownMenuCheckboxItem`.
- ❌ Custom `flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-...` inside menu content — that's a reinvented `DropdownMenuItem` and bypasses the keyboard nav contract.
- ❌ Hardcoded user-facing text in menu items — must come from `messages/*` via `next-intl`.

### E. Width / layout drift

- ❌ `DropdownMenuContent` with no `align` prop when it should be `align="end"` (right-aligned dropdowns common in toolbars).
- ❌ `Popover` content with fixed `w-[400px]` instead of `w-80` / `w-96` from the spacing scale.

## Allowed customizations

- `align`, `side`, `sideOffset`, `collisionPadding` on `Content`.
- `className="w-72"` etc. for explicit width when content demands it.
- `onSelect={(e) => e.preventDefault()}` to keep menu open after selection (e.g. filter checkbox list).

## Prompt for the audit agent

Paste this whole block into a new agent (general-purpose or Explore) when running the audit:

````
You are auditing the Weblab repo for off-spec dropdown / popover / menu usage.

Working directory: /Users/ludvighedin/Programming/personal/AB/coder-new/onlook

Canonical primitives live in packages/ui/src/components/:
- dropdown-menu.tsx (action lists, the most common)
- popover.tsx (free-form floating panels)
- select.tsx (choose-one)
- context-menu.tsx (right-click)
- menubar.tsx (app-bar menus)
- hover-card.tsx (hover previews)
- navigation-menu.tsx (top-level nav)
- command.tsx (searchable palette)

Token rules: every color must use a semantic token from packages/ui/src/globals.css. No raw bg-zinc-*, bg-gray-*, text-gray-*, bg-blue-*, etc.

Audit scope:
- apps/web/client/src/app/
- apps/web/client/src/components/

Skip: node_modules, .next, dist, apps/web/client/src/stories/, design-system demos, *.test.tsx, template-sources/_forks/.

For each finding, report:
- file:line
- severity (🔴 high / 🟡 medium / 🟢 low)
- problem in one sentence
- proposed fix using the canonical primitive name

Categories to check:

1. HAND-ROLLED DROPDOWNS — find `<div>` floating panels triggered by a button click that should be `<DropdownMenu>` or `<Popover>`. Look for: `useState` controlling visibility + absolute/fixed positioned content + click-outside handler.

2. RAW <select> ELEMENTS — find `<select>` JSX in components (not test fixtures or generated forms). Each is a violation; should be `<Select>` from @weblab/ui/select.

3. CUSTOM MENU ITEMS — find raw `<button>` or `<a>` nested inside `<DropdownMenuContent>` / `<PopoverContent>` / `<ContextMenuContent>`. They should be DropdownMenuItem / DropdownMenuRadioItem / DropdownMenuCheckboxItem / PopoverClose / similar.

4. TOKEN VIOLATIONS on menu/popover content — grep `<DropdownMenuContent`, `<PopoverContent`, `<SelectContent`, `<ContextMenuContent` and their children for raw Tailwind palette utilities (bg-zinc-*, bg-gray-*, bg-blue-*, text-gray-*) or rounded-[Npx] / rounded-md overrides.

5. TRIGGER SHAPE — `<DropdownMenuTrigger>` and `<PopoverTrigger>` should wrap a `<Button>` via `asChild`. Flag triggers that wrap raw `<button className="...">` re-implementing Button chrome.

6. HARDCODED STRINGS — any user-facing text inside menu items / popover content that is not loaded via `next-intl` / `useTranslations` / `t(transKeys....)`.

7. CONTEXTUAL MENU MISUSE — find `onContextMenu={...}` handlers that open custom panels. They should use `<ContextMenu>`.

Output format:

## SUMMARY
- Total findings: N
- High: N | Medium: N | Low: N

## HIGH PRIORITY
| # | File:line | Problem | Fix |

## MEDIUM PRIORITY
| # | File:line | Problem | Fix |

## LOW PRIORITY (optional)
…

## ALLOWED PATTERNS NOTICED
List 3-5 examples of correct canonical usage you saw, with file:line, so future agents have positive references.

Cap report at 1500 words. Be exhaustive on counts even if the table is truncated.
````

## After the audit

1. Triage High → Medium → Low.
2. For each High, read the actual file before migrating. Do NOT trust the agent's snippet blindly.
3. Migrate in batches of 3-5 files per commit.
4. Run `bun typecheck` after each batch.
5. Verify in `/design-system` and the touched surface in the browser preview before claiming done.
