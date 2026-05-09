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
