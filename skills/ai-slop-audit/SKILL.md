---
name: ai-slop-audit
description: Detect and fix "AI slop" in web interfaces — the generic, templated, machine-averaged look (Inter on slate, purple gradients, three rounded icon-cards, everything centered, shadcn defaults, drop-shadow spam). Use this whenever the user asks to audit, review, or critique a UI's design quality; asks "does this look AI-generated / cheap / generic / templated / unfinished"; says "de-slop", "make it not look like AI made it", "why does my site look like every other AI site"; or shares a screenshot, URL, or frontend code (Tailwind, shadcn, React, HTML, CSS) and wants it judged or improved on craft. Trigger it even when the user does not say the word "slop" — any request to assess or raise the visual taste of an existing interface qualifies. Works on rendered output (screenshots, live pages) and on source code, and can both report problems and apply fixes.
---

# AI slop audit

## Why slop happens (so you know what to look for)

AI-generated interfaces look generic because models output the statistical average of their training data: every Tailwind tutorial, shadcn starter, and Dribbble screenshot ever scraped. The average is, by definition, the least surprising design — which reads as cheap, templated, and machine-made. Auditing for slop is largely the work of spotting those defaults and the absence of human craft decisions on top of them.

Your job: find the defaults, score them, and either report or remove them.

## What you can audit

- **Source code** — Tailwind/shadcn class strings, React/Vue/Svelte/Astro components, raw CSS/HTML. Highest signal: run the bundled scanner.
- **Rendered output** — screenshots or a live URL. Read it the way a senior designer would: hierarchy, spacing rhythm, color discipline, type personality, alignment, state design.

Most audits benefit from both: the scanner catches the mechanical tells, your eye catches the judgment-level ones.

## Process

### 1. Scan

If you have access to the code, run the bundled static analyzer first. It is fast, deterministic, and catches the tells that are pure pattern:

```bash
python scripts/scan_slop.py <path-to-code>
```
(The path is relative to this skill's directory. Add `--json` for machine-readable output.)

Always also do a structural read for the tells a regex cannot see — weak hierarchy, purposeless symmetry, uniform spacing, single-property hover states, missing focus rings, voice drift in copy. Consult `references/tells.md` for the full ranked catalog with severity scores; read it whenever you need the complete list rather than working from memory.

### 2. Score and triage

Produce a slop score and sort findings into two buckets:
- **Auto-rejects** — patterns that should not ship under any aesthetic (purple gradient backgrounds, three identical icon-cards, drop-shadow spam, pure `#000`/`#fff`, `transition: all`). Cite exact location: `file:line` or the element.
- **Missing craft** — what an intentional designer would have added and didn't (tinted neutrals, tabular numerals on data, a real focus-visible ring, coordinated hover states, smart quotes).

### 3. Report

Use this structure:

```
SLOP SCORE: <n>/100   (0 clean · 1–15 mild · 16–40 moderate · 41+ heavy)

AUTO-REJECTS
1. <pattern> — <file:line or element> — <one-line why it reads as slop>
...

MISSING CRAFT
1. <what's absent> — <where> — <the specific value/property to add>
...

THE ONE THING
<The single change that would most raise the perceived quality. Name it.>
```

### 4. Fix (when asked, or when the user clearly wants remediation)

Apply the smallest change that removes each tell, in operational terms — token names, CSS properties, exact values. Edit the code directly and show what changed. Work through auto-rejects first, then missing craft. After fixing, re-run the scanner to confirm the score dropped.

Prefer subtraction. A card removed, a shadow deleted, a gradient flattened to a solid tinted surface — these raise quality faster than anything additive.

## Critical guardrail: a brand match is not slop

If the interface is faithfully reproducing an attached design spec, Figma file, screenshot, or an established brand, that is intentional and correct — do not "fix" it toward your own taste. Distinguish *generic defaults the model fell into* (slop) from *deliberate decisions matching a reference* (not slop). When unsure whether something is intended, flag it as a question rather than overwriting it. Low-contrast text, missing focus states, and accessibility failures are always fair to call out, reference or not.

## Calibration

Severity is about how reliably a pattern signals "no human decided this," not personal preference. A single soft shadow on a true floating layer (dropdown, modal) is fine; the same shadow stacked on every static card is a tell. One accent color used sparingly is craft; three accents scattered is slop. Judge the cumulative impression, not isolated atoms — and when a design is genuinely good but unconventional, say so instead of forcing it toward a checklist.
