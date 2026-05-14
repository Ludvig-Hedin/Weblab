# Feature Log

Append-only log of significant features, fixes, and edits agents have shipped.
**Newest entries on top.** See `README.md` for what qualifies.

Format:

```
## YYYY-MM-DD — Short Title
Author: <agent / user>
Area: <package / route / system>
Summary: 1-3 sentences on what changed and why.
Files: key paths
Links: changelog / blog / migration / docs
```

---

## 2026-05-13 — Staged Vercel Sandbox runtime provider
Author: Codex
Area: `@weblab/code-provider`, project sandbox runtime
Summary: Added Vercel Sandbox as a second cloud runtime behind
`WEBLAB_CLOUD_PROVIDER`, with branch-level provider metadata and CodeSandbox as
the default rollback path. Vercel editor calls use server-side tRPC proxies,
new Vercel sandboxes snapshot after setup, and unsupported v1 flows keep using
CodeSandbox instead of silently changing framework behavior.
Files: `packages/code-provider/src/providers/vercel-sandbox/index.ts`,
`apps/web/client/src/server/api/routers/project/sandbox.ts`,
`apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts`,
`docs/notes/2026-05-13-vercel-sandbox-provider.md`
Links: `docs/notes/2026-05-13-vercel-sandbox-provider.md`

## 2026-05-13 — Style Panel v3 — UX polish round 3 (5-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 5 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel
Summary: Third polish round from user UX review. Focus rings now
keyboard-only (`FIELD_BASE_CLASSES` switched `focus-within:` →
`has-[:focus-visible]:`; forked select-field/text-field/icon-toggle-field
into v3). Segmented controls got a clear two-tier active state — STRONG
raised pill when the value is an explicit override, QUIET neutral fill
when it's the inherited/computed default; `isSet?` prop threaded from
sections through SegmentedDisplay / IconToggleField / GrowRow /
OverflowRow. Panel horizontal overflow fixed — v3 root `<div>` was a
flex item without `min-w-0`; added `w-full min-w-0 overflow-x-hidden`
through the root→header→ScrollArea chain. TrblGrid per-side mode
redesigned to 4 discrete bordered inputs (was one merged pill) that
shrink to fit at min panel width. Styles tab active-state bug fixed —
`TooltipTrigger` was clobbering Tabs' `data-state`; tab now only
tooltip-wrapped in CODE mode. Alt-click on a property label now resets
the value AND clears the per-element override flag. `useStyleValue`
forked into v3 with robust `isSet` detection — root cause was a
camelCase (`computed`) vs kebab-case (`defined`) key mismatch + missing
shorthand resolution, so the override dot only lit for some props. New
`useStyleBatchSetter` (`setMultiple`) routes multi-property writes
(padding/margin/grow) through `StyleManager.updateMultiple` as ONE undo
entry — fixes panel-side history fragmentation. Persistent cross-session
history flagged as a separate core-engine effort (not done).
Files: style-tab-v3/controls/{constants,select-field,text-field,
icon-toggle-field,segmented-display,number-field,chip-input,shadow-field,
grow-overflow-row,trbl-grid,property-control,property-label,index}.ts(x),
style-tab-v3/hooks/{use-style-value,use-style-setter}.ts,
style-tab-v3/sections/{layout,size,text,styles}.tsx, style-tab-v3/index.tsx,
right-panel/index.tsx

## 2026-05-13 — Style Panel v3 — UX polish round 2 (4-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 4 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Second polish round from user UX review. `TrblGrid` redesigned to
the Figma padding control — 2-button mode switcher (Square = all-sides /
SquareDashed = per-side) + a single connected 4-cell pill with T/R/B/L
labels. `SegmentedDisplay` collapses to icon-only via `@container`
queries when the panel is narrow. `display: none` added to the Display
control; Display icons relogicked (Flex → StretchHorizontal, Grid →
LayoutGrid, Block → Square, None → EyeOff). `GrowOverflowRow` split into
separate `GrowRow` + `OverflowRow` — fixes the overflow/alignment bug;
each renders as its own labeled Size row. New `PropertySearch` at the
panel top — fuzzy search over a ~65-entry property registry, scrolls to
+ opens the target section via `[data-style-property]`. Margin moved out
of Advanced into Layout (directly below Padding). Transitions extracted
from Advanced into its own section, placed after Effects. New Content row
in Text — real text-content write via `frameView.editText` + history push.
Verified all required selectors present + inherited/computed values show
as the active selection across value-bearing controls.
Files: style-tab-v3/controls/{trbl-grid,segmented-display,grow-overflow-row,
property-search,index}.ts(x), style-tab-v3/sections/{layout,size,text,
advanced,transitions}.tsx, style-tab-v3/index.tsx

## 2026-05-13 — Style Panel v3 — UX polish pass (4-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 4 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Polish round on v3 driven by user UX review. Forked `PropertyLabel`,
`PropertyControl`, `constants.ts` into v3 (no longer re-exports of v2):
blue "is set" dot now renders ONLY when set — no gray dot when unset; unset
labels lifted to ~85% visibility; dark-mode field contrast raised (lighter
fill + visible hairline border). `CustomExpander` tinted-card background
removed — expanded rows sit flush in the column. Section header dot only
renders when populated. New `NumberField` replaces the shared
`@weblab/ui/number-input` across all v3 sections — drops the scrub-drag
`cursor-ew-resize` affordance the user disliked; static `cursor-pointer`
unit pill instead. New `ShadowField` — Figma-style `box-shadow` editor
(color swatch + hex + opacity, X/Y/Blur/Spread rows with −/+ steppers),
wired into Effects. Row alignment audited across all sections; `cursor-pointer`
added to clickable affordances; section-level dark-bg overrides removed so
the raised-contrast field tokens win.
Files: style-tab-v3/controls/{constants,property-label,property-control,
custom-expander,number-field,shadow-field,index}.ts(x),
style-tab-v3/sections/*.tsx, style-tab-v3/controls/{trbl-grid,grow-overflow-row}.tsx

## 2026-05-13 — Style Panel v3 (Figma-driven redesign, env-flagged)
Author: Claude (figma-use + impeccable + ux-polish)
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Built a successor to `style-tab-v2` matching the Figma design at
`figma.com/design/Jq0i0XECT9DPqfUdIEl5MY?node-id=202-8418`. New section
order (Element → Position → Layout → Size → Styles → Text → Effects →
Overlays → Cursor → Transforms → Advanced) with a hybrid named-style + Custom
expander model on Text and Effects. v2 stays as the default; v3 ships
behind `NEXT_PUBLIC_STYLE_PANEL_V3` (defaults `false`) — module-scope
dynamic import in `right-panel/index.tsx` swaps which panel renders.
Reuses v2's `StyleManager` pipeline, `useStyleValue` / `useStyleSetter`
hooks, and every shared control via a controls/ barrel re-export, so
undo/redo + AST sync + write-target prefs work unchanged. Seven new
primitives in `style-tab-v3/controls/`: ChipInput, StyleChipPicker,
TrblGrid, SegmentedDisplay, AlignmentToolbar, GrowOverflowRow,
CustomExpander. Mounted in the design-system page under a new
"Style panel v3" group. v2 source frozen at
`docs/archive/style-tab-v2-snapshot/`; full property catalog at
`docs/agent-context/style-panel-v2-inventory.md`.
Files: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3/**,
apps/web/client/src/app/project/[id]/_components/right-panel/index.tsx,
apps/web/client/src/env.ts,
apps/web/client/src/app/design-system/page.tsx,
apps/web/client/src/app/design-system/_components/demos/style-panel-v3.tsx,
docs/agent-context/style-panel-v2-inventory.md,
docs/archive/style-tab-v2-snapshot/**
Links: docs/agent-context/style-panel-v2-inventory.md

## 2026-05-11 — Performance + production-readiness audit
Author: Claude (performance audit)
Area: apps/web/client (landing + editor + tRPC + providers)
Summary: Closed real-prod issues across landing and editor: gated
anonymous-reachable `user.get` / `user.settings.get` / `provider.connectionsList`
calls behind a Supabase auth-cookie heuristic; extracted `parseRepoUrl`
so the `@weblab/parser` bundle no longer leaks into the landing chunk;
added `loading.tsx` + `error.tsx` for `/project/[id]` and a root
`error.tsx`; lazy-loaded editor modals (settings, subscription,
keyboard shortcuts, command/file palettes, project search, CMS dialogs);
disabled React Query `refetchOnWindowFocus`; closed a cross-project
access gap on `userCanvas.get` / `getWithFrames` / `update`; capped
unbounded `comment.list` and `chat.conversation.getAll`. Surfaced the
silent-failure path on `userCanvas.update` instead of swallowing errors.
Files: see `docs/agent-memory/performance-audit.md` for the full list.
Links: docs/agent-memory/performance-audit.md

## 2026-05-11 — Weblab App Figma component library (extracted from code)
Author: Claude (figma-use)
Area: design-system / Figma
Summary: Built a Figma file mirroring the live app component surface from
`packages/ui` and `apps/web/client/src/**`. Foundations are token-bound
(Color collection with Light + Dark modes, Radius, Spacing collections,
text styles, effect styles). All component sets use Figma variants with
`Variant=` / `Size=` / `State=` properties and reference variables —
swap modes at any frame to flip light/dark. Token values pulled from
`packages/ui/src/globals.css`; Tailwind config + button CVA were the
ground truth for type ramps and button heights/radii.
Categories created:
  Foundations · Core UI · Navigation · Feedback + Overlays · Dashboard
  · Editor · AI Chat · Settings + Auth · QA Notes
Counts: 1 file · 10 pages · 3 variable collections (66 color + 8 radius
+ 14 spacing) · 14 text styles · 5 effect styles · ~200 component
variants across 35 component sets, plus 6 example compositions.
Key token decisions:
  - Status semantic tokens (`background-success/warning`,
    `foreground-success/warning`) are kept aliased to blue to match
    today's `globals.css`. Flagged in QA notes as a decision point.
  - Editor canvas surfaces (`bg/canvas`, `bg/chrome`, `bg/bar`,
    `bg/bar-active`, `bg/tab-strip`, `bg/tab-active`) modeled
    explicitly so Editor mockups can use them directly.
  - Radius scale uses xs/sm/md/lg/xl/2xl/3xl/full anchored to
    `--radius = 1rem`.
Missing / deferred (full list on the QA Notes page in Figma):
  - Calendar, color-picker, motion-card, shimmer skeleton animations
  - Streamdown markdown formatting inside AI messages
  - Real icons (placeholders used — swap when wiring Code Connect)
  - Real green/amber palette (currently aliased to blue)
Recommended follow-ups (also captured in QA Notes):
  1. Rename `foreground-quadranary` → `foreground-quaternary`.
  2. Resolve green/amber aliasing in `globals.css`.
  3. Unify the two `alert.tsx` files (`packages/ui` vs `apps/web/client`).
  4. Reconcile `editor-bar/toolbar-button.tsx` with `Button` `toolbar` size.
  5. Migrate landing-page inline color overrides to tokens.
Files: Figma file `Weblab App — Component Library`
  (key `FrhrPDEJ2BAJS6q6oEVRdJ`,
   https://www.figma.com/design/FrhrPDEJ2BAJS6q6oEVRdJ)
Links: source tokens — `apps/web/client/src/styles/globals.css`,
  `packages/ui/src/globals.css`, `packages/ui/tailwind.config.ts`,
  `packages/ui/src/components/button.tsx`

---

## 2026-05-09 — Editor selection state persistence (frame, breakpoint, element)

Author: Claude (agent)
Area: `apps/web/client` — project editor (`src/app/project/[id]/_hooks`, `src/services/editor`)

Summary: Reloading the editor previously dropped the user's selection state (which frame was active, which breakpoint, which element was selected). Now persisted per-project to `localStorage` and restored on `isProjectReady`. Frame restored via `frames.select`; breakpoint applied after so explicit switches win; element restore polls `view.getElementByOid(oid, false)` until the iframe view is ready or a 5s deadline elapses, then gives up silently. Re-persistence runs through MobX `reaction`s with a single debounced flush — concurrent updates merge into one `pendingPatch` to avoid the lost-write race that an ad-hoc `setTimeout` per reaction would create. Restore is keyed by `projectId` (not a boolean ref), so navigating project → project re-arms cleanly. In-flight async element lookups check a `cancelled` flag before mutating editor state to prevent post-unmount `click` calls.

Files:
- `apps/web/client/src/services/editor/state-persistence.ts` (existed; unchanged contract)
- `apps/web/client/src/services/editor/state-persistence.test.ts` (new — 13 tests, `bun:test`)
- `apps/web/client/src/app/project/[id]/_hooks/use-editor-state-persistence.tsx` (new)
- `apps/web/client/src/app/project/[id]/_components/main.tsx` (wired hook)
- `apps/web/client/src/lib/changelog-entries.ts` (v1.6 entry)
- `apps/web/client/src/server/api/routers/user/user.ts` (cleaned typecheck/lint blockers in dirty tree: `avatarUrl` `string | null` coercion, dropped wrong `await` on void `trackEvent`, narrowed `user_metadata` cast to drop `any` chain)

Validation: `bun typecheck` green, `bun x eslint --max-warnings 0` clean for touched files, `bun test src/services/editor/state-persistence.test.ts` 13/13 pass.

Caveat: clicking the restored element triggers BreakpointsManager's auto-flip to that frame's breakpoint, overriding any explicitly-saved breakpoint when both apply. Treated as acceptable — the element is the more specific signal.

Links:
- Changelog: v1.6 in `changelog-entries.ts`

---

## 2026-05-09 — Product explainer video: planning + HyperFrames implementation

Author: Claude (agent)
Area: `apps/web/product-video/` (new), `docs/`

Summary: Planned and implemented the homepage product explainer. Plan doc covers positioning, format, five storyboards, asset plan, and HyperFrames implementation strategy (`docs/product/product-video-plan.md`). Built the chosen storyboard A — "From prompt to polished site" — as a deterministic HyperFrames composition: 75s, 1920×1080, 10 scene sub-comps + captions overlay, brand-faithful product UI recreations using real Weblab tokens (`#131314` bg, `#3d8bfd` accent, Inter, 16px radius). Renders byte-deterministically to a 2.6 MB MP4 via `npx hyperframes render`. Voiceover not generated (no ElevenLabs key in env) — script in `voiceover-script.md`, captions ship without audio. Lint passes 0-error; 210 cosmetic selector warnings + 250 small-label contrast warnings documented as known limitations. Real screen recordings deferred — substituted with stylized HTML/CSS recreations per plan §6.

Files:
- `docs/product/product-video-plan.md`
- `docs/product/product-video-implementation-notes.md`
- `apps/web/product-video/index.html`
- `apps/web/product-video/design.md`
- `apps/web/product-video/voiceover-script.md`
- `apps/web/product-video/compositions/scene-{01..10}-*.html`
- `apps/web/product-video/compositions/captions.html`
- `apps/web/product-video/assets/brand/{logo,symbol,wordmark}.svg`
- `apps/web/product-video/out/weblab-explainer-v1.mp4`

Links: render path `apps/web/product-video/out/weblab-explainer-v1.mp4`

---

## 2026-05-09 — Production QA audit: security hardening + UX fixes

Author: Claude (agent)
Area: `apps/web/client` (chat API, chat input, canvas, invitation router), `packages/ai`, `packages/penpal`

Summary: Multi-batch production QA audit. Fixed invitation router missing authorization on list/delete, token leakage on get (stripped for non-invitees), role escalation guard on invite. Added SSRF guard on CMS adapter URLs via DNS resolution + IP blocklist. Fixed abort signal not being forwarded to `streamText` (wasted GPU tokens on cancelled requests). Fixed stop button hidden when input has content. Fixed canvas wheel handler not bypassing contenteditable elements. Fixed Penpal `PromisifiedPendpalChildMethods` type double-wrapping via `Awaited<ReturnType<...>>`. Fixed `setCmsSelectedCollectionId` compare-before-assign logic bug.

Files:
- `apps/web/client/src/server/api/routers/project/invitation.ts`
- `apps/web/client/src/server/api/routers/cms/adapters/index.ts`
- `apps/web/client/src/app/api/chat/route.ts`
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx`
- `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx`
- `apps/web/client/src/components/store/editor/state/index.ts`
- `packages/ai/src/agents/root.ts`
- `packages/penpal/src/child.ts`

---

## 2026-05-09 — Semantic status tokens (success / warning) + chrome de-hardcoding

Author: Claude (agent)
Area: `packages/ui` design tokens, project editor chrome (left/right panel,
canvas overlay), callback pages, project list cards, marketing landing
mockups.

Summary: Added eight CSS variables — `--foreground-success`,
`--background-success`, `--background-success-secondary`, `--border-success`
plus the `*-warning` quartet — to `packages/ui/src/globals.css` (light + dark)
and exposed Tailwind utilities (`text-foreground-success`,
`bg-background-success[/-secondary]`, `border-success`, etc.) in
`packages/ui/tailwind.config.ts`. Default values alias to the blue palette
because `packages/ui/tokens.ts` already maps green/yellow/teal/amber → blue;
this preserves today's render while giving us a single switch to flip the
entire app's status colors. Then refactored ~30 chrome surfaces from raw
Tailwind palette utilities (`text-green-500`, `bg-amber-500/10`,
`border-yellow-300`, `bg-blue-400`, `outline-teal-400`) and inline hex
literals (`#22c55e`, `#3b82f6`, `#109BFF`, `#181412`, `#1c1c1c`, `#282828`)
to tokens. Documented the new semantic group in the design-system page
(visual + usage block) and inline in `globals.css` with a header comment
covering when to use which token. To switch from blue-aliased to real
green/amber, edit only the eight lines per mode in `globals.css` — no
component code needs to change.

Files: `packages/ui/src/globals.css`, `packages/ui/tailwind.config.ts`,
`apps/web/client/src/app/design-system/page.tsx`, plus chrome refactors
across `apps/web/client/src/app/project/[id]/_components/**`,
`apps/web/client/src/app/projects/_components/select/**`,
`apps/web/client/src/app/callback/{figma,github}/**`,
`apps/web/client/src/app/_components/landing-page/**`,
`apps/web/client/src/components/ui/ai-chat-input-styles.ts`,
`packages/ui/src/components/ai-elements/{tool,web-preview}.tsx`.

---

## 2026-05-09 — Documentation overhaul + agent memory system

Author: Claude (agent)
Area: `docs/agent-context/`, `docs/agent-memory/`, `CLAUDE.md`, `AGENTS.md`
Summary: Audited existing docs, fixed stale package count and router list,
added five new sub-docs (`packages-reference.md`, `trpc-routers-reference.md`,
`routes-reference.md`, `ai-chat-architecture.md`, `cms-architecture.md`,
`breakpoints-architecture.md`), and introduced the `docs/agent-memory/` folder
(`user-preferences.md`, `feature-log.md`, `architecture-decisions.md`) so
agents have persistent, repo-scoped context without bloating the rulebook
files.
Files:
- `docs/agent-context/README.md` (updated index)
- `docs/agent-context/repo-map.md`, `current-progress.md`, `editor-architecture.md`, `data-api-architecture.md` (refreshed)
- `docs/agent-context/packages-reference.md` (new)
- `docs/agent-context/trpc-routers-reference.md` (new)
- `docs/agent-context/routes-reference.md` (new)
- `docs/agent-context/ai-chat-architecture.md` (new)
- `docs/agent-context/cms-architecture.md` (new)
- `docs/agent-context/breakpoints-architecture.md` (new)
- `docs/agent-memory/*` (new folder)
- `CLAUDE.md`, `AGENTS.md` (added memory + read-protocol sections)
Links: n/a (internal docs)

---

## Pre-2026-05-09 — Historical context (not exhaustive)

This log started 2026-05-09; older work is partially recoverable from:

- `apps/web/client/src/lib/changelog-entries.ts` — public changelog
- `docs/*.md` (timestamped working notes)
- Git log

Highlights from `changelog-entries.ts`:

- **2026-05-01 — v1.5 AI Component Generation** — natural-language → typed,
  styled, inserted components.
- **2026-04-01 — v1.4 GitHub Sync** — auto-commit + pull from in-editor.
- **2026-03-01 — v1.3 Component Library** — sidebar shadcn / Radix browser.
- **2026-02-01 — v1.2 Live Collaboration** — multi-user real-time editing.
- **2026-01-01 — v1.1 Weblab Launch** — public release.

Notable in-flight work as of this log's creation (see
`docs/agent-context/current-progress.md`):

- TipTap rich-text AI chat composer with `@`/`/` commands
- CMS workspace
- Responsive frame breakpoints (migration `0029_frame_breakpoints.sql`)
- Framework auto-detection in project creation
- Local CLI bridge for desktop AI providers
- Marketing/SEO expansion (blog redesign, comparison pages, structured data)

---
