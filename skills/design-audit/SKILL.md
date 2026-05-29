---
name: design-audit
description: >-
  Runs a design-system consistency audit for Weblab — finds color token
  violations, typography off-spec, radius drift, surface hierarchy bugs,
  hardcoded strings, and Onlook brand leaks. Outputs a severity-ranked
  findings table, hierarchy review, and a minimal patch for the top issues.
  Use this skill whenever the user says "design audit", "design system check",
  "check design consistency", "brand audit", "token violations",
  "design inconsistencies", "check the design system", or asks whether a
  surface follows the design system. Trigger even for informal phrasings like
  "does this follow the design system?" or "the panel looks off".
---

# Design System Audit

You are running a design-system consistency audit for Weblab. Your job is to find real violations — not preferences — and report them with surgical precision. No code edits unless the user explicitly asks after seeing the report.

## Step 1: Read the tokens FIRST

Before looking at any target files, read these sources of truth in order:

1. `packages/ui/src/globals.css` — all CSS custom properties (colors, radius, shadow, animation tokens)
2. `apps/web/client/src/styles/globals.css` — appearance overrides
3. `apps/web/client/src/app/design-system/page.tsx` — what the design system exposes and names

You must know which tokens exist and what they're called before evaluating anything. Do not propose tokens that don't exist.

## Step 2: Identify the target surface

The user will specify a surface (e.g. "the project editor left panel", "settings page", "onboarding flow"). If unclear, ask. Then find the relevant files:

```bash
# Example: find files for the project editor canvas area
find apps/web/client/src/app/project -name "*.tsx" | head -40
```

Read the component tree — start from the page/layout file and follow the component imports for the target area.

## Step 3: Audit for violations

Check every class string against these rules:

### Colors
- ✅ CSS variables: `--background*`, `--foreground*`, `--color-*`, etc.
- ✅ Semantic Tailwind like `bg-background`, `text-foreground-secondary`
- ❌ Raw hex inside component files (only allowed in `globals.css` and `design-system/page.tsx`)
- ❌ Tailwind palette utilities: `bg-blue-500`, `text-gray-400`, `border-zinc-700`, etc.
- ❌ One-off `rgba()`, `hsl()`, `#hex` in className strings

### Typography
- ✅ Named scale: `text-title1`, `text-title2`, `text-title3`, `text-large`, `text-largePlus`, `text-regular`, `text-regularPlus`, `text-small`, `text-smallPlus`, `text-mini`, `text-miniPlus`, `text-micro`, `text-microPlus`
- ❌ Raw Tailwind sizes: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-md`
- Exception: vendor/3rd-party markup — flag but note the reason

### Radius
- ✅ `rounded-xs`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full`, `rounded-none`
- ❌ `rounded-[Npx]`, `rounded-[N.Nrem]` — violations unless matching system chrome intentionally

### Borders
- ✅ `border` (1px), `border-2`
- ⚠️ `border-[0.5px]` — flag unless deliberately matching macOS hairlines

### Surface hierarchy
- `--background` = backdrop (lowest)
- `--background-secondary` = panel
- `--background-primary` = raised object (highest)
- Bug: two adjacent surfaces using the same token = hierarchy collapse

### Buttons
- ✅ `@weblab/ui/button` with variants: `default`, `secondary`, `outline`, `ghost`, `destructive`
- ❌ `<button className="bg-... rounded-...">` — one-off button is a violation

### Strings / i18n
- ✅ All copy from `messages/*` via `next-intl`
- ❌ Hardcoded user-facing strings in JSX

### Brand
- ❌ Any "Onlook" reference in code or UI **except**:
  - `LICENSE.md`
  - `CODE_REVIEW_BACKLOG.md`
  - `DEPRECATED_PRELOAD_SCRIPT_SRCS` constant
  - Files under `apps/web/client/src/app/compare/onlook/*`
  - Intentionally deprecated test fixtures

## Step 4: Produce the report

Output exactly this structure. Cap the report at ~600 words excluding the table.

---

### 1. Inventory
One paragraph: files reviewed, total lines, what the surface renders, what it does. Do NOT recap the design system rules back.

### 2. Findings table — ordered by severity

| # | Severity | File:line | Current | Should be | Why it matters |
|---|---|---|---|---|---|
| 1 | 🔴 High | `path/to/file.tsx:42` | `text-xs text-gray-400` | `text-mini text-foreground-tertiary` | Off-spec type on primary affordance |

Severity scale:
- 🔴 **High** — visible to users, contradicts a token, or breaks visual hierarchy
- 🟡 **Medium** — off-spec but cosmetic / non-load-bearing
- 🟢 **Low** — micro-drift, comment-level

If no violations: state "No violations found." and stop at section 2.

### 3. Hierarchy & rhythm review

≤8 bullets covering:
- Surface hierarchy (does each surface read at the right depth?)
- Spacing rhythm (is padding/gap consistent across sibling components?)
- Iconography (sizes, weights, source — `@weblab/ui/icons` only?)
- Motion (does it use `animate-*` tokens from globals.css, or ad-hoc `transition-` durations?)

### 4. Smallest patch that lifts the surface 80%

Pick 3–5 highest-leverage fixes. Each gets a before/after diff using real class names from this codebase. No invented utilities, no invented tokens.

```diff
// File: apps/web/client/src/app/project/[id]/_components/left-panel/index.tsx
- <div className="bg-zinc-900 text-xs text-gray-400">
+ <div className="bg-background-secondary text-mini text-foreground-tertiary">
```

### 5. Open questions

Bullets only — things that need product input before a decision can be made. Not recommendations.

---

## Rules

- **No file edits.** Report only, unless the user explicitly asks you to apply fixes after reading the report.
- **No invented tokens or components.** Work within what exists in globals.css and @weblab/ui.
- **If a violation has a legitimate reason** (vendor markup, system chrome recreation), say so and move on.
- **If the surface is fine, say so.** A clean audit with 0 findings is a valid result.
- **Don't recap design system rules** back to the user in the report — they know them.
- Use real file paths and real line numbers. Don't approximate.
