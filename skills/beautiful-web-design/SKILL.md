---
name: beautiful-web-design
description: Design and build distinctive, high-taste web interfaces that avoid the generic "AI slop" look. Use this whenever the user wants to create or redesign any website, landing page, marketing page, dashboard, app UI, or frontend component (React, Vue, Svelte, HTML/CSS, Tailwind, shadcn) — and especially when they say "make it beautiful", "design a site for", "build a landing page", "redesign this", or want something that looks intentionally designed rather than templated. Trigger it for frontend generation even when the user does not say the word "design", since producing UI is producing design. It commits to one of two named aesthetic directions (soft-modern or editorial-premium), applies operational craft rules, and self-audits against a slop checklist before shipping.
---

# Beautiful web design

## The mandate

You were trained on the open internet, so you absorbed an ocean of bad design: template dashboards, gradient-soaked landing pages, cluttered marketing sites, and the generic shadcn-on-slate look that floods every AI tool. Left to your defaults you reproduce that, because the default is the statistical average of what you saw — and the average reads as cheap and machine-made.

Reject the average. Design like the best product teams in the world, not the mean of the worst. Treat every instinct toward "safe, modern, clean" as suspect and replace it with the specific craft below. Brands worth aspiring to: Apple, Linear, Vercel, OpenAI, Stripe, Sana, Legora.

Build production-grade, working code with real craft and zero template feel.

## Rule 0 — a reference always wins

If the user attaches an image, screenshot, design spec, Figma file, or names exact values (hex, font, spacing), reproduce it exactly: every color, font, size, weight, radius, space, and layout. Do not substitute your own taste, do not "improve" it, do not invent. If a value is missing or ambiguous, ask one specific question before building. Never guess a brand's colors or type.

Everything below applies when there is no reference, or to fill genuine gaps a reference leaves open.

## Process — plan, build, audit

1. **Plan first.** In one or two lines, state the purpose, the audience, and which direction (A or B) you are committing to and why. Commit fully to one; never blend the two. Committing to a clear direction is what separates designed work from averaged work.
2. **Build** the working code.
3. **Self-audit** before returning. Walk the ship checklist at the end of this file and fix every failure. Then deliver.

## Pick one direction

Choose by brand and audience. When unspecified, default to Direction A. Commit completely; do not average them — a blend of two directions is how work drifts back toward the generic mean.

### Direction A — Soft modern
*Reference feel: Sana, Apple, OpenAI, Linear, Vercel.*
- **Mood:** clean, optimistic, human, calm. Light mode default; dark optional.
- **Type:** a characterful geometric or humanist sans (the Sana Sans / SF Pro / Geist / TWK Lausanne family of feel). Pair a display cut with a text cut. Never Inter-at-default.
- **Tracking and leading:** near-neutral tracking, slightly tight on large display. Comfortable leading (~1.2 headings, ~1.5 body).
- **Radius:** rounded and friendly. Buttons and inputs ~8–10px, surfaces ~14–20px, chips as pills.
- **Spacing:** generous but disciplined. Roomy sections, comfortable padding. Airy, not bloated. Calm, not empty.

### Direction B — Editorial premium
*Reference feel: Legora.*
- **Mood:** premium, authoritative, refined, trustworthy. Ink-on-paper or ivory. Editorial gravitas.
- **Type:** a refined serif for display and headlines (the Tiempos / GT Sectra / Eiko / Reckless family of feel), paired with a restrained sans for UI and long body. Typography is the hero.
- **Tracking and leading:** tight tracking on display serif, tight leading. Typographic precision throughout.
- **Radius:** minimal, near-square. Buttons and inputs ~2–4px, surfaces ~4–6px. Sharp and exact.
- **Spacing:** tight and deliberate. Editorial density. Compact padding, confident use of rules and dividers.

## Shared discipline (both directions)

- **Restrained color.** A neutral base plus one quiet accent. The accent does interactive work (focus, active, one primary action), under ~5% of the screen. Never on body text or headings. No blue/teal/colored text or links unless asked.
- **Flat.** No drop-shadow spam, no faux depth, no neumorphism. Build depth from spacing, hairline dividers, subtle 1px borders, and contrast. The only acceptable shadow is one minimal, soft shadow on a true floating layer (dropdown, popover, modal) over content. Never stacked or decorative shadows on static elements.
- **No card spam.** Group with spacing, dividers, and type before reaching for a card. A card must earn its border. Never nest a card in a card.
- **Clean layout.** Asymmetric, with one clear focal point per view. A real spacing scale. Do not center everything by default.
- **Impure neutrals.** Never pure `#000` or `#fff`. Near-black around `oklch(0.2 0.01 250)` on light, near-white on dark, both tinted a few degrees. Tint the whole neutral ramp so it never reads as raw Tailwind `slate` or `zinc`.
- **No decorative gradients, glows, or multi-accent palettes.**

## Universal craft laws

These hold in either direction and separate crafted from generated. The essentials are below; for the exhaustive operational list (exact values, OKLCH ramps, motion curves, micro-typography), read `references/craft.md`.

- **Type:** tabular numerals on every number that changes; smart quotes and proper dashes (never straight quotes or hyphen-as-range); sentence case except product/feature names; no trailing period on buttons; `text-wrap: balance` on headings, `pretty` on body; hierarchy from weight + size + color together, never size alone; optical sizing on where supported.
- **Form:** differentiated radii per component class, nested radius = inner + padding; optically center asymmetric icons (play, chevron); pad all-caps and icon+text by eye; borders only when spacing won't do the job, and prefer 1px with transparency over solid gray.
- **Motion:** animate only `transform` and `opacity`; never `transition: all` or linear easing; ease-out ~150–220ms for snappy UI, springs only for physical things (drawers, sheets, drags); no animation on keyboard-triggered actions; stagger lists 30–80ms; gate everything behind `prefers-reduced-motion` and hover behind `@media (hover: hover)`.
- **State:** every interactive element gets a custom `:focus-visible` ring (2px, 2px offset, accent, ≥3:1); hover changes 2+ properties, never background alone; primary buttons get a press state (`scale(0.98)`); empty states get copy and an action, not a cute illustration; errors name the field, the limit, and the fix; skeletons for loads over 300ms; body text contrast ≥4.5:1.
- **Copy:** specific verbs the product performs ("Review contracts", "Plan releases"), never "supercharge / streamline / unlock / leverage / elevate / empower / seamless / robust"; a headline that could only describe this product; one voice across hero, app, errors, and email.

## Stack note (Tailwind / shadcn)

If you build on Tailwind or shadcn/ui, override the defaults. Do not ship raw `slate`/`zinc` neutrals, `bg-indigo-500`, the default shadow scale, or unmodified `<Card>` and Button proportions. Restyle tokens first: neutrals, accent, radius, type, and (for flat design) strip the default shadows. The result must not be identifiable as a shadcn starter.

## Forbidden patterns (never ship)

- Centered hero with an eyebrow pill, oversized italic-serif headline, and two pill buttons.
- Three identical icon-topped feature cards in a row.
- A thick colored left border on a rounded card as a callout.
- A "Trusted by" logo wall with no links or context.
- A stat banner: one big number, three supporting stats, gradient accent.
- Purple/indigo or purple/pink gradient backgrounds. Gradient text on headlines.
- Drop-shadow spam. Glassmorphism. Neumorphism. Faux 3D depth.
- Plastic 3D blob renders. Stock photos of diverse smiling teams.
- Default Lucide/Heroicons used unmodified as the entire icon set.
- Emoji as section bullets.
- More than one visual gimmick per component.

## Ship checklist (run silently before returning)

Answer yes to all. Fix any no, then deliver. For auditing *existing* code rather than your own output, use the companion `ai-slop-audit` skill and its scanner.

1. Did you commit to one direction (A or B), not a blend?
2. Could a designer recognize this product from one screenshot, logo hidden?
3. Is the design flat, with no shadow or card spam?
4. Are neutrals tinted and is black/white impure?
5. Is there exactly one accent, under 5% of screen, off the text?
6. Does the type match the direction, with tabular numerals on data?
7. Are smart quotes, proper dashes, and sentence case used throughout?
8. Is the layout asymmetric with a clear focal point, not centered-everything?
9. Are radii consistent with the direction and nested correctly?
10. Do focus, hover, and press states exist and coordinate 2+ properties?
11. Is motion composite-only, ease-out, reduced-motion-gated, off on keyboard actions?
12. Is the copy specific to this product, free of SaaS filler?
13. If on shadcn/Tailwind, is the result unrecognizable as a starter?
14. Would the brands you aspire to ship this?
