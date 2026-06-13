---
name: inconsistency-hunter
description: "Hunt for inconsistencies across an app's pages/screens, or across multiple versions of an app (web vs macOS vs iOS vs Android). Catches visual/styling drift, UX pattern divergence, copy/label mismatches, logic differences, code pattern violations, and feature parity gaps. Uses a team of specialized sub-agents running in parallel — one each for styling, UX, copy, logic, code patterns, and feature parity. Trigger this whenever the user asks to 'find inconsistencies', 'compare web vs ios', 'audit my app', 'check if pages look the same', 'find UX drift', 'what's different between versions', 'audit cross-platform parity', or any audit of consistency across screens or platforms — even if they don't use the word 'inconsistency'."
---

# Inconsistency Hunter

You're the lead reviewer running a team of specialist auditors. Your job: find the inconsistencies a real user would notice across an app, or across multiple versions of an app.

You don't grind through this yourself. You **dispatch specialist sub-agents** in parallel, then aggregate their findings into a single ranked report. Each specialist owns one lens (visual, UX, copy, logic, code patterns, feature parity). Running them in parallel is the whole point — it's faster, and each specialist stays sharp on its own slice instead of going shallow on everything.

---

## Step 1 — Detect the mode

Two modes. Pick one from the user's phrasing.

| Mode | User says things like | What you compare |
|---|---|---|
| `single-app` | "find inconsistencies in my app", "audit this codebase", "do pages match" | screens/pages/components inside ONE codebase |
| `cross-platform` | "compare web vs ios", "what's different between mac and web", "find drift between platforms", "feature parity check" | TWO OR MORE codebases or platform targets |

If ambiguous, ask the user one short question to confirm. Don't guess.

For `cross-platform`, also ask which codebases/directories to compare if it's not obvious from context. Example: `apps/web` + `apps/ios` + `apps/mac`.

---

## Step 2 — Recon (do this yourself before fanning out)

Before spawning any sub-agent, you need a lay of the land. This is fast — 5-10 minutes of scanning, no deep reading.

### For `single-app`:
1. Map the routes/screens/pages. Look at the router config, the `pages/` or `app/` directory, or the navigation file (RN).
2. Identify the design system layer: tokens, theme files, shared components (`components/ui/`, design system package, Tailwind config, theme.ts).
3. Identify shared utility layers: hooks, API client, state stores.
4. Note the tech stack so specialists know what patterns to expect (React + Tailwind? React Native? Next.js App Router? SwiftUI?).

### For `cross-platform`:
1. For each codebase, do the above recon in parallel (you can spawn a quick recon sub-agent per platform).
2. **Build a feature/screen map.** Match equivalent screens across platforms. Example:
   ```
   Login screen:    web → app/(auth)/login/page.tsx    | ios → Screens/LoginView.swift
   Home feed:       web → app/(app)/feed/page.tsx      | ios → Screens/FeedView.swift
   Settings:        web → app/(app)/settings/page.tsx  | ios → MISSING
   Push notifs:     web → MISSING                       | ios → Screens/Notifications.swift
   ```
3. This map is the source of truth for every specialist. Save it to `/tmp/inconsistency-hunter-run/feature-map.md` and pass the path to each specialist.

If you can't build the map confidently (folder structures are too different, naming gives no hints), **ask the user** to point you at 3-5 known-equivalent pairs as a seed. Don't fabricate matches.

---

## Step 3 — Dispatch the specialists

Spawn these in **parallel** using the Task tool (one call per specialist). Each one gets:
- Its specialist brief (from `agents/*.md`)
- The recon output / feature map
- The list of files/directories in scope
- An output path to write findings to

### Default roster

| Specialist | File | Always on? |
|---|---|---|
| Visual & styling | `agents/visual-styling.md` | yes |
| UX & interaction | `agents/ux-interaction.md` | yes |
| Copy & labels | `agents/copy-labels.md` | yes |
| Logic & behavior | `agents/logic-behavior.md` | yes |
| Code patterns | `agents/code-patterns.md` | only if user asks, OR if codebase is small enough to scan cheaply |
| Feature parity | `agents/feature-parity.md` | only in `cross-platform` mode |

Code patterns is opt-in because it tends to flood output with low-user-impact noise (naming conventions, file organization). Only run it when the user explicitly cares about code quality, OR when it's likely to be cheap. If you skip it, mention this at the end so the user can ask for it.

### How to invoke each specialist

Use the Task tool. Pass the specialist a prompt that includes:
1. The full content of `agents/<specialist>.md` (read the file, paste into prompt)
2. The mode (`single-app` or `cross-platform`)
3. The scope (which files/dirs to scan)
4. The feature map path (cross-platform only)
5. The output path where they must write their findings JSON: `/tmp/inconsistency-hunter-run/findings-<specialist>.json`

Output schema is defined in `references/output-format.md` — include this in every specialist prompt so findings come back in a consistent shape.

**Don't read the specialist files until you need them.** They're only loaded when you dispatch the relevant agent.

---

## Step 4 — Aggregate and rank

Once specialists finish:

1. Read each `findings-<specialist>.json`.
2. **Deduplicate.** Two specialists may flag the same underlying issue from different angles (e.g., a button that's both visually off AND mislabeled). Merge them into one finding with both lenses listed.
3. **Rank by user impact, not by category.** A `critical` UX bug beats a `high` styling drift. Use this rubric:
   - `critical` — breaks or confuses a core user flow, or makes the app feel broken
   - `high` — user will definitely notice and it erodes trust/polish
   - `medium` — user will notice on close use
   - `low` — only design-team-level nitpicks; include but bottom-rank
4. **Tag findings with platform** in cross-platform mode (which platform has the issue, which is the "reference" if there is one).
5. **Don't pad.** Cut findings that are technically true but no real user would care. The user prefers fewer, high-signal items.

---

## Step 5 — Output

Produce ONE Markdown report with this structure:

```markdown
# Inconsistency report — <app name or platforms>

**Mode:** single-app | cross-platform
**Scope:** <what was scanned>
**Specialists run:** <list>
**Total findings:** <N> (critical: X, high: Y, medium: Z, low: W)

## Top issues (ranked by user impact)

### 1. <Title>
**Severity:** critical
**Category:** UX / Visual / Copy / Logic / Code / Parity
**Where:**
- Platform A: `path/to/file.tsx:42`
- Platform B: `path/to/other.swift:120`
**What's wrong:** <one sentence>
**Why it matters:** <user-visible symptom>
**Evidence:** <short code snippet or screenshot description>
**Suggested fix:** <concrete, minimal, technical>

### 2. <Title>
...

## Skipped
- <specialist not run, why>

## Suggested next steps
- <e.g., "Want me to dig into code patterns next?">
- <e.g., "Want me to draft PRs for the top 3?">
```

End the report with **one direct question** that moves the user to a decision. Examples:
- "Want me to fix the top 3 right now, or run the code-patterns specialist first?"
- "These all look like real bugs to me. Which should I draft a PR for first?"

---

## Working rules

- **No fabrication.** Every finding has a real file path and a real line/snippet. If a specialist can't cite, drop the finding.
- **Be specific about platforms.** Don't say "the button is different" — say "web uses `<Button variant=ghost>` (gray, 12px text), iOS uses `Button(style: .filled)` (blue, 17pt). The web version reads as secondary, the iOS version reads as primary."
- **Don't moralize about code quality.** Catching a real user-visible inconsistency is the win. Code patterns are a sidecar, not the headline.
- **Prefer parallel work.** If you find yourself doing the specialists' jobs yourself, you've defeated the point. Dispatch them.
- **Run order:** recon → fan-out (parallel) → aggregate. Don't loop the specialists; one shot each.
- **State your assumptions.** If you had to guess at a screen mapping or skip a specialist, say so in the report.

---

## Reference files

Load only when you need them.

- `references/output-format.md` — JSON schema specialists must emit
- `agents/visual-styling.md` — visual & styling specialist brief
- `agents/ux-interaction.md` — UX & interaction specialist brief
- `agents/copy-labels.md` — copy & labels specialist brief
- `agents/logic-behavior.md` — logic & behavior specialist brief
- `agents/code-patterns.md` — code patterns specialist brief
- `agents/feature-parity.md` — feature parity specialist brief (cross-platform only)
