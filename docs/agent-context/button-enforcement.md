# Button enforcement — rules for new agents

> If a skill / agent / human is about to write `<button>` JSX, read this first.

The Weblab Button lives at [packages/ui/src/components/button.tsx](../../packages/ui/src/components/button.tsx) and is showcased at [`/design-system`](http://localhost:3000/design-system#buttons). Every clickable button-shaped affordance in the app must use it.

## Rule 1 — Use `<Button>`, not raw `<button>`

```tsx
// ✅ Right
import { Button } from '@weblab/ui/button';
<Button variant="default" size="sm" onClick={…}>Save</Button>

// ❌ Wrong
<button className="bg-blue-500 text-white px-3 py-2 rounded-md" onClick={…}>Save</button>
```

## Rule 2 — Pick a variant. Don't override colors.

Variants:

| Variant | Use for |
|---|---|
| `default` | Primary CTA (solid, branded) |
| `secondary` | Secondary action with subtle fill |
| `outline` | Tertiary action, sits on a colored surface |
| `ghost` | Quiet action, no border, hover-tint only |
| `link` | Inline text action |
| `destructive` | Destructive action: delete, remove, irreversible. Solid red. |
| `accent` | Soft positive surface — "last used", "selected", success-leaning chip |
| `warning` | Soft amber surface — pending / attention / sync states (not a destructive action) |
| `danger` | Soft red surface — offline / error status. Different from `destructive`: `destructive` is a solid red CTA you click to delete, `danger` is a status badge that happens to be clickable. |
| `chip` | Small `rounded-sm` filter pill for cards, mockups, decorative chrome |

**Never override variant colors via className.** No `bg-blue-*`, `bg-zinc-*`, `bg-gray-*`, raw hex, `text-red-500`, `border-emerald-300`, etc. If the variant you need doesn't exist, add a new variant to `button.tsx` — don't paper over with utilities.

## Rule 3 — Pick a size. Don't override height/padding.

Sizes:

| Size | Height | Use for |
|---|---|---|
| `default` | h-9 (36px) | Most buttons |
| `sm` | h-8 (32px) | Toolbar rows, dense tables |
| `lg` | h-10 (40px) | Primary CTAs in dialogs / hero sections |
| `compact` | h-7 (28px) | Status pills, badge-shaped buttons |
| `icon` | size-9 (square) | Icon-only |
| `toolbar` | h-8 (compact icon) | Editor toolbars |

**Never set `h-7` / `h-8` / `h-10` / `px-3 py-2` / `rounded-md` on `<Button>`.** Pick the size. If you genuinely need a size that doesn't exist, add it to the CVA — don't hack with utility classes.

## Rule 4 — Use the `loading` prop. Don't compose spinners.

```tsx
// ✅ Right
<Button loading={isSaving} onClick={save}>Save</Button>

// ❌ Wrong
<Button disabled={isSaving} onClick={save}>
    {isSaving && <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />}
    Save
</Button>
```

`loading` disables the button, sets `aria-busy`, and renders the canonical spinner.

## Rule 5 — Allowed className overrides

| Override | Allowed? |
|---|---|
| `className="w-full"` | ✅ Width-fill in forms/dropdowns |
| `className="font-semibold"` | ✅ Rare — for emphasis on marketing CTAs |
| `className="rounded-r-none"` / `"rounded-l-none"` | ✅ Inside a button-group composition |
| `className="border-l border-primary-foreground/20"` | ✅ Split-button dropdown divider |
| `className="bg-blue-500"` | ❌ Color override |
| `className="text-xs"` / `"text-sm"` | ❌ Raw Tailwind text size |
| `className="h-7 px-2"` | ❌ Use `size="compact"` instead |
| `className="rounded-md"` | ❌ Breaks `rounded-full` invariant |

## Rule 6 — When raw `<button>` IS allowed

Only these patterns are sanctioned. If you're not sure your case fits, ask before writing it.

1. **Entire row / card click target** — the whole card is the button; it inherits the card's chrome. The element has no button-shaped styling of its own (no `bg-…`, no `rounded-md`, no `px-/py-`).
2. **Tab-strip click target** — use the `Tabs` primitive instead. Only if `Tabs` truly doesn't fit, a raw `<button>` is allowed inside a tab-strip surface.
3. **Editor toolbar chrome** — `ToolbarButton` ([apps/web/client/src/app/project/[id]/_components/editor-bar/toolbar-button.tsx](../../apps/web/client/src/app/project/[id]/_components/editor-bar/toolbar-button.tsx)) wraps Button with its own design language. New editor toolbar buttons should compose `ToolbarButton`, not raw `<button>`.
4. **Status banners** — full-width clickable banner rows for offline / sync / system status. They look like an `Alert`, not a button. Use semantic tokens (`bg-background-warning`, `bg-destructive/10`) — never raw amber/red palette.
5. **Accessibility shims** — a `<button>` with only `aria-label` / `sr-only` content, no visible chrome, used as a keyboard target.

## Rule 7 — Use the right primitive

Before reaching for `<Button>` at all, check if a different primitive fits:

| Pattern | Use |
|---|---|
| Action that opens a menu | `<DropdownMenu>` + `<DropdownMenuTrigger asChild><Button>...</Button></DropdownMenuTrigger>` |
| Action that opens a floating panel | `<Popover>` |
| Choice between exclusive options | `<ToggleGroup type="single">` + `<ToggleGroupItem>` |
| Boolean toggle | `<Toggle>` or `<Switch>` |
| Menu item inside a dropdown | `<DropdownMenuItem>` — never raw `<button>` inside `DropdownMenuContent` |
| Item in a select | `<SelectItem>` inside `<Select>` |

## How to extend

When you need a button shape that doesn't exist:

1. Open [`/design-system#buttons`](http://localhost:3000/design-system#buttons), check if a variant/size combo already covers it.
2. If not, add a new variant or size to `button.tsx` CVA. Use semantic tokens from [packages/ui/src/globals.css](../../packages/ui/src/globals.css) — `--background-*`, `--foreground-*`, `--border-*`.
3. Add a demo entry to [apps/web/client/src/app/design-system/_components/demos/buttons.tsx](../../apps/web/client/src/app/design-system/_components/demos/buttons.tsx) so it shows in the matrix.
4. If the new variant absorbs an existing off-spec pattern, add a row to the "Deviations found in code (audit)" section pairing the old vs new.
5. Run `bun typecheck`. Verify in browser at `/design-system`.

## How to verify before committing

```bash
# Typecheck — must be clean
bun typecheck

# Search your own diff for forbidden patterns
git diff --name-only | xargs grep -E "bg-zinc-|bg-gray-|bg-blue-[0-9]|rounded-md.*Button|className=\"[^\"]*h-[0-9].*Button"
```

If the grep returns anything, you're about to commit a violation.

## Related audits

- Dropdowns / popovers / menus: [audit-dropdowns-popovers-menus.md](audit-dropdowns-popovers-menus.md)
- Inputs / search / forms: [audit-inputs-forms.md](audit-inputs-forms.md)
