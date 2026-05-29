---
name: apple-design
description: "Design or redesign UIs in Apple's modern aesthetic (iOS 26 / macOS Tahoe / apple.com 2024-2026 era). Use whenever the user asks to create, design, redesign, restyle, beautify, or polish any UI — iOS/macOS apps, SwiftUI views, websites, landing pages, React components, dashboards, or web apps — AND wants an Apple look (mentions Apple, Apple-style, clean, minimal Apple aesthetic, looks like apple.com, iOS design, SwiftUI Liquid Glass, or Human Interface Guidelines). Routes by stack: SwiftUI for iOS/macOS/visionOS with Liquid Glass APIs, React + Tailwind + shadcn/ui for web apps, HTML/CSS for static sites. Encodes Apple's checkable rules: SF Pro typography with exact tracking, semantic color palette with hex codes, 8pt grid spacing, restrained weights (400/500/600 only, no bold), correct corner radii, when Liquid Glass or backdrop-blur is appropriate, and the catalog of almost-Apple-but-not-quite mistakes. Do NOT use for non-Apple aesthetics like Material Design, Fluent, or Carbon."
license: MIT
---

# Apple Design

Design or redesign UIs so they look like Apple made them. This skill encodes Apple's Human Interface Guidelines, the Liquid Glass design language introduced in iOS 26, and the apple.com web aesthetic as concrete, checkable rules.

The point of this skill is not to make things look "premium-ish" or "clean-ish." It's to encode the specific decisions that distinguish a real Apple aesthetic from a knockoff — the exact tracking values, the warm near-black `#1d1d1f` instead of pure black, the 980px content container, the restrained use of weight (400/500/600 only, never bold), and the discipline around shadows and corners. These specifics are what make the difference between Apple-quality and Dribbble Apple-cosplay.

## How to use this skill

Work through these five steps in order on every design task. Skipping the stack detection or the audit will produce inconsistent output.

### Step 1 — Detect the stack

Before writing any code, identify what you're designing for. This determines which reference to read and which dialect of "Apple" to apply.

If the user already has a codebase, look at `package.json` / `Package.swift` / `index.html` to detect the stack, and follow what's there. Do not switch stacks on the user — a React project stays React, a SwiftUI project stays SwiftUI.

If this is a new project, the routing is:

- **iOS / iPadOS / macOS / visionOS / watchOS app** → SwiftUI with Liquid Glass. Read `references/liquid-glass-swiftui.md`.
- **Web app with a framework already chosen** → React + Tailwind + shadcn/ui. Read `references/web-emulation.md` and `references/shadcn-overrides.md`.
- **Static marketing site** → HTML + Tailwind (no shadcn). Read `references/web-emulation.md`.

The single biggest mistake when emulating Apple is treating native and web as the same dialect. They aren't. iOS 26 uses Liquid Glass (translucent materials with specular highlights). The web uses flat fills on a 980px container with backdrop-blur reserved for the sticky nav only. Putting glassmorphism cards on a web page will read as "almost Apple but not quite" no matter how well you nail the typography.

### Step 2 — Always read the foundation references

Regardless of stack, read these four before writing any code:

- `references/principles.md` — Clarity, deference, depth, and the 2025 additions
- `references/typography.md` — SF Pro scale with exact tracking and line-height
- `references/color.md` — Semantic colors with hex values, light and dark mode
- `references/spacing.md` — 8-pt grid, 980px container, margin and touch target rules

Then read the stack-specific reference(s) from Step 1. For any project that uses icons, also read `references/sf-symbols.md`. For animations and motion, read `references/motion.md`.

### Step 3 — Apply the checkable rules

These twelve rules apply to every output and are the highest-leverage decisions. Verify each before responding. The full "almost Apple but not quite" catalog with twenty-plus mistakes is in `references/common-mistakes.md` — read that when you suspect output looks off but can't tell why.

The first rule is weight discipline. Never use `font-bold` (700 or higher) on display text. Apple uses `font-semibold` (600) for headlines and `font-medium` (500) for emphasis. Body stays at `font-normal` (400). On SwiftUI, this means `.fontWeight(.semibold)` not `.bold()`.

The second rule is tracking on display text. Headlines at 32px or larger need tracking of `-0.022em`. Headlines between 20 and 28px need `-0.015em`. Default Tailwind `tracking-tight` (-0.025em) overshoots and reads as cramped — use the apple-tight tokens defined in the config.

The third rule is line-height on headlines. Tailwind's `leading-tight` (1.25) is too loose for Apple headlines. Hero headlines use `1.05`, display sizes use `1.08`. This single change does more for the Apple feel than any color choice.

The fourth rule is color discipline. Body text is `#1d1d1f` (warm near-black) not `#000000`. Secondary text is `#6e6e73`. Tertiary is `#86868b`. Never Tailwind's `slate-*` or `gray-*` for text — they have a visible blue cast that fights the warm Apple palette. Use the semantic `text-foreground` and `text-muted-foreground` tokens.

The fifth rule is the 980px container. Apple's main content container has been 980px for years, not 1200 or 1440. Going wider makes pages feel SaaS-template. Use `max-w-apple` for body sections; reserve `max-w-apple-wide` (1280px) for hero or full-bleed marquee sections only.

The sixth rule is shadow restraint. Apple uses no shadow in most places, relying on background color contrast for elevation. When shadow is needed, it's soft (12-30px blur), low-opacity (0.08-0.12), pushed down. Replace shadcn's default `shadow-lg`/`shadow-xl`/`shadow-2xl` with `shadow-apple` or remove entirely.

The seventh rule is radius consistency. Pick three values and use only those: inputs at 12px (`rounded-md`), cards at 18px (`rounded-lg` in this skill's config), buttons fully pill-shaped (`rounded-full`). Never `rounded-3xl` on cards — that reads as iOS-app-in-browser.

The eighth rule is the CTA pair pattern. The Apple hero pattern is one filled primary button plus one secondary text link with chevron (`.apple-link` class). Never two filled buttons of equal weight stacked in a hero — that creates choice paralysis and dilutes the primary CTA.

The ninth rule is eyebrow style. Section eyebrows are sentence-case semibold at body size (17px). Never `uppercase tracking-widest text-xs` — that pattern is Stripe/SaaS convention, not Apple.

The tenth rule is web-versus-native glass. Liquid Glass effects belong on native iOS 26 (use `.glassEffect()` on toolbars, nav bars, tab bars, sidebars). On the web, backdrop-blur is reserved for the sticky top nav only. Do not put glassmorphism panels on web cards, modals, or feature sections.

The eleventh rule is motion restraint. Apple animations are subtle, purposeful, physical. Defaults: 200ms for micro-interactions, 400ms for state changes, 600ms for screen transitions. Use `ease-out` for entrances, `ease-in` for exits. Never bounce, never decorate, never animate every section.

The twelfth rule is no Lorem Ipsum and no AI-giveaway phrasing. Write real draft copy that conveys intent. Avoid "revolutionary", "best-in-class", "seamless", "robust", "powerful", "innovative", "cutting-edge", "world-class". The full word blocklist is in `references/common-mistakes.md`.

### Step 4 — Run the audit script

After producing code, run the audit script to catch the most common mistakes mechanically. The script source never enters context — only its findings do — so this is cheap to run.

For web/React output:

```bash
python ${CLAUDE_SKILL_DIR}/scripts/audit_web.py <path-to-file-or-directory>
```

For SwiftUI output:

```bash
python ${CLAUDE_SKILL_DIR}/scripts/audit_swiftui.py <path-to-file-or-directory>
```

The script reports each violation with file path, line number, the matching pattern, and a one-line fix suggestion. Fix every reported issue before declaring the task done. If the script flags something legitimately intentional (rare), explain the override in chat rather than silently ignoring it.

For new projects that need the design tokens applied (Tailwind config + CSS variables), copy the starter from `assets/` rather than writing them from scratch:

```bash
cp ${CLAUDE_SKILL_DIR}/assets/tailwind.config.example.ts <project>/tailwind.config.ts
cp ${CLAUDE_SKILL_DIR}/assets/globals.example.css <project>/app/globals.css
```

### Step 5 — Hard rules that override everything

These are non-negotiable. If any of them conflict with the user's request, surface the conflict rather than silently complying.

**Never** mix iOS Liquid Glass effects into web output. Web glass equals sticky nav only.

**Never** use `font-bold` (700+) for display text. Use `font-semibold` (600).

**Never** use Tailwind's `slate-*` or `gray-*` color classes on body text. Use the semantic `text-foreground` and `text-muted-foreground` tokens (or `#1d1d1f` / `#6e6e73` / `#86868b` directly if not using the token system).

**Never** use shadcn's default `shadow-lg`/`shadow-xl` on cards. Use background-color contrast for elevation, or `shadow-apple` for the rare case where real elevation is justified.

**Always** use `rounded-full` for buttons and `rounded-lg` (18px in this config) for cards on web.

**Always** match SF Symbol weight to adjacent text weight on native.

**Always** respect Apple accessibility settings on native (Reduce Transparency, Increase Contrast, Reduce Motion) — never override them. The system handles these automatically when you use `.glassEffect()` properly.

## When the user says...

These are the most common entry points. Each one tells you which references to load first.

- **"design this"** / **"redesign this"** / **"make this look like Apple"** → Detect stack, load foundation references plus stack-specific reference, then produce.
- **"redesign apple.com but for [my product]"** → Web stack. Load `references/web-emulation.md` and `references/common-mistakes.md` heavily; common-mistakes prevents the obvious Apple-cosplay failures.
- **"make my iOS app look like iOS 26"** → SwiftUI stack. Load `references/liquid-glass-swiftui.md` and `references/swiftui-patterns.md`.
- **"audit my code for Apple-style issues"** → Skip directly to Step 4 (run the audit script) and report findings, no production needed.
- **"set up Apple-style tokens in my shadcn project"** → Copy from `assets/`, update Tailwind config and CSS variables, replace `Button` and `Card` from `assets/components/`.
- **"what's wrong with this design"** → Load `references/common-mistakes.md` and walk through the catalog against the artifact provided.

## What this skill is NOT for

This skill is presentation-layer only. It does not cover:

- Brand identity work or logo design (Apple's marks are trademarked and not the model to emulate)
- Backend architecture, API design, database schemas
- Marketing copy generation in isolation (the voice rules in `references/common-mistakes.md` help when copy is part of a design task, but this isn't a copywriting skill)
- Non-Apple aesthetics — if the user wants Material Design, Carbon, Fluent, or a custom brand look, this skill is the wrong tool

## Reference file index

Read these on-demand based on what you're designing. They're individually short (under 300 lines each) and focused on one concern.

- `references/principles.md` — Clarity / Deference / Depth, and the WWDC 2025 additions
- `references/typography.md` — SF Pro scale, exact tracking and line-height values, weight discipline
- `references/color.md` — System tints, semantic colors, light + dark mode hex values
- `references/spacing.md` — 8-pt grid, 980px container, touch targets, layout margins
- `references/liquid-glass-swiftui.md` — `glassEffect` API, `GlassEffectContainer`, button styles, accessibility
- `references/swiftui-patterns.md` — Common SwiftUI patterns beyond glass (NavigationStack, toolbars)
- `references/web-emulation.md` — apple.com anatomy, Tailwind config additions, the four canonical snippets
- `references/shadcn-overrides.md` — Per-component overrides for shadcn primitives
- `references/sf-symbols.md` — Iconography rules, rendering modes, weight matching
- `references/motion.md` — Animation timing, spring values, easing curves
- `references/common-mistakes.md` — The "almost Apple but not quite" catalog

## Asset file index

Drop-in starters in `assets/`:

- `tailwind.config.example.ts` — Full Tailwind config with the Apple design tokens
- `globals.example.css` — CSS variables for light and dark mode, plus base typography
- `components/button.example.tsx` — Apple-style Button override for shadcn
- `components/card.example.tsx` — Apple-style Card override for shadcn

## Script index

Executable in `scripts/`:

- `audit_web.py` — Lints HTML/JSX/TSX for the highest-frequency mistakes
- `audit_swiftui.py` — Lints Swift files for the highest-frequency mistakes
