---
name: accessibility
description: Apply WCAG 2.2 AA — semantic HTML, keyboard navigation, focus management, ARIA only when needed, color contrast, screen-reader behavior.
---

# Accessibility Skill

Use this skill any time the user asks to "make accessible", "fix a11y", "screen reader", "keyboard nav", "WCAG", "ARIA", "color contrast", or ships UI that real users will interact with.

## Stack assumptions

- React, Next.js App Router, Tailwind, `@weblab/ui` (Radix-based — already accessible if used correctly).
- Target: **WCAG 2.2 AA**. Check core flows manually, not just Lighthouse score.

## Rules I enforce

### Semantic HTML first

- Use the right element. `<button>` for actions, `<a>` for navigation, `<input>` for input. Don't put `onClick` on a `<div>`.
- Every page has one `<h1>`. Headings nest properly (`h1 → h2 → h3`, no skipping).
- Lists use `<ul>` / `<ol>`. Tables use `<table>`. Forms use `<form>` with `<label>` per input.
- Landmarks: `<header>`, `<main>`, `<nav>`, `<footer>`. One `<main>` per page.

### Keyboard

- Every interactive element is reachable by Tab.
- Focus order matches visual order. If you reorder visually with `flex-col-reverse` etc., set `tabIndex` accordingly or refactor.
- `:focus-visible` ring must be visible. `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Never `outline-none` without a replacement.
- Esc closes dialogs, menus, popovers. Radix handles this when used right.
- Skip link at top of body: `<a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>`.

### Screen reader

- Every `<img>` has `alt`. Decorative images: `alt=""` (empty, not omitted). Functional images: describe the *function* not the image.
- Every form input has a programmatically-associated label. Use `<Label htmlFor="x">` + `<input id="x">` from `@weblab/ui/label`. Placeholder is not a label.
- Buttons need accessible names. Icon-only button → `aria-label` describing the action. Not the icon name.
- Live regions: `aria-live="polite"` for status updates, `aria-live="assertive"` for errors. Don't overuse — they read everything that changes.
- Hide purely decorative content: `aria-hidden="true"` on icons that already have a sibling label.

### ARIA — only when HTML can't do the job

- Prefer native elements. If you need `role`, you might be doing it wrong.
- Common legitimate uses: `aria-expanded` on disclosure triggers, `aria-current="page"` on the active nav link, `aria-describedby` linking input to error text, `aria-busy="true"` on regions during load.
- Never put `role="button"` on a `<div>`. Use `<button>`.
- Never use `aria-hidden="true"` on a focusable element.

### Color contrast

- Body text vs background: ≥ 4.5:1.
- Large text (18pt+ or 14pt+ bold): ≥ 3:1.
- UI controls and graphical objects: ≥ 3:1.
- Don't rely on color alone for meaning. Pair red/green with an icon or text.
- Verify both light and dark theme. Tailwind tokens often have insufficient contrast in one mode.

### Forms

- Errors are announced. Pair input with `<p id="x-error" role="alert">` and `aria-describedby="x-error"`. Don't only color the border.
- Required fields marked: `aria-required="true"` and visible asterisk.
- Don't auto-submit on blur or trap users.
- Group related fields: `<fieldset>` + `<legend>`.

### Motion

- Respect `prefers-reduced-motion`. Wrap animations: `motion-safe:animate-shimmer`. Long auto-playing animations must pause/stop on user demand.
- Avoid > 3 flashes per second (seizure risk).

### Touch targets

- Minimum 24×24 CSS px (WCAG 2.2 — was 44×44 in 2.1, relaxed in 2.2). For dense UIs, 24 is fine; 44 is still the iOS/Android norm and what most tools test.

## Common bugs to fix on sight

- `<div onClick>` — replace with `<button>`.
- Icon-only `<Button>` without `aria-label` or accessible text.
- `<img>` with no `alt`.
- `<input>` with no associated `<label>` (placeholder doesn't count).
- Custom components stealing focus on render (`useEffect(() => ref.current?.focus())` without justification).
- Modal that doesn't trap focus or doesn't return focus to trigger on close. Use Radix `Dialog`.
- Toast that disappears in 2s — too fast to read with a screen reader. 5s minimum, with manual dismiss.
- Form errors only shown via red border, no text.
- `tabIndex={0}` on non-interactive elements.
- Custom dropdown without arrow-key support. Use Radix.

## Verification (do this, don't trust auto-tools)

1. **Tab through the page.** Can you reach every action? Does focus stay visible?
2. **Use Esc** in any open menu/dialog. Does it close?
3. **Use only the keyboard for one full task** (e.g. send a chat message). Possible?
4. **Zoom to 200%.** Does layout reflow without horizontal scroll?
5. **Check VoiceOver/NVDA** on the change. Are the labels what you expect?
6. **Check both themes** for contrast.

Lighthouse / axe catch ~30% of issues. Manual review catches the rest.

## When user says "is this accessible"

Answer with: keyboard pass / screen-reader pass / contrast pass / motion pass / target-size pass — concrete checks, not "looks good." If you can't run the checks, say so.
