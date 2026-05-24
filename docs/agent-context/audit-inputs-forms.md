# Audit guide — Inputs, search, forms

This guide tells an agent how to audit the repo for off-spec input/textarea/checkbox/radio/form usage. Same shape as the dropdown audit guide.

## Canonical primitives (source of truth)

| Use case | Primitive | Source |
|---|---|---|
| Single-line text input | `Input` | [packages/ui/src/components/input.tsx](../../packages/ui/src/components/input.tsx) |
| Multi-line input | `Textarea` | [packages/ui/src/components/textarea.tsx](../../packages/ui/src/components/textarea.tsx) |
| Input + leading/trailing slot (icon, button, addon) | `InputGroup` | [packages/ui/src/components/input-group.tsx](../../packages/ui/src/components/input-group.tsx) |
| Numeric with steppers | `NumberInput` | [packages/ui/src/components/number-input.tsx](../../packages/ui/src/components/number-input.tsx) |
| OTP / verification code | `InputOTP` | [packages/ui/src/components/input-otp.tsx](../../packages/ui/src/components/input-otp.tsx) |
| Input that auto-resets on blur to its last-saved value | `DraftableInput` | [packages/ui/src/components/draftable-input.tsx](../../packages/ui/src/components/draftable-input.tsx) |
| Checkbox | `Checkbox` | [packages/ui/src/components/checkbox.tsx](../../packages/ui/src/components/checkbox.tsx) |
| Radio | `RadioGroup` / `RadioGroupItem` | [packages/ui/src/components/radio-group.tsx](../../packages/ui/src/components/radio-group.tsx) |
| Toggle (single binary control) | `Toggle` | [packages/ui/src/components/toggle.tsx](../../packages/ui/src/components/toggle.tsx) |
| Toggle group (mutually exclusive set) | `ToggleGroup` / `ToggleGroupItem` | [packages/ui/src/components/toggle-group.tsx](../../packages/ui/src/components/toggle-group.tsx) |
| Switch | `Switch` | [packages/ui/src/components/switch.tsx](../../packages/ui/src/components/switch.tsx) |
| Slider | `Slider` | [packages/ui/src/components/slider.tsx](../../packages/ui/src/components/slider.tsx) |
| Form scaffold (validation, errors, labels) | `Form` (react-hook-form integration) | [packages/ui/src/components/form.tsx](../../packages/ui/src/components/form.tsx) |
| Field label | `Label` | [packages/ui/src/components/label.tsx](../../packages/ui/src/components/label.tsx) |

## Common violations to look for

### A. Wrong element

| Symptom | Why wrong | Fix |
|---|---|---|
| Raw `<input>` JSX outside packages/ui | No tokens, no focus state, no a11y wiring | Use `Input` |
| Raw `<textarea>` | Same | Use `Textarea` |
| Raw `<input type="checkbox">` | Native browser styling clashes with brand | Use `Checkbox` |
| Raw `<input type="radio">` | Same | Use `RadioGroup` |
| Boolean toggle implemented as a styled `<button>` with `aria-pressed` | Reinvents Toggle | Use `Toggle` |
| Number input with custom `+` / `-` buttons | Reinvents NumberInput | Use `NumberInput` |
| Search input with custom clear-icon button absolutely positioned | Reinvents InputGroup | Use `InputGroup` with `InputGroupAddonRight` |

### B. Token violations on inputs

- ❌ `bg-zinc-*`, `bg-gray-*`, `bg-neutral-*`, raw hex
- ❌ `border-zinc-*`, `border-gray-*`
- ❌ Custom heights (`h-8`, `h-10`, `h-12`) — `Input` is `h-9` by default; if a different height is genuinely needed, propose a size variant on the primitive
- ❌ `rounded-[Npx]` / `rounded-md` overrides — `Input` has the canonical radius
- ❌ Custom focus rings — global no-rings policy (see [packages/ui/src/globals.css:719](../../packages/ui/src/globals.css:719))

### C. Composition / layout violations

- ❌ `flex items-center gap-2` wrappers wrapping an `<input>` + an icon + a button to fake a search bar → use `InputGroup`.
- ❌ Custom error message rendered next to an input via `<p className="text-red-500 text-xs">` → use `FormMessage` from `Form`.
- ❌ Custom label markup with `<span>` or `<div>` → use `Label` (or `FormLabel` inside `Form`).

### D. Search bars

A search bar is a recurring offender. The canonical pattern is:

```tsx
<InputGroup>
  <InputGroupAddon>
    <Icons.MagnifyingGlass className="h-4 w-4" />
  </InputGroupAddon>
  <InputGroupInput placeholder={t('search')} value={query} onChange={...} />
  {query && (
    <InputGroupAddonRight>
      <Button variant="ghost" size="icon" onClick={() => setQuery('')}>
        <Icons.CrossS className="h-4 w-4" />
      </Button>
    </InputGroupAddonRight>
  )}
</InputGroup>
```

Common violations:
- Manually positioned `<button className="absolute right-2 ...">` clear button
- Manually positioned `<Icons.MagnifyingGlass className="absolute left-3 ...">` icon
- `pl-9 pr-7` padding inside `Input` to make room for absolute-positioned icons → should be `InputGroup` slots

### E. Hardcoded strings

- ❌ Hardcoded placeholders, helper text, validation messages.
- ✅ All copy via `useTranslations()` / `t(transKeys.something)`.

### F. Uncontrolled when it should be controlled

- ❌ `<Input defaultValue={...}>` used for persistent state. If the value is saved to state and re-read, it should be controlled (`value` + `onChange`).
- ❌ Form fields outside of `Form` / `useForm()` when validation is needed.

## Input variants (2026-05-24)

`Input` now has a `variant` prop:

| Variant | When to use | Dark mode surface |
|---|---|---|
| `primary` (default) | Standard form fields | `bg-[#232323] border-[#2d2d2d]` — solid, clearly visible |
| `ghost` | Search/filter fields | `bg-transparent border-[#232323]` — minimal, border only |

The old `dark:bg-input/30 border-input` pattern is **removed** — those were near-invisible in dark mode.
Inputs inside popovers and dialogs get `bg-[#2d2d2d] border-[#3a3a3a]` automatically via a base-layer CSS rule (no prop needed).

## Allowed customizations

- `className="w-full"` for width-fill (forms, dropdowns).
- `variant="ghost"` for search/filter inputs.
- `placeholder` from `next-intl`.
- `aria-label`, `aria-describedby` for accessibility.
- Slot composition via `InputGroup`.

## Prompt for the audit agent

Paste this whole block into a new agent when running the audit:

````
You are auditing the Weblab repo for off-spec input / textarea / form / search-bar usage.

Working directory: /Users/ludvighedin/Programming/personal/AB/coder-new/onlook

Canonical primitives live in packages/ui/src/components/:
- input.tsx, input-group.tsx, input-otp.tsx, number-input.tsx, draftable-input.tsx
- textarea.tsx
- checkbox.tsx, radio-group.tsx
- toggle.tsx, toggle-group.tsx, switch.tsx, slider.tsx
- form.tsx (react-hook-form Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage)
- label.tsx

Token rules: every color must use a semantic token from packages/ui/src/globals.css. No raw bg-zinc-*, bg-gray-*, text-gray-*, bg-blue-*. Heights and radii must come from the primitive defaults — do not override with h-8/h-10/h-12 or rounded-md/rounded-[Npx].

Audit scope:
- apps/web/client/src/app/
- apps/web/client/src/components/

Skip: node_modules, .next, dist, apps/web/client/src/stories/, design-system demos, *.test.tsx, template-sources/_forks/.

Categories to check:

1. RAW <input> JSX — find `<input` JSX elements in components. EXCEPT:
   - inside packages/ui/src/components/ (canonical)
   - inside <Form> using register() patterns where allowed
   - hidden type="file" inputs triggered programmatically (sanctioned)
   For each, propose canonical replacement (Input / Checkbox / RadioGroupItem / NumberInput / InputOTP).

2. RAW <textarea> JSX — every match outside packages/ui should be Textarea.

3. RAW <input type="checkbox" | type="radio"> — must be Checkbox / RadioGroupItem.

4. CUSTOM SEARCH BARS — find any combination of: <Input> with absolute-positioned icon/button siblings, or pl-9/pr-7/pl-10 padding overrides indicating icon-padding hacks. Each should be InputGroup with addons.

5. CUSTOM TOGGLE / SWITCH — find <button aria-pressed={...}> or styled <button> that toggles a boolean. Should be Toggle or Switch.

6. CUSTOM NUMBER STEPPERS — find <Input type="number"> with adjacent + / - buttons. Should be NumberInput.

7. TOKEN VIOLATIONS ON INPUT-LIKE ELEMENTS — grep for <Input … className containing bg-zinc-*, bg-gray-*, border-zinc-*, border-gray-*, rounded-md, rounded-[Npx], h-8/h-10/h-12 (not h-9), text-xs (when applied to input itself).

8. HARDCODED FORM STRINGS — placeholder="...", error messages, helper text not loaded via useTranslations / next-intl.

9. CUSTOM ERROR / VALIDATION MARKUP — <p className="text-red-500 text-xs"> or similar next to form fields. Should use FormMessage.

10. UNCONTROLLED INPUTS WITH STATE — <Input defaultValue={state}> where `state` updates elsewhere. Should be controlled.

11. FORM FIELDS OUTSIDE <Form> — fields with manual validation logic that should use react-hook-form via the Form primitive.

For each finding, report:
- file:line
- severity (🔴 high / 🟡 medium / 🟢 low)
- problem in one sentence
- proposed fix using the canonical primitive name and props

Output format:

## SUMMARY
- Total findings: N
- High: N | Medium: N | Low: N

## HIGH PRIORITY (visible affordances)
| # | File:line | Problem | Fix |

## MEDIUM PRIORITY
| # | File:line | Problem | Fix |

## LOW PRIORITY (cosmetic / one-off)
…

## SEARCH BARS INVENTORY
List every search bar surface in the app (file:line) and mark whether it uses InputGroup or hand-rolled composition. The goal is one canonical pattern across the app.

## ALLOWED PATTERNS NOTICED
List 3-5 examples of correct canonical usage you saw, with file:line, so future agents have positive references.

Cap report at 1500 words. Be exhaustive on counts even if the table is truncated.
````

## After the audit

1. Triage by severity. Search-bar consolidation is usually the highest-leverage win.
2. Read each file before migrating; don't trust the agent's snippet blindly.
3. Migrate in batches of 3-5 files per commit.
4. Run `bun typecheck` after each batch.
5. Verify the form / input flow works in the browser preview — search, submit, validation errors.
